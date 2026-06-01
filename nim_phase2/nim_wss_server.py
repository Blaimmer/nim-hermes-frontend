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
import json
import logging
import signal
import ssl
import sys
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import websockets
from websockets.asyncio.server import ServerConnection

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
    PING_INTERVAL = 30  # segundos
    HANDSHAKE_TIMEOUT = 15  # segundos para completar el handshake

    def __init__(
        self,
        master_password: str,
        host: str = DEFAULT_HOST,
        port: int = DEFAULT_PORT,
        ssl_cert: str | None = None,
        ssl_key: str | None = None,
    ):
        self.host = host
        self.port = port
        self.ssl_context = self._build_ssl_context(ssl_cert, ssl_key)

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
                    # Conexión de control desde Hermes Agent (no cifrada, localhost)
                    await self.control_loop(websocket, client_id, first_msg)
                    return
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass  # No es plaintext JSON, continuar con handshake E2EE

            # ── FASE 1: Handshake (el cliente envía su manifiesto de capacidades) ──
            raw_handshake = raw_first_message

            # Descifrar el manifiesto
            try:
                handshake_json = self.e2ee.decrypt_payload(raw_handshake)
                handshake = json.loads(handshake_json)
            except (ValueError, json.JSONDecodeError) as e:
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
            client_info = ClientInfo(
                client_id=client_id,
                device_type=device.get("type", "unknown"),
                device_name=device.get("name", f"nim-{client_id[:6]}"),
                capabilities=handshake.get("capabilities", []),
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
            logger.info(f"HANDSHAKE COMPLETADO: {client_info.device_name}")

            # ── FASE 2: Loop de mensajería principal ──
            await self.message_loop(websocket, client_info)

        except asyncio.TimeoutError:
            logger.warning(f"TIMEOUT: Handshake no completado en {self.HANDSHAKE_TIMEOUT}s ({client_id[:8]}...)")
        except websockets.exceptions.ConnectionClosed as e:
            logger.info(f"CONEXIÓN CERRADA: {client_id[:8]}... — {e.code} {e.reason}")
        except Exception as e:
            logger.error(f"ERROR ({client_id[:8]}...): {type(e).__name__}: {e}")
        finally:
            self.unregister_client(client_id)

    async def message_loop(
        self, websocket: ServerConnection, client: ClientInfo
    ) -> None:
        """Loop principal de mensajería post-handshake."""

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
                logger.debug(
                    f"MENSAJE [{msg_type}] de {client.device_name}: "
                    f"{json.dumps(message, indent=None)[:200]}"
                )

                if msg_type == "tool_result":
                    await self._handle_tool_result(message, client)
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
            await websocket.send(json.dumps({
                "type": "dispatch_result",
                "call_id": call_id,
                "status": "ok",
                "result": result,
            }))
        except asyncio.TimeoutError:
            await websocket.send(json.dumps({
                "type": "dispatch_result",
                "call_id": call_id,
                "status": "timeout",
                "error": f"Timeout after {timeout}s",
            }))
        except (ValueError, ConnectionError) as e:
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
