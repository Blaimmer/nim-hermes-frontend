"""
Connection Logger — JSON Lines para nim_wss_server.py

Registra CADA evento de conexión en formato JSON Lines (.jsonl)
con timestamps, IPs, tipos de mensaje y resultados.

Archivo: nim_phase2/wss_connections.log
Rotación: mantiene las últimas 2000 líneas
"""

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class ConnectionLogger:
    """Logger estructurado para conexiones WSS."""

    MAX_LINES = 2000
    LOG_FILE = "wss_connections.log"

    def __init__(self, log_dir: str | Path | None = None):
        if log_dir is None:
            log_dir = Path(__file__).parent
        self.log_path = Path(log_dir) / self.LOG_FILE
        self._lock_rotated = False

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def _write(self, entry: dict[str, Any]) -> None:
        """Escribe una línea JSON al archivo de log."""
        entry["_ts"] = self._now()
        try:
            with open(self.log_path, "a") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        except Exception:
            pass  # No queremos que el logger crashee el servidor

        # Rotación ligera: cada ~100 escrituras verificamos
        self._rotate_if_needed()

    def _rotate_if_needed(self) -> None:
        """Mantiene solo las últimas MAX_LINES en el archivo."""
        try:
            with open(self.log_path, "r") as f:
                lines = f.readlines()
            if len(lines) > self.MAX_LINES:
                # Mantener últimas MAX_LINES
                keep = lines[-self.MAX_LINES:]
                with open(self.log_path, "w") as f:
                    f.writelines(keep)
        except Exception:
            pass

    # ─── Eventos de Conexión ───

    def connection_accepted(
        self,
        remote_addr: tuple[str, int] | None,
        client_id: str,
    ) -> None:
        """TCP connection accepted."""
        self._write({
            "event": "connection_accepted",
            "remote_ip": remote_addr[0] if remote_addr else None,
            "remote_port": remote_addr[1] if remote_addr else None,
            "client_id": client_id[:8] if client_id else None,
        })

    def connection_control(
        self,
        remote_addr: tuple[str, int] | None,
        client_id: str,
        role: str,
        name: str,
    ) -> None:
        """Control connection from Hermes Agent (plaintext, localhost)."""
        self._write({
            "event": "control_connected",
            "remote_ip": remote_addr[0] if remote_addr else None,
            "remote_port": remote_addr[1] if remote_addr else None,
            "client_id": client_id[:8] if client_id else None,
            "role": role,
            "name": name,
        })

    def handshake_started(
        self,
        client_id: str,
        remote_addr: tuple[str, int] | None,
    ) -> None:
        """Cliente envió primer mensaje, iniciando handshake."""
        self._write({
            "event": "handshake_started",
            "client_id": client_id[:8] if client_id else None,
            "remote_ip": remote_addr[0] if remote_addr else None,
        })

    def handshake_completed(
        self,
        client_id: str,
        device_name: str,
        device_type: str,
        capabilities: list[str],
        fingerprint: str,
    ) -> None:
        """Handshake E2EE exitoso."""
        self._write({
            "event": "handshake_completed",
            "client_id": client_id[:8] if client_id else None,
            "device_name": device_name,
            "device_type": device_type,
            "capabilities": capabilities,
            "fingerprint": fingerprint,
        })

    def handshake_failed(
        self,
        client_id: str,
        reason: str,
        remote_addr: tuple[str, int] | None = None,
    ) -> None:
        """Handshake E2EE fallido."""
        self._write({
            "event": "handshake_failed",
            "client_id": client_id[:8] if client_id else None,
            "remote_ip": remote_addr[0] if remote_addr else None,
            "reason": reason,
        })

    def handshake_timeout(
        self,
        client_id: str,
        timeout_seconds: int,
    ) -> None:
        """Timeout esperando handshake."""
        self._write({
            "event": "handshake_timeout",
            "client_id": client_id[:8] if client_id else None,
            "timeout_seconds": timeout_seconds,
        })

    def skills_sent(
        self,
        client_id: str,
        skill_count: int,
    ) -> None:
        """Skills update enviado al cliente."""
        self._write({
            "event": "skills_sent",
            "client_id": client_id[:8] if client_id else None,
            "skill_count": skill_count,
        })

    # ─── Eventos de Mensajería ───

    def message_received(
        self,
        client_id: str,
        device_name: str,
        msg_type: str,
        msg_size: int,
        details: dict | None = None,
    ) -> None:
        """Mensaje recibido del cliente (post-handshake)."""
        entry: dict[str, Any] = {
            "event": "message_received",
            "client_id": client_id[:8] if client_id else None,
            "device_name": device_name,
            "msg_type": msg_type,
            "msg_size": msg_size,
        }
        if details:
            # Incluir detalles relevantes sin sobrecargar
            if msg_type == "user_message":
                entry["text_preview"] = details.get("text", "")[:80]
            elif msg_type == "tool_result":
                entry["call_id"] = details.get("call_id", "")
                entry["tool_name"] = details.get("tool_name", "")
                entry["has_error"] = "error" in details.get("result", {})
            elif msg_type == "switch_model":
                entry["model_id"] = details.get("modelId", "")
        self._write(entry)

    def message_sent(
        self,
        client_id: str,
        device_name: str,
        msg_type: str,
        details: dict | None = None,
    ) -> None:
        """Mensaje enviado al cliente."""
        entry: dict[str, Any] = {
            "event": "message_sent",
            "client_id": client_id[:8] if client_id else None,
            "device_name": device_name,
            "msg_type": msg_type,
        }
        if details:
            if msg_type == "bot_message":
                entry["bot_state"] = details.get("bot_state", "")
                entry["text_preview"] = details.get("text", "")[:80]
            elif msg_type == "message_complete":
                entry["text_preview"] = details.get("text", "")[:80]
                entry["interrupted"] = details.get("interrupted", False)
            elif msg_type == "tool_call":
                entry["tool_name"] = details.get("tool_name", "")
                entry["call_id"] = details.get("call_id", "")
        self._write(entry)

    def message_decrypt_failed(
        self,
        client_id: str,
        device_name: str,
        error: str,
    ) -> None:
        """Fallo al descifrar mensaje del cliente."""
        self._write({
            "event": "decrypt_failed",
            "client_id": client_id[:8] if client_id else None,
            "device_name": device_name,
            "error": error,
        })

    # ─── Eventos de Desconexión ───

    def disconnected(
        self,
        client_id: str,
        device_name: str,
        code: int | None,
        reason: str | None,
    ) -> None:
        """Cliente desconectado."""
        self._write({
            "event": "disconnected",
            "client_id": client_id[:8] if client_id else None,
            "device_name": device_name,
            "code": code,
            "reason": reason if reason else "",
        })

    def control_disconnected(
        self,
        client_id: str,
        name: str,
        code: int | None,
    ) -> None:
        """Control connection closed."""
        self._write({
            "event": "control_disconnected",
            "client_id": client_id[:8] if client_id else None,
            "name": name,
            "code": code,
        })

    # ─── Errores ───

    def error(
        self,
        client_id: str | None,
        error_type: str,
        message: str,
    ) -> None:
        """Error genérico."""
        self._write({
            "event": "error",
            "client_id": client_id[:8] if client_id else None,
            "error_type": error_type,
            "message": message,
        })

    def dispatch_tool(
        self,
        call_id: str,
        tool_name: str,
        target_client_id: str,
        status: str,
        error_msg: str | None = None,
    ) -> None:
        """Tool dispatch desde Hermes → Nim PC."""
        entry: dict[str, Any] = {
            "event": "dispatch_tool",
            "call_id": call_id,
            "tool_name": tool_name,
            "target_client": target_client_id[:8] if target_client_id else None,
            "status": status,
        }
        if error_msg:
            entry["error"] = error_msg
        self._write(entry)

    # ─── Utilidades ───

    def tail(self, n: int = 50) -> list[dict]:
        """Devuelve las últimas N líneas del log."""
        try:
            with open(self.log_path, "r") as f:
                lines = f.readlines()
            return [json.loads(line) for line in lines[-n:]]
        except Exception:
            return []

    def stats(self) -> dict:
        """Estadísticas rápidas del log."""
        try:
            with open(self.log_path, "r") as f:
                lines = f.readlines()
        except Exception:
            return {"total_events": 0}

        events: dict[str, int] = {}
        connections = 0
        failed = 0
        last_connection = None

        for line in lines:
            try:
                entry = json.loads(line)
                ev = entry.get("event", "unknown")
                events[ev] = events.get(ev, 0) + 1
                if ev == "connection_accepted":
                    connections += 1
                    last_connection = entry.get("_ts")
                elif ev == "handshake_failed":
                    failed += 1
            except Exception:
                pass

        return {
            "total_events": len(lines),
            "events_by_type": events,
            "connections_total": connections,
            "handshakes_failed": failed,
            "last_connection": last_connection,
            "log_file": str(self.log_path),
            "log_size_bytes": os.path.getsize(self.log_path) if self.log_path.exists() else 0,
        }


# Singleton para el servidor
_conn_logger: ConnectionLogger | None = None


def get_logger() -> ConnectionLogger:
    global _conn_logger
    if _conn_logger is None:
        _conn_logger = ConnectionLogger()
    return _conn_logger
