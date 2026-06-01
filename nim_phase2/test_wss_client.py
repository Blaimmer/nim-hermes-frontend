#!/usr/bin/env python3
"""
Smoke test para Nim WSS Server.
Simula un cliente Nim PC conectándose, haciendo handshake cifrado,
y verificando el ciclo completo de mensajería.
"""

import asyncio
import json
import sys
from pathlib import Path

# Agregar el directorio nim_phase2 al path
sys.path.insert(0, str(Path(__file__).parent))
import websockets
from nim_e2ee import NimE2EE

MASTER_PASSWORD = "NimMasterKey2024!@#Secure"
WSS_URL = "ws://localhost:9876"


async def test_client():
    """Simula un cliente Nim PC que se conecta al WSS."""
    e2ee = NimE2EE(MASTER_PASSWORD)
    fingerprint = NimE2EE.verify_key_fingerprint(MASTER_PASSWORD)
    print(f"Cliente fingerprint: {fingerprint}")

    print(f"Conectando a {WSS_URL}...")
    async with websockets.connect(WSS_URL) as ws:
        print("✅ Conectado")

        # ── Handshake ──
        handshake = {
            "type": "handshake",
            "device": {
                "type": "windows",
                "name": "Nim-PC-Test",
                "os": "Windows 11",
                "hostname": "creator-desktop",
            },
            "capabilities": ["nim_terminal", "nim_filesystem", "nim_browser"],
            "version": "2.0.0-beta",
        }
        encrypted_handshake = e2ee.encrypt_payload(json.dumps(handshake))
        await ws.send(encrypted_handshake)
        print("📤 Handshake enviado (cifrado)")

        # Recibir ACK
        raw_ack = await ws.recv()
        ack = json.loads(e2ee.decrypt_payload(raw_ack))
        print(f"📥 ACK recibido: {ack.get('message')}")
        assert ack["type"] == "handshake_ack", f"Expected handshake_ack, got {ack['type']}"
        assert ack["key_fingerprint"] == fingerprint, (
            f"Fingerprint mismatch! Server: {ack['key_fingerprint']}, Client: {fingerprint}"
        )
        print(f"✅ Fingerprint coincide: {ack['key_fingerprint']}")

        # ── Ping/Pong ──
        ping_msg = {"type": "ping", "ts": 1234567890}
        encrypted_ping = e2ee.encrypt_payload(json.dumps(ping_msg))
        await ws.send(encrypted_ping)
        print("📤 Ping enviado (cifrado)")

        raw_pong = await asyncio.wait_for(ws.recv(), timeout=5)
        pong = json.loads(e2ee.decrypt_payload(raw_pong))
        print(f"📥 Pong recibido: type={pong['type']}")
        assert pong["type"] == "pong", f"Expected pong, got {pong['type']}"

        # ── Enviar tool_result simulado ──
        tool_result = {
            "type": "tool_result",
            "call_id": "nim_call_test123",
            "tool_name": "nim_terminal",
            "result": {
                "stdout": "directorio listado correctamente",
                "stderr": "",
                "exit_code": 0,
            },
        }
        await ws.send(e2ee.encrypt_payload(json.dumps(tool_result)))
        print("📤 Tool result enviado (cifrado)")

        print("\n" + "=" * 60)
        print("✅ SMOKE TEST COMPLETO — Handshake, Ping/Pong, Tool Result")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_client())
