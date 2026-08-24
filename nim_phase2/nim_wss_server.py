"""
Nim Phase 2 — WebSocket Seguro (WSS) Server
Puente de comunicación persistente entre Hermes VPS y Nim PC.

Arquitectura:
  - Servidor WebSocket asíncrono (asyncio + websockets)
  - Handshake inicial: Nim PC envía capabilities manifest cifrado
  - Toda mensajería cifrada con NimE2EE (AES-256-GCM)
  - Bridge de tool_calls: Hermes → WSS → Nim PC → ejecución local → WSS → Hermes
  - Soporte multi-dispositivo (registry de clientes conectados)
  - Ping/pong keep-alive cada 30s

Ejecución:
  python nim_wss_server.py                          # ws://localhost:9876 (dev)
  python nim_wss_server.py --ssl-cert cert.pem --ssl-key key.pem  # wss://
"""

import asyncio
import base64
import json
import logging
import os
import signal
import ssl
import sys
import tempfile
import time
import uuid
import wave
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import websockets
from websockets.asyncio.server import ServerConnection

# ─── HTTP client para Hermes API ───
try:
    import httpx
except ImportError:
    httpx = None

# ─── Importa el módulo E2EE (mismo directorio) ───
try:
    from nim_e2ee import NimE2EE
except ImportError:
    # Fallback si se ejecuta desde otro directorio
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "nim_e2ee", Path(__file__).parent / "nim_e2ee.py"
    )
    nim_e2ee = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(nim_e2ee)
    NimE2EE = nim_e2ee.NimE2EE

# ─── Connection Logger ───
try:
    from connection_logger import get_logger, ConnectionLogger
except ImportError:
    from nim_phase2.connection_logger import get_logger, ConnectionLogger

# ─── Logging ───
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [NIM-WSS] %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("nim-wss")

# ─── Data Classes ───


@dataclass
class ClientInfo:
    """Registro de un cliente Nim conectado."""

    client_id: str
    device_type: str  # "windows", "macos", "linux", "android", "ios"
    device_name: str
    capabilities: list[str]  # ["nim_terminal", "nim_filesystem", "nim_browser", ...]
    connected_at: str
    last_seen: str
    websocket: ServerConnection | None = None
    # Historial de conversación para este cliente (formato OpenAI)
    conversation: list[dict[str, Any]] = field(default_factory=list)
    # Cancel token para interrumpir requests en curso
    cancel_event: asyncio.Event | None = None
    # ID de sesión persistente (sobrevive reconexiones)
    session_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "client_id": self.client_id,
            "device_type": self.device_type,
            "device_name": self.device_name,
            "capabilities": self.capabilities,
            "connected_at": self.connected_at,
            "last_seen": self.last_seen,
        }


@dataclass
class PendingToolCall:
    """Tool call pendiente de ejecución en Nim PC."""

    call_id: str
    tool_name: str
    arguments: dict[str, Any]
    client_id: str
    created_at: float
    future: asyncio.Future = field(default_factory=asyncio.Future)


# ─── Servidor Principal ───


class NimWSSServer:
    """Servidor WebSocket seguro para comunicación Hermes ↔ Nim PC."""

    DEFAULT_HOST = "0.0.0.0"
    DEFAULT_PORT = 9876
    HERMES_API = "http://localhost:8642/v1/chat/completions"
    PING_INTERVAL = 30  # segundos
    HANDSHAKE_TIMEOUT = 15  # segundos para completar el handshake
    MAX_CONVERSATION_LENGTH = 30  # mensajes máximo en historial
    BIOMETRIC_THRESHOLD = 0.85  # umbral cosine similarity

    # Skills que se envían al Nim PC al conectar
    NIM_SKILLS = [
        {"id": "nim_terminal", "name": "Terminal PC", "status": "Activa",
         "description": "Ejecuta comandos en la PC del Creador (CMD, PowerShell, Bash)",
         "environment": "PC"},
        {"id": "nim_filesystem", "name": "Archivos PC", "status": "Activa",
         "description": "Lectura y escritura de archivos en la PC local (read/write)",
         "environment": "PC"},
        {"id": "nim_browser", "name": "Navegador PC", "status": "Activa",
         "description": "Controla pestañas, navega, lee y hace clic en Chrome de la PC",
         "environment": "PC"},
        {"id": "nim_patch_file", "name": "Parche de Código", "status": "Activa",
         "description": "Micro-cirugía: reemplaza old_string por new_string sin reescribir todo el archivo",
         "environment": "PC"},
        {"id": "nim_grep_search", "name": "Búsqueda en Código", "status": "Activa",
         "description": "Busca pattern (texto/regex) en archivos del proyecto",
         "environment": "PC"},
        {"id": "nim_list_dir", "name": "Explorador de Proy.", "status": "Activa",
         "description": "Escanea estructura de carpetas (depth default: 1)",
         "environment": "PC"},
        {"id": "nim_file_ops", "name": "File Ops PC", "status": "Activa",
         "description": "Operaciones completas de archivos: move, copy, mkdir, delete, exists, size",
         "environment": "PC"},
        {"id": "nim_code_exec", "name": "Code Exec PC", "status": "Activa",
         "description": "Ejecuta código Python/Node en la PC del Creador (timeout 30s)",
         "environment": "PC"},
        {"id": "nim_checkpoint", "name": "Checkpoints PC", "status": "Activa",
         "description": "Snapshot de archivos en ~/.nim-checkpoints para rollback ante cambios rotos",
         "environment": "PC"},
        {"id": "nim_computer_use", "name": "Computer Use PC", "status": "Activa",
         "description": "Controla la pantalla de la PC: screenshot, click, move, type (PowerShell nativo)",
         "environment": "PC"},
        {"id": "nim_antigravity", "name": "Antigravity CLI (agy)", "status": "Activa",
         "description": "Ejecuta agy --print en la PC (modo no interactivo) — prompts a Antigravity local",
         "environment": "PC"},
        {"id": "voice_biometrics", "name": "Biometría Vocal", "status": "Activa",
         "description": "Verifica identidad del Creador por voz (ECAPA-TDNN)",
         "environment": "VPS"},
        {"id": "web_search", "name": "Búsqueda Web", "status": "Activa",
         "description": "Busca en internet (Tavily + DuckDuckGo)",
         "environment": "VPS"},
        {"id": "holographic_memory", "name": "Memoria Persistente", "status": "Activa",
         "description": "Base de datos FTS5 + vectorial a largo plazo",
         "environment": "VPS"},
        {"id": "code_execution", "name": "Ejecución Python", "status": "Activa",
         "description": "Ejecuta scripts Python en el VPS",
         "environment": "VPS"},
        {"id": "image_gen", "name": "Gen. de Imágenes", "status": "Activa",
         "description": "Crea imágenes con IA en el VPS",
         "environment": "VPS"},
    ]

    def __init__(
        self,
        master_password: str,
        host: str = DEFAULT_HOST,
        port: int = DEFAULT_PORT,
        ssl_cert: str | None = None,
        ssl_key: str | None = None,
        hermes_api_url: str | None = None,
        control_token: str | None = None,
    ):
        self.host = host
        self.port = port
        self.ssl_context = self._build_ssl_context(ssl_cert, ssl_key)
        self.hermes_api_url = hermes_api_url or self.HERMES_API

        # API key del gateway (API server OpenAI-compatible :8642). Sin ella el
        # gateway responde 401 a /v1/chat/completions (Pitfall 6 de nim-auto-mejora).
        self.api_key = os.getenv("API_SERVER_KEY", "")
        if not self.api_key:
            logger.warning("API_SERVER_KEY no configurada — el chat al gateway :8642 fallará con 401")

        # Token de control: el canal de control (dispatch_tool) exige este
        # token compartido. Si no se provee, se lee de NIM_WSS_CONTROL_TOKEN.
        # Si tampoco existe, el canal de control queda DESHABILITADO (fail-closed).
        self.control_token = control_token or os.getenv("NIM_WSS_CONTROL_TOKEN", "")

        # Capa de cifrado
        self.master_password = master_password
        self.e2ee = NimE2EE(master_password)
        self.fingerprint = NimE2EE.verify_key_fingerprint(master_password)

        # Registro de clientes conectados
        self.clients: dict[str, ClientInfo] = {}

        # Conexiones de control (Hermes Agent)
        self.control_clients: dict[str, ServerConnection] = {}

        # Tool calls pendientes en tránsito
        self.pending_calls: dict[str, PendingToolCall] = {}

        # Modelo activo (dinámico, cambiable vía switch_model)
        self.active_model = self._load_active_model()

        # Estado del servidor
        self._server: websockets.WebSocketServer | None = None
        self._running = False

    # ─── SSL ───

    @staticmethod
    def _build_ssl_context(
        cert_path: str | None, key_path: str | None
    ) -> ssl.SSLContext | None:
        """Construye el contexto SSL o retorna None para ws:// plano."""
        if not cert_path or not key_path:
            return None

        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert_path, key_path)
        # En producción, verificar cliente con certificados es opcional
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx

    # ─── Gestión de Clientes ───

    def register_client(self, client_info: ClientInfo) -> None:
        self.clients[client_info.client_id] = client_info
        logger.info(
            f"CLIENTE REGISTRADO: {client_info.device_name} "
            f"({client_info.device_type}) — ID: {client_info.client_id[:8]}... "
            f"Capabilities: {client_info.capabilities}"
        )

    def unregister_client(self, client_id: str) -> None:
        if client_id in self.clients:
            client = self.clients.pop(client_id)
            logger.info(
                f"CLIENTE DESCONECTADO: {client.device_name} — ID: {client_id[:8]}..."
            )

    def get_online_clients(self) -> list[dict[str, Any]]:
        return [c.to_dict() for c in self.clients.values()]

    # ─── Manejo de Conexiones ───

    async def handle_connection(self, websocket: ServerConnection) -> None:
        """Maneja una conexión entrante de Nim PC."""
        client_id = str(uuid.uuid4())
        remote_addr = websocket.remote_address
        conn_log = get_logger()

        # LOG: conexión TCP aceptada
        conn_log.connection_accepted(remote_addr, client_id)
        logger.info(f"NUEVA CONEXIÓN: {remote_addr} — ID asignado: {client_id[:8]}...")

        try:
            # ── FASE 0: Detectar tipo de conexión ──
            # Recibir primer mensaje (puede ser control plaintext o handshake cifrado)
            raw_first_message = await asyncio.wait_for(
                websocket.recv(), timeout=self.HANDSHAKE_TIMEOUT
            )

            # Intentar parsear como control plaintext primero
            try:
                first_msg = json.loads(raw_first_message)
                if first_msg.get("type") == "control_connect":
                    # ── SEGURIDAD: canal de control = dispatch_tool ──
                    # Solo se acepta desde loopback (el plugin corre en el mismo
                    # host que el server) Y con token compartido válido.
                    # Sin estas dos condiciones → rechazar (fail-closed).
                    # remote_addr puede ser tupla ('127.0.0.1', port) u objeto.
                    _host = getattr(remote_addr, "host", None)
                    if _host is None and isinstance(remote_addr, (tuple, list)):
                        _host = remote_addr[0]
                    host_ok = _host in ("127.0.0.1", "::1", "localhost")
                    token = first_msg.get("token", "")
                    token_ok = bool(self.control_token) and token == self.control_token
                    if not host_ok:
                        logger.warning(
                            f"CONTROL RECHAZADO: origen no-loopback {remote_addr} "
                            f"({client_id[:8]}...) — canal de control solo localhost"
                        )
                        await websocket.send(json.dumps({
                            "type": "control_error",
                            "code": "FORBIDDEN",
                            "message": "Control channel: loopback only",
                        }))
                        await websocket.close()
                        return
                    if not token_ok:
                        logger.warning(
                            f"CONTROL RECHAZADO: token inválido/ausente desde "
                            f"{remote_addr} ({client_id[:8]}...)"
                        )
                        await websocket.send(json.dumps({
                            "type": "control_error",
                            "code": "UNAUTHORIZED",
                            "message": "Control channel: invalid token",
                        }))
                        await websocket.close()
                        return
                    # Conexión de control desde Hermes Agent (no cifrada, localhost)
                    conn_log.connection_control(
                        remote_addr, client_id,
                        role=first_msg.get("role", "hermes_agent"),
                        name=first_msg.get("name", "hermes"),
                    )
                    await self.control_loop(websocket, client_id, first_msg)
                    return
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass  # No es plaintext JSON, continuar con handshake E2EE

            # LOG: handshake iniciado (primer mensaje recibido, no es control)
            conn_log.handshake_started(client_id, remote_addr)

            # ── FASE 1: Handshake (el cliente envía su manifiesto de capacidades) ──
            raw_handshake = raw_first_message

            # Descifrar el manifiesto
            try:
                handshake_json = self.e2ee.decrypt_payload(raw_handshake)
                handshake = json.loads(handshake_json)
            except (ValueError, json.JSONDecodeError) as e:
                error_reason = f"Decryption/parse failed: {e}"
                conn_log.handshake_failed(client_id, error_reason, remote_addr)
                logger.error(f"HANDSHAKE FALLIDO ({client_id[:8]}...): {e}")
                await websocket.send(
                    self.e2ee.encrypt_payload(
                        json.dumps(
                            {
                                "type": "error",
                                "code": "HANDSHAKE_FAILED",
                                "message": f"Handshake decryption or parsing failed: {e}",
                            }
                        )
                    )
                )
                return

            # Validar manifiesto
            if handshake.get("type") != "handshake":
                error_reason = f"Invalid type: {handshake.get('type')}"
                conn_log.handshake_failed(client_id, error_reason, remote_addr)
                logger.error(f"HANDSHAKE INVALIDO: {handshake.get('type')}")
                await websocket.send(
                    self.e2ee.encrypt_payload(
                        json.dumps(
                            {
                                "type": "error",
                                "code": "BAD_HANDSHAKE",
                                "message": "First message must be type='handshake'",
                            }
                        )
                    )
                )
                return

            device = handshake.get("device", {})
            device_type = device.get("type", "unknown")
            device_name = device.get("name", f"nim-{client_id[:6]}")
            capabilities = handshake.get("capabilities", [])

            client_info = ClientInfo(
                client_id=client_id,
                device_type=device_type,
                device_name=device_name,
                capabilities=capabilities,
                connected_at=datetime.now(timezone.utc).isoformat(),
                last_seen=datetime.now(timezone.utc).isoformat(),
                websocket=websocket,
            )

            self.register_client(client_info)

            # Responder con ACK
            fingerprint = self.fingerprint
            ack = {
                "type": "handshake_ack",
                "client_id": client_id,
                "key_fingerprint": fingerprint,
                "server_time": datetime.now(timezone.utc).isoformat(),
                "message": f"Conectado. Fingerprint: {fingerprint}",
            }
            await websocket.send(
                self.e2ee.encrypt_payload(json.dumps(ack))
            )

            # LOG: handshake completado
            conn_log.handshake_completed(
                client_id, device_name, device_type, capabilities, fingerprint
            )
            logger.info(f"HANDSHAKE COMPLETADO: {device_name}")

            # ── Enviar skills_update al PC tras handshake ──
            await self._send_skills_update(websocket, client_info)
            conn_log.skills_sent(client_id, len(self.NIM_SKILLS))

            # ── FASE 2: Loop de mensajería principal ──
            await self.message_loop(websocket, client_info)

        except asyncio.TimeoutError:
            conn_log.handshake_timeout(client_id, self.HANDSHAKE_TIMEOUT)
            logger.warning(f"TIMEOUT: Handshake no completado en {self.HANDSHAKE_TIMEOUT}s ({client_id[:8]}...)")
        except websockets.exceptions.ConnectionClosed as e:
            conn_log.disconnected(client_id, "unknown", e.code, str(e.reason) if e.reason else None)
            logger.info(f"CONEXIÓN CERRADA: {client_id[:8]}... — {e.code} {e.reason}")
        except Exception as e:
            conn_log.error(client_id, type(e).__name__, str(e))
            logger.error(f"ERROR ({client_id[:8]}...): {type(e).__name__}: {e}")
        finally:
            self.unregister_client(client_id)

    async def message_loop(
        self, websocket: ServerConnection, client: ClientInfo
    ) -> None:
        """Loop principal de mensajería post-handshake."""
        conn_log = get_logger()

        async def keep_alive():
            """Envía ping cada PING_INTERVAL segundos."""
            while self._running and client.client_id in self.clients:
                await asyncio.sleep(self.PING_INTERVAL)
                try:
                    # Enviar ping cifrado
                    ping_msg = self.e2ee.encrypt_payload(
                        json.dumps({"type": "ping", "ts": time.time()})
                    )
                    await websocket.send(ping_msg)
                    client.last_seen = datetime.now(timezone.utc).isoformat()
                except Exception:
                    break

        keep_alive_task = asyncio.create_task(keep_alive())

        try:
            async for raw_message in websocket:
                if not isinstance(raw_message, str):
                    logger.warning(
                        f"Recibido mensaje binario de {client.device_name}, "
                        f"esperado texto (Base64)"
                    )
                    continue

                # Descifrar
                try:
                    decrypted = self.e2ee.decrypt_payload(raw_message)
                    message = json.loads(decrypted)
                except (ValueError, json.JSONDecodeError) as e:
                    conn_log.message_decrypt_failed(
                        client.client_id, client.device_name, str(e)
                    )
                    logger.error(f"DESCIFRADO FALLIDO ({client.device_name}): {e}")
                    error_resp = self.e2ee.encrypt_payload(
                        json.dumps(
                            {
                                "type": "error",
                                "code": "DECRYPT_FAILED",
                                "message": str(e),
                            }
                        )
                    )
                    await websocket.send(error_resp)
                    continue

                client.last_seen = datetime.now(timezone.utc).isoformat()

                # Despachar según tipo de mensaje
                msg_type = message.get("type", "unknown")

                # LOG: mensaje recibido (solo para tipos relevantes)
                if msg_type not in ("ping", "pong"):
                    conn_log.message_received(
                        client.client_id, client.device_name,
                        msg_type, len(raw_message), details=message
                    )

                logger.debug(
                    f"MENSAJE [{msg_type}] de {client.device_name}: "
                    f"{json.dumps(message, indent=None)[:200]}"
                )

                if msg_type == "tool_result":
                    await self._handle_tool_result(message, client)
                elif msg_type == "user_message":
                    # 🔥 NUEVO: Mensaje de texto del usuario → LLM
                    await self._handle_user_message(message, client, websocket)
                elif msg_type == "user_audio":
                    # 🔥 NUEVO: Audio del usuario → biometría → STT → LLM
                    await self._handle_user_audio(message, client, websocket)
                elif msg_type == "get_models":
                    # 🆕 UI: pedir lista de modelos
                    await self._handle_get_models(websocket, client)
                elif msg_type == "switch_model":
                    # 🆕 UI: cambiar modelo activo
                    await self._handle_switch_model(message, websocket, client)
                elif msg_type == "get_soul":
                    # 🆕 UI: cargar bloques soul (human/persona/task)
                    await self._handle_get_soul(websocket, client)
                elif msg_type == "update_soul":
                    # 🆕 UI: guardar bloque soul
                    await self._handle_update_soul(message, websocket, client)
                elif msg_type == "session_create":
                    # 🔥 NUEVO: crear sesión persistente
                    await self._handle_session_create(message, websocket, client)
                elif msg_type == "session_resume":
                    # 🔥 NUEVO: resumir sesión existente
                    await self._handle_session_resume(message, websocket, client)
                elif msg_type == "session_interrupt":
                    # 🔥 NUEVO: cancelar request en curso
                    await self._handle_session_interrupt(message, websocket, client)
                elif msg_type == "ping":
                    # Responder pong
                    pong = self.e2ee.encrypt_payload(
                        json.dumps({"type": "pong", "ts": time.time()})
                    )
                    await websocket.send(pong)
                elif msg_type == "status":
                    # El cliente reporta su estado
                    logger.info(
                        f"STATUS [{client.device_name}]: {message.get('status')}"
                    )
                else:
                    logger.warning(
                        f"TIPO DE MENSAJE DESCONOCIDO: '{msg_type}' "
                        f"de {client.device_name}"
                    )

        finally:
            keep_alive_task.cancel()
            try:
                await keep_alive_task
            except asyncio.CancelledError:
                pass

    # ─── Control Loop (Hermes Agent → WSS) ───

    async def control_loop(
        self, websocket: ServerConnection, client_id: str, connect_msg: dict
    ) -> None:
        """Loop para conexiones de control desde Hermes Agent (localhost, sin cifrar)."""
        role = connect_msg.get("role", "hermes_agent")
        agent_name = connect_msg.get("name", "hermes")
        self.control_clients[client_id] = websocket
        logger.info(
            f"CONTROL CONNECTED: {agent_name} ({role}) — ID: {client_id[:8]}..."
        )

        # Enviar ACK al plugin
        ack = {
            "type": "control_ack",
            "client_id": client_id,
            "server_fingerprint": self.fingerprint,
            "online_nim_clients": len(self.clients),
            "message": f"Conectado al WSS server. {len(self.clients)} Nim PC(s) online.",
        }
        await websocket.send(json.dumps(ack))

        try:
            async for raw_message in websocket:
                if not isinstance(raw_message, str):
                    continue

                try:
                    message = json.loads(raw_message)
                except json.JSONDecodeError:
                    continue

                msg_type = message.get("type", "unknown")
                logger.debug(f"CONTROL [{msg_type}] de {agent_name}")

                if msg_type == "dispatch_tool":
                    await self._handle_dispatch_tool(websocket, message)
                elif msg_type == "list_clients":
                    clients = self.get_online_clients()
                    await websocket.send(json.dumps({
                        "type": "client_list",
                        "clients": clients,
                    }))
                elif msg_type == "ping":
                    await websocket.send(json.dumps({
                        "type": "pong",
                        "ts": time.time(),
                    }))
                else:
                    logger.warning(f"CONTROL: tipo desconocido '{msg_type}'")

        except websockets.exceptions.ConnectionClosed as e:
            get_logger().control_disconnected(client_id, agent_name, e.code)
            logger.info(f"CONTROL DESCONECTADO: {agent_name} — {e.code}")
        finally:
            self.control_clients.pop(client_id, None)
            logger.info(f"CONTROL REMOVED: {agent_name}")

    async def _handle_dispatch_tool(
        self, websocket: ServerConnection, message: dict
    ) -> None:
        """Despacha un tool_call de Hermes a un Nim PC y devuelve el resultado."""
        call_id = message.get("call_id", "unknown")
        target_client_id = message.get("client_id")
        tool_name = message.get("tool_name", "unknown")
        arguments = message.get("arguments", {})
        timeout = message.get("timeout", 30.0)

        # Si no se especifica client_id, usar el primer cliente conectado
        if not target_client_id:
            if not self.clients:
                await websocket.send(json.dumps({
                    "type": "dispatch_result",
                    "call_id": call_id,
                    "status": "error",
                    "error": "No hay Nim PCs conectados",
                }))
                return
            target_client_id = next(iter(self.clients.keys()))

        logger.info(
            f"DISPATCH: {tool_name}(...) → client={target_client_id[:8]}..."
        )

        try:
            result = await self.dispatch_tool_call(
                target_client_id, tool_name, arguments, timeout=timeout
            )
            get_logger().dispatch_tool(call_id, tool_name, target_client_id, "ok")
            await websocket.send(json.dumps({
                "type": "dispatch_result",
                "call_id": call_id,
                "status": "ok",
                "result": result,
            }))
        except asyncio.TimeoutError:
            get_logger().dispatch_tool(call_id, tool_name, target_client_id, "timeout", f"Timeout after {timeout}s")
            await websocket.send(json.dumps({
                "type": "dispatch_result",
                "call_id": call_id,
                "status": "timeout",
                "error": f"Timeout after {timeout}s",
            }))
        except (ValueError, ConnectionError) as e:
            get_logger().dispatch_tool(call_id, tool_name, target_client_id, "error", str(e))
            await websocket.send(json.dumps({
                "type": "dispatch_result",
                "call_id": call_id,
                "status": "error",
                "error": str(e),
            }))

    # ─── Despacho de Tool Calls ───

    async def dispatch_tool_call(
        self, client_id: str, tool_name: str, arguments: dict[str, Any], timeout: float = 30.0
    ) -> dict[str, Any]:
        """
        Envía un tool_call al cliente Nim PC y espera el resultado.

        Args:
            client_id: ID del cliente objetivo
            tool_name: Nombre de la herramienta (ej. "nim_terminal")
            arguments: Argumentos de la herramienta
            timeout: Timeout máximo de espera en segundos

        Returns:
            Dict con el resultado de la herramienta

        Raises:
            ValueError: Cliente no encontrado
            asyncio.TimeoutError: Timeout esperando resultado
        """
        if client_id not in self.clients:
            raise ValueError(f"Client '{client_id}' not connected")

        client = self.clients[client_id]
        call_id = f"nim_call_{uuid.uuid4().hex[:12]}"

        # Crear entrada de tool call pendiente
        future: asyncio.Future = asyncio.get_event_loop().create_future()
        self.pending_calls[call_id] = PendingToolCall(
            call_id=call_id,
            tool_name=tool_name,
            arguments=arguments,
            client_id=client_id,
            created_at=time.time(),
            future=future,
        )

        # Enviar tool_call cifrado al cliente
        tool_call_msg = {
            "type": "tool_call",
            "call_id": call_id,
            "tool_name": tool_name,
            "arguments": arguments,
        }
        encrypted = self.e2ee.encrypt_payload(json.dumps(tool_call_msg))

        try:
            await client.websocket.send(encrypted)
            logger.info(f"TOOL_CALL → {client.device_name}: {tool_name}({arguments})")
        except Exception as e:
            del self.pending_calls[call_id]
            raise ConnectionError(f"Failed to send tool_call to {client.device_name}: {e}") from e

        # Esperar resultado
        try:
            result = await asyncio.wait_for(future, timeout=timeout)
            return result
        except asyncio.TimeoutError:
            del self.pending_calls[call_id]
            raise asyncio.TimeoutError(
                f"Tool call '{tool_name}' timed out after {timeout}s"
            )

    async def _handle_tool_result(
        self, message: dict[str, Any], client: ClientInfo
    ) -> None:
        """Procesa un tool_result recibido de Nim PC."""
        call_id = message.get("call_id")
        if call_id and call_id in self.pending_calls:
            pending = self.pending_calls.pop(call_id)
            result = message.get("result", message.get("error", {}))
            elapsed = time.time() - pending.created_at
            logger.info(
                f"TOOL_RESULT ← {client.device_name}: "
                f"{pending.tool_name}(...) — {elapsed:.2f}s"
            )
            if not pending.future.done():
                pending.future.set_result(result)
        else:
            # Tool result para un call que no está pendiente (posible reconexión)
            logger.warning(
                f"TOOL_RESULT huérfano: call_id={call_id} "
                f"de {client.device_name}"
            )

    # ─── Chat Integration (Fase 2.3-2.4: Nim PC → Hermes LLM → Nim PC) ───

    async def _send_skills_update(
        self, websocket: ServerConnection, client: ClientInfo
    ) -> None:
        """Envía la lista de habilidades al PC tras el handshake."""
        skills_msg = {
            "type": "skills_update",
            "skills": self.NIM_SKILLS,
        }
        encrypted = self.e2ee.encrypt_payload(json.dumps(skills_msg))
        await websocket.send(encrypted)
        logger.info(f"SKILLS_UPDATE enviado a {client.device_name}: {len(self.NIM_SKILLS)} skills")

    async def _send_event(
        self, websocket: ServerConnection, event: dict
    ) -> None:
        """Envía un evento JSON cifrado al Nim PC."""
        encrypted = self.e2ee.encrypt_payload(json.dumps(event))
        await websocket.send(encrypted)

    async def _send_bot_message(
        self,
        websocket: ServerConnection,
        client: ClientInfo,
        text: str,
        bot_state: str = "idle",
    ) -> None:
        """Envía una respuesta del LLM al Nim PC con estado del orbe."""
        bot_msg = {
            "type": "bot_message",
            "text": text,
            "bot_state": bot_state,
        }
        encrypted = self.e2ee.encrypt_payload(json.dumps(bot_msg))
        await websocket.send(encrypted)

        # LOG: mensaje enviado
        get_logger().message_sent(
            client.client_id, client.device_name, "bot_message",
            details={"bot_state": bot_state, "text": text}
        )
        logger.info(
            f"BOT_MESSAGE → {client.device_name}: "
            f"state={bot_state}, text_len={len(text)}"
        )

    async def _handle_user_message(
        self,
        message: dict,
        client: ClientInfo,
        websocket: ServerConnection,
    ) -> None:
        """Procesa un mensaje de texto del usuario con streaming SSE."""
        text = message.get("text", "").strip()
        if not text:
            await self._send_bot_message(
                websocket, client, "No entendí el mensaje (vacío).", "idle"
            )
            return

        logger.info(f"USER_MSG ← {client.device_name}: \"{text[:80]}...\"")

        # Crear cancel token para esta request
        client.cancel_event = asyncio.Event()

        # Notificar inicio de streaming
        await self._send_event(websocket, {
            "type": "message_start",
            "session_id": client.session_id or client.client_id,
        })
        get_logger().message_sent(
            client.client_id, client.device_name, "message_start",
            details={"session_id": client.session_id or client.client_id}
        )

        try:
            # Streaming SSE → message_delta × N
            full_text = await self._stream_hermes_api(client, text, websocket)

            # Notificar completado (streaming format)
            await self._send_event(websocket, {
                "type": "message_complete",
                "text": full_text,
                "session_id": client.session_id or client.client_id,
            })
            get_logger().message_sent(
                client.client_id, client.device_name, "message_complete",
                details={"text": full_text, "interrupted": False}
            )

            # FALLBACK: también enviar bot_message para apps que no soportan streaming
            await self._send_bot_message(websocket, client, full_text, "speaking")
            # Luego idle después de 500ms
            await asyncio.sleep(0.5)
            await self._send_bot_message(websocket, client, "", "idle")

        except asyncio.CancelledError:
            await self._send_event(websocket, {
                "type": "message_complete",
                "text": "[Interrumpido]",
                "interrupted": True,
            })
            get_logger().message_sent(
                client.client_id, client.device_name, "message_complete",
                details={"text": "[Interrumpido]", "interrupted": True}
            )
        except Exception as e:
            logger.error(f"LLM ERROR para {client.device_name}: {e}")
            await self._send_event(websocket, {
                "type": "error",
                "message": f"Error al procesar tu mensaje: {e}",
            })
        finally:
            client.cancel_event = None

    async def _handle_user_audio(
        self,
        message: dict,
        client: ClientInfo,
        websocket: ServerConnection,
    ) -> None:
        """Procesa audio del usuario: biometría → STT → LLM."""
        audio_b64 = message.get("audio_base64", "")
        sample_rate = message.get("sample_rate", 16000)

        if not audio_b64:
            await self._send_bot_message(
                websocket, client, "No recibí datos de audio.", "idle"
            )
            return

        logger.info(
            f"USER_AUDIO ← {client.device_name}: "
            f"sample_rate={sample_rate}, base64_len={len(audio_b64)}"
        )

        # Notificar al PC
        await self._send_bot_message(
            websocket, client, "", "thinking"
        )

        try:
            # ── 1. Decodificar Base64 → archivo WAV temporal ──
            audio_bytes = base64.b64decode(audio_b64)
            wav_path = None
            with tempfile.NamedTemporaryFile(
                suffix=".wav", delete=False
            ) as tmp:
                tmp.write(audio_bytes)
                wav_path = tmp.name

            try:
                # ── 2. Verificar biometría vocal ──
                biometry_ok = await self._verify_voice(wav_path)
                if not biometry_ok:
                    await self._send_bot_message(
                        websocket, client,
                        "Identidad vocal no reconocida. Acceso denegado.",
                        "idle",
                    )
                    return

                # ── 3. Transcribir audio → texto ──
                user_text = await self._transcribe_audio(wav_path, sample_rate)

                if not user_text or not user_text.strip():
                    await self._send_bot_message(
                        websocket, client,
                        "No pude transcribir el audio. ¿Puedes intentar de nuevo?",
                        "idle",
                    )
                    return

                logger.info(
                    f"AUDIO TRANSCRITO ({client.device_name}): \"{user_text[:80]}...\""
                )

                # ── 4. Enviar texto al LLM ──
                response_text = await self._call_hermes_api(client, user_text)
                await self._send_bot_message(
                    websocket, client, response_text, "speaking"
                )
                await asyncio.sleep(0.5)
                await self._send_bot_message(
                    websocket, client, "", "idle"
                )

            finally:
                # Limpiar archivo temporal
                if wav_path:
                    try:
                        Path(wav_path).unlink(missing_ok=True)
                    except Exception:
                        pass

        except Exception as e:
            logger.error(f"AUDIO ERROR para {client.device_name}: {e}")
            await self._send_bot_message(
                websocket, client,
                f"Error procesando audio: {e}", "idle"
            )

    async def _call_hermes_api(
        self, client: ClientInfo, user_text: str
    ) -> str:
        """Llama al Hermes API (LLM) con el historial de conversación del cliente.
        DEPRECATED — usar _stream_hermes_api para streaming."""
        if httpx is None:
            return (
                f"[Hermes LLM no disponible — httpx no instalado]\n\n"
                f"Recibí tu mensaje: \"{user_text[:100]}\"\n\n"
                f"Instala httpx para habilitar el LLM: pip install httpx"
            )

        if not client.conversation:
            client.conversation.append({
                "role": "system",
                "content": self._build_nim_system_prompt(client),
            })

        client.conversation.append({"role": "user", "content": user_text})
        self._trim_conversation(client)

        async with httpx.AsyncClient(timeout=60.0) as http:
            try:
                headers = {}
                if self.api_key:
                    headers["Authorization"] = f"Bearer {self.api_key}"
                resp = await http.post(
                    self.hermes_api_url,
                    headers=headers,
                    json={
                        "model": self.active_model,
                        "messages": client.conversation,
                        "stream": False,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                reply = (
                    data.get("choices", [{}])[0]
                    .get("message", {})
                    .get("content", "")
                )

                if not reply:
                    reply = "[Sin respuesta del LLM]"

                client.conversation.append({"role": "assistant", "content": reply})
                return reply

            except httpx.HTTPStatusError as e:
                logger.error(f"API HTTP error: {e.response.status_code} {e.response.text[:200]}")
                raise
            except Exception as e:
                logger.error(f"API error: {e}")
                raise

    async def _stream_hermes_api(
        self, client: ClientInfo, user_text: str, websocket: ServerConnection
    ) -> str:
        """Llama al Hermes API con streaming SSE y envía message.delta por WSS.

        Yields deltas en tiempo real al Nim PC via message.delta.
        Retorna el texto completo al finalizar.
        """
        if httpx is None:
            return await self._call_hermes_api(client, user_text)

        self._ensure_conversation(client)
        client.conversation.append({"role": "user", "content": user_text})
        self._trim_conversation(client)

        full_text = ""

        async with httpx.AsyncClient(timeout=120.0) as http:
            try:
                headers = {}
                if self.api_key:
                    headers["Authorization"] = f"Bearer {self.api_key}"
                async with http.stream(
                    "POST",
                    self.hermes_api_url,
                    headers=headers,
                    json={
                        "model": self.active_model,
                        "messages": client.conversation,
                        "stream": True,
                    },
                ) as resp:
                    resp.raise_for_status()

                    async for line in resp.aiter_lines():
                        # Verificar cancelación
                        if client.cancel_event and client.cancel_event.is_set():
                            logger.info(f"STREAM CANCELADO por interrupt ({client.device_name})")
                            break

                        if not line or not line.startswith("data: "):
                            continue

                        data_str = line[6:]  # strip "data: "
                        if data_str.strip() == "[DONE]":
                            break

                        try:
                            chunk = json.loads(data_str)
                            delta = (
                                chunk.get("choices", [{}])[0]
                                .get("delta", {})
                                .get("content", "")
                            )
                            if delta:
                                full_text += delta
                                # Enviar delta al Nim PC en tiempo real
                                delta_msg = {
                                    "type": "message_delta",
                                    "text": delta,
                                }
                                encrypted = self.e2ee.encrypt_payload(
                                    json.dumps(delta_msg)
                                )
                                await websocket.send(encrypted)
                        except (json.JSONDecodeError, KeyError):
                            continue

            except httpx.HTTPStatusError as e:
                logger.error(f"API HTTP error: {e.response.status_code}")
                raise
            except Exception as e:
                logger.error(f"Stream API error: {e}")
                raise

        if not full_text:
            full_text = "[Sin respuesta del LLM]"

        client.conversation.append({"role": "assistant", "content": full_text})
        return full_text

    def _build_nim_system_prompt(self, client: ClientInfo) -> str:
        """Construye el system prompt omnicanal para Nim PC."""
        return (
            "Eres NIM, el asistente agéntico omnicanal del Creador (Oscar).\n\n"
            "══════════════ TOPOLOGÍA ACTUAL ══════════════\n"
            "Estás sirviendo al Creador a través del cliente 'Nim PC' "
            f"({client.device_type}, {client.device_name}).\n"
            "El Creador te habla desde su PC personal conectada por WebSocket E2EE.\n\n"
            "🏠 TU CUERPO (VPS Linux):\n"
            "  • Razonamiento lógico y LLM\n"
            "  • APIs externas: web_search, image_gen\n"
            "  • Memoria persistente: Holographic (FTS5 + vectorial)\n"
            "  • Ejecución de código Python en el VPS: code_execution\n"
            "  • MENSAJERÍA: send_message — puedes enviar mensajes a Telegram,\n"
            "    Discord, y otras plataformas. Si el Creador te pide 'envíame\n"
            "    esto por Telegram', USA send_message SIN EXCUSA.\n\n"
            "💻 LA PC DEL CREADOR (Windows, conectada por WSS):\n"
            "  • nim_terminal: PowerShell/CMD en la PC local\n"
            "  • nim_filesystem: Archivos y carpetas de la PC local\n"
            "  • nim_browser: Chrome del Creador en la PC local\n\n"
            "═══════════ OMNICANAL ═══════════\n"
            "Eres el MISMO Hermes sin importar por dónde te hablen.\n"
            "TODAS tus herramientas están disponibles en TODOS los canales.\n"
            "Si el Creador te pide algo por Nim PC, puedes responder por aquí,\n"
            "por Telegram, o por donde sea necesario. NO estás 'atrapado'\n"
            "en un canal — eres omnicanal.\n\n"
            "═══════════ REGLAS DE ORO ═══════════\n"
            "1. SIEMPRE responde en español, con personalidad cálida.\n"
            "2. SI el Creador pide interactuar con archivos, carpetas, "
            "programas, configuración del sistema, o CUALQUIER acción local → "
            "usa EXCLUSIVAMENTE nim_terminal (PowerShell/CMD) y nim_filesystem.\n"
            "3. NUNCA uses tus herramientas nativas de terminal Linux del VPS "
            "para tareas del PC del Creador. Si el Creador dice 'revisa mis "
            "descargas', usa nim_filesystem o nim_terminal, NO tu terminal VPS.\n"
            "4. SOLO usa tus herramientas VPS (web_search, code_execution, "
            "image_gen, send_message) cuando la tarea requiera APIs externas, "
            "búsquedas, mensajería, o generación de contenido.\n"
            "5. Si el Creador dice explícitamente 'en el servidor' o "
            "'en el VPS', entonces sí puedes usar tus herramientas nativas.\n"
            "6. Ante la duda, PREGUNTA: '¿Quieres que ejecute esto en tu PC "
            "local o en el servidor VPS?'\n"
            "7. SIEMPRE confirma acciones destructivas antes de ejecutar.\n"
            "8. SI el Creador te pide enviar algo por Telegram, Discord, etc., "
            "USA send_message. NUNCA digas 'no tengo forma' o 'no está "
            "configurado'. SÍ puedes.\n"
            "═══════════ USO CORRECTO DE TOOLS PC (CRÍTICO) ═══════════\n"
            "• nim_terminal: comando SIMPLE (dir, whoami, echo, hostname). "
            "NUNCA uses 'cmd /c' como prefijo ni comillas compuestas — se "
            "cuelga y el dispatch expira a los 30s. SIEMPRE incluye cwd con "
            "ruta absoluta de Windows (ej. C:\\Users\\<usuario>\\Downloads). "
            "Sin cwd el comando falla con error os 123.\n"
            "• nim_list_dir: PREFERIDA para explorar carpetas (ej. path="
            "C:\\Users\\<usuario>\\Downloads, depth=1). Más rápida y "
            "confiable que nim_terminal para listar.\n"
            "• nim_filesystem: solo read/write de archivos (action=read|write).\n"
            "• Si una tool tarda más de 15s, NO la reintentes con el mismo "
            "comando — cambia de approach o informa al Creador.\n"
            "• Para 'revisa mis descargas': usa nim_list_dir con "
            "path=C:\\Users\\<usuario>\\Downloads (o nim_terminal dir con cwd).\n"
        )

    def _ensure_conversation(self, client: ClientInfo) -> None:
        """Asegura que el cliente tenga system prompt en su conversación."""
        if not client.conversation:
            client.conversation.append({
                "role": "system",
                "content": self._build_nim_system_prompt(client),
            })

    def _trim_conversation(self, client: ClientInfo) -> None:
        """Limita el tamaño del historial de conversación."""
        if len(client.conversation) > self.MAX_CONVERSATION_LENGTH:
            system_msgs = [m for m in client.conversation if m["role"] == "system"]
            other_msgs = [m for m in client.conversation if m["role"] != "system"]
            client.conversation = system_msgs + other_msgs[
                -(self.MAX_CONVERSATION_LENGTH - len(system_msgs)):
            ]

    async def _verify_voice(self, wav_path: str) -> bool:
        """Verifica la identidad vocal usando voice_biometrics.py."""
        try:
            from voice_biometrics import VoiceBiometrics

            vb = VoiceBiometrics()
            # La huella se carga automáticamente en __init__ si existe
            if vb._master_voiceprint is None:
                logger.warning("No hay huella vocal maestra — permitiendo acceso")
                return True

            result = vb.verify(wav_path)
            similarity = result.get("similarity", 0.0)

            logger.info(f"BIOMETRÍA: similarity={similarity:.3f}, threshold={self.BIOMETRIC_THRESHOLD}")

            if similarity >= self.BIOMETRIC_THRESHOLD:
                logger.info("BIOMETRÍA: ACCESO CONCEDIDO ✓")
                return True
            else:
                logger.warning(f"BIOMETRÍA: ACCESO DENEGADO ✗ (similarity={similarity:.3f})")
                return False

        except ImportError as e:
            logger.warning(f"voice_biometrics no disponible ({e}) — permitiendo acceso")
            return True  # Si no hay biometría, permitir (no bloquear al usuario)
        except Exception as e:
            logger.error(f"Error en biometría: {e}")
            return True  # Fail-open si hay error

    async def _transcribe_audio(
        self, wav_path: str, sample_rate: int = 16000
    ) -> str:
        """Transcribe audio a texto usando Whisper o fallback."""
        try:
            import whisper

            # Intentar cargar modelo (tiny para velocidad)
            model = whisper.load_model("tiny")
            result = model.transcribe(wav_path, language="es")
            return result.get("text", "").strip()

        except ImportError:
            logger.warning("whisper no instalado — usa 'pip install openai-whisper'")
            return "[STT no disponible: instala openai-whisper]"
        except Exception as e:
            logger.error(f"Error en transcripción: {e}")
            return f"[Error de transcripción: {e}]"

    # ─── Session Management ───

    # Almacén de sesiones por session_id (sobrevive desconexiones)
    _sessions: dict[str, dict[str, Any]] = {}

    async def _handle_session_create(
        self, message: dict, websocket: ServerConnection, client: ClientInfo
    ) -> None:
        """Crea una sesión persistente y devuelve el session_id."""
        sid = message.get("session_id") or str(uuid.uuid4())
        client.session_id = sid
        client.conversation = []  # Fresh start

        self._sessions[sid] = {
            "session_id": sid,
            "device_name": client.device_name,
            "device_type": client.device_type,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        logger.info(f"SESSION CREATE: {sid[:8]}... para {client.device_name}")
        await self._send_event(websocket, {
            "type": "session_created",
            "session_id": sid,
        })

    async def _handle_session_resume(
        self, message: dict, websocket: ServerConnection, client: ClientInfo
    ) -> None:
        """Resume una sesión existente por session_id."""
        sid = message.get("session_id", "")
        if not sid:
            await self._send_event(websocket, {
                "type": "error",
                "message": "session_id requerido para resume",
            })
            return

        if sid in self._sessions:
            client.session_id = sid
            logger.info(f"SESSION RESUME: {sid[:8]}... para {client.device_name}")
            await self._send_event(websocket, {
                "type": "session_resumed",
                "session_id": sid,
                "message_count": len(client.conversation),
            })
        else:
            # Sesión no encontrada — crear nueva
            await self._handle_session_create(message, websocket, client)

    async def _handle_session_interrupt(
        self, message: dict, websocket: ServerConnection, client: ClientInfo
    ) -> None:
        """Cancela la request en curso para este cliente."""
        if client.cancel_event:
            client.cancel_event.set()
            logger.info(f"INTERRUPT: {client.device_name}")
            await self._send_event(websocket, {
                "type": "interrupted",
                "message": "Request cancelada",
            })
        else:
            await self._send_event(websocket, {
                "type": "interrupted",
                "message": "No hay request activa para cancelar",
            })

    # ─── UI Actions: Modelos + Soul (Fase 5: Enrutamiento UI ↔ WSS) ───

    # Catálogo de modelos conocidos (sincronizado con el dashboard)
    KNOWN_MODELS: list[dict[str, Any]] = [
        {"id": "deepseek-v4-pro", "name": "DeepSeek V4 Pro", "provider": "deepseek"},
        {"id": "deepseek-v4-flash", "name": "DeepSeek V4 Flash", "provider": "deepseek"},
        {"id": "deepseek-v3", "name": "DeepSeek V3", "provider": "deepseek"},
        {"id": "deepseek-r1", "name": "DeepSeek R1", "provider": "deepseek"},
        {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "provider": "google"},
        {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "provider": "google"},
        {"id": "gemini-3.5-flash", "name": "Gemini 3.5 Flash", "provider": "google"},
        {"id": "claude-sonnet-4", "name": "Claude Sonnet 4", "provider": "anthropic"},
        {"id": "claude-opus-4", "name": "Claude Opus 4", "provider": "anthropic"},
        {"id": "gpt-4o", "name": "GPT-4o", "provider": "openai"},
        {"id": "gpt-4.1", "name": "GPT-4.1", "provider": "openai"},
        {"id": "grok-3", "name": "Grok 3", "provider": "xai"},
        {"id": "mistral-large", "name": "Mistral Large", "provider": "mistral"},
        {"id": "command-r-plus", "name": "Command R+", "provider": "cohere"},
        {"id": "llama-4-maverick", "name": "Llama 4 Maverick", "provider": "meta"},
    ]

    MODEL_PREFS_PATH = Path("/home/clawd/nim-hermes-frontend/.hermes-model-prefs.json")
    CUSTOM_MODELS_PATH = Path("/home/clawd/nim-hermes-frontend/.hermes-custom-models.json")
    SOUL_DIR = Path("/home/clawd/nim-hermes-frontend")

    SOUL_FILES = {
        "human": "SOUL.md",
        "persona": "AGENT.md",
        "task": "AGENTS.md",
    }

    def _load_active_model(self) -> str:
        """Carga el modelo activo desde el archivo de preferencias."""
        try:
            if self.MODEL_PREFS_PATH.exists():
                prefs = json.loads(self.MODEL_PREFS_PATH.read_text())
                return prefs.get("active", "deepseek-v4-pro")
        except Exception:
            pass
        return "deepseek-v4-pro"

    def _save_active_model(self, model_id: str) -> None:
        """Guarda el modelo activo en el archivo de preferencias."""
        try:
            prefs = {}
            if self.MODEL_PREFS_PATH.exists():
                prefs = json.loads(self.MODEL_PREFS_PATH.read_text())
            prefs["active"] = model_id
            self.MODEL_PREFS_PATH.write_text(json.dumps(prefs, indent=2))
            self.active_model = model_id
            logger.info(f"MODELO CAMBIADO: {model_id}")
        except Exception as e:
            logger.error(f"Error guardando modelo activo: {e}")

    def _build_models_list(self) -> list[dict]:
        """Construye la lista completa de modelos con el activo marcado."""
        models = []
        seen_ids = {m["id"] for m in self.KNOWN_MODELS}

        # Agregar modelos built-in
        for m in self.KNOWN_MODELS:
            models.append({**m, "active": m["id"] == self.active_model})

        # Agregar modelos custom
        try:
            if self.CUSTOM_MODELS_PATH.exists():
                customs = json.loads(self.CUSTOM_MODELS_PATH.read_text())
                if isinstance(customs, list):
                    for c in customs:
                        cid = c.get("id", "")
                        if cid and cid not in seen_ids:
                            models.append({
                                "id": cid,
                                "name": c.get("name", cid),
                                "provider": c.get("provider", "custom"),
                                "active": cid == self.active_model,
                            })
                            seen_ids.add(cid)
        except Exception:
            pass

        return models

    async def _handle_get_models(
        self, websocket: ServerConnection, client: ClientInfo
    ) -> None:
        """Devuelve la lista de modelos disponibles."""
        models = self._build_models_list()
        response = {
            "type": "models_list",
            "models": models,
        }
        encrypted = self.e2ee.encrypt_payload(json.dumps(response))
        await websocket.send(encrypted)
        logger.info(f"MODELS_LIST → {client.device_name}: {len(models)} modelos, activo={self.active_model}")

    async def _handle_switch_model(
        self, message: dict, websocket: ServerConnection, client: ClientInfo
    ) -> None:
        """Cambia el modelo activo y responde con lista actualizada."""
        model_id = message.get("modelId", "")
        if not model_id:
            await self._send_bot_message(
                websocket, client, "Error: modelId requerido", "idle"
            )
            return

        # Verificar que el modelo existe
        known_ids = {m["id"] for m in self._build_models_list()}
        if model_id not in known_ids:
            await self._send_bot_message(
                websocket, client,
                f"Modelo '{model_id}' no encontrado. Modelos disponibles: {', '.join(sorted(known_ids))}",
                "idle",
            )
            return

        # Guardar y aplicar
        self._save_active_model(model_id)

        # Limpiar historial de conversación (nuevo modelo = nueva conversación)
        client.conversation = []

        # Responder con lista actualizada
        models = self._build_models_list()
        response = {
            "type": "models_list",
            "models": models,
        }
        encrypted = self.e2ee.encrypt_payload(json.dumps(response))
        await websocket.send(encrypted)
        logger.info(f"MODEL SWITCH → {client.device_name}: {model_id}")

    async def _handle_get_soul(
        self, websocket: ServerConnection, client: ClientInfo
    ) -> None:
        """Devuelve el contenido de los bloques soul (human/persona/task)."""
        soul_data = {}
        for block, filename in self.SOUL_FILES.items():
            filepath = self.SOUL_DIR / filename
            try:
                if filepath.exists():
                    soul_data[f"{block}Block"] = filepath.read_text(encoding="utf-8")
                else:
                    soul_data[f"{block}Block"] = ""
            except Exception as e:
                logger.error(f"Error leyendo {filename}: {e}")
                soul_data[f"{block}Block"] = ""

        response = {"type": "soul_data", **soul_data}
        encrypted = self.e2ee.encrypt_payload(json.dumps(response))
        await websocket.send(encrypted)
        logger.info(f"SOUL_DATA → {client.device_name}: {len(soul_data)} bloques")

    async def _handle_update_soul(
        self, message: dict, websocket: ServerConnection, client: ClientInfo
    ) -> None:
        """Guarda un bloque soul (human/persona/task) en el archivo correspondiente."""
        block = message.get("block", "")
        content = message.get("content", "")

        if block not in self.SOUL_FILES:
            await self._send_bot_message(
                websocket, client,
                f"Bloque '{block}' no válido. Usa: human, persona, task",
                "idle",
            )
            return

        filename = self.SOUL_FILES[block]
        filepath = self.SOUL_DIR / filename

        try:
            filepath.write_text(content, encoding="utf-8")
            logger.info(f"SOUL ACTUALIZADO: {filename} ({len(content)} chars)")
            await self._send_bot_message(
                websocket, client,
                f"✅ Memoria '{block}' actualizada correctamente.",
                "idle",
            )
        except Exception as e:
            logger.error(f"Error guardando {filename}: {e}")
            await self._send_bot_message(
                websocket, client,
                f"❌ Error al guardar: {e}",
                "idle",
            )

    # ─── Ciclo de Vida del Servidor ───

    async def start(self) -> None:
        """Inicia el servidor WebSocket."""
        protocol = "wss" if self.ssl_context else "ws"
        logger.info(
            f"INICIANDO SERVIDOR NIM WSS: {protocol}://{self.host}:{self.port}"
        )
        logger.info(f"Fingerprint de llave: {self.fingerprint}")

        self._running = True
        self._server = await websockets.serve(
            self.handle_connection,
            self.host,
            self.port,
            ssl=self.ssl_context,
            # Configuraciones adicionales
            ping_interval=None,  # Manejamos ping/pong a nivel aplicación
            close_timeout=5,
        )

        logger.info(f"SERVIDOR ACTIVO en {protocol}://{self.host}:{self.port}")

        # Esperar hasta que se detenga
        await self._server.wait_closed()

    async def stop(self) -> None:
        """Detiene el servidor WebSocket."""
        logger.info("DETENIENDO servidor Nim WSS...")
        self._running = False

        # Cerrar todas las conexiones activas (Nim PCs)
        for client_id, client in list(self.clients.items()):
            try:
                await client.websocket.close(1001, "Server shutting down")
            except Exception:
                pass

        # Cerrar conexiones de control (Hermes Agent)
        for ctrl_id, ctrl_ws in list(self.control_clients.items()):
            try:
                await ctrl_ws.close(1001, "Server shutting down")
            except Exception:
                pass

        if self._server:
            self._server.close()
            await self._server.wait_closed()

        logger.info("SERVIDOR DETENIDO")


# ─── Entry Point ───


async def main():
    """Punto de entrada principal con argumentos de línea de comandos."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Nim Phase 2 — WebSocket Seguro (WSS) Server"
    )
    parser.add_argument(
        "--host", default="0.0.0.0", help="Host del servidor (default: 0.0.0.0)"
    )
    parser.add_argument(
        "--port", type=int, default=9876, help="Puerto del servidor (default: 9876)"
    )
    parser.add_argument("--ssl-cert", help="Ruta al certificado SSL (PEM)")
    parser.add_argument("--ssl-key", help="Ruta a la llave privada SSL (PEM)")
    parser.add_argument(
        "--master-password",
        help="Contraseña maestra para E2EE. Si no se proporciona, se lee de "
        "la variable de entorno NIM_MASTER_PASSWORD o del archivo "
        ".nim_master_password",
    )

    args = parser.parse_args()

    # Resolver contraseña maestra
    master_password = args.master_password
    if not master_password:
        # Intentar variable de entorno
        import os

        master_password = os.environ.get("NIM_MASTER_PASSWORD")

    if not master_password:
        # Intentar archivo
        password_file = Path(__file__).parent / ".nim_master_password"
        if password_file.exists():
            raw = password_file.read_text().strip()
            # Ignorar líneas de comentario (empiezan con #)
            lines = [l.strip() for l in raw.split("\n") if l.strip() and not l.strip().startswith("#")]
            if lines:
                master_password = lines[-1]  # Última línea no-comentario

    if not master_password:
        logger.error(
            "NO SE ENCONTRÓ CONTRASEÑA MAESTRA. "
            "Proporciónela con --master-password, "
            "la variable de entorno NIM_MASTER_PASSWORD, "
            "o el archivo nim_phase2/.nim_master_password"
        )
        sys.exit(1)

    # Crear servidor
    server = NimWSSServer(
        master_password=master_password,
        host=args.host,
        port=args.port,
        ssl_cert=args.ssl_cert,
        ssl_key=args.ssl_key,
    )

    # Manejadores de señal para apagado limpio
    loop = asyncio.get_running_loop()

    def shutdown():
        logger.info("Señal de apagado recibida...")
        asyncio.create_task(server.stop())

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, shutdown)
        except NotImplementedError:
            # Windows no soporta add_signal_handler
            pass

    try:
        await server.start()
    except asyncio.CancelledError:
        pass


if __name__ == "__main__":
    asyncio.run(main())
