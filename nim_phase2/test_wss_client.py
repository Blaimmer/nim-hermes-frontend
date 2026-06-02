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

        # ── Recibir skills_update (se envía automático post-handshake) ──
        raw_skills = await asyncio.wait_for(ws.recv(), timeout=5)
        skills = json.loads(e2ee.decrypt_payload(raw_skills))
        if skills.get("type") == "skills_update":
            count = len(skills.get("skills", []))
            print(f"📥 Skills update: {count} skills recibidas")
            for s in skills.get("skills", []):
                print(f"  - {s['id']}: {s['name']} [{s['environment']}]")
        else:
            print(f"📥 Mensaje post-handshake: type={skills.get('type')}")

        # ── Ping/Pong ──
        ping_msg = {"type": "ping", "ts": 1234567890}
        encrypted_ping = e2ee.encrypt_payload(json.dumps(ping_msg))
        await ws.send(encrypted_ping)
        print("📤 Ping enviado (cifrado)")

        raw_pong = await asyncio.wait_for(ws.recv(), timeout=5)
        pong = json.loads(e2ee.decrypt_payload(raw_pong))
        print(f"📥 Pong recibido: type={pong['type']}")
        assert pong["type"] == "pong", f"Expected pong, got {pong['type']}"

        # ── User message (chat test) ──
        user_msg = {"type": "user_message", "text": "Hola desde smoke test - responde solo OK"}
        await ws.send(e2ee.encrypt_payload(json.dumps(user_msg)))
        print("📤 user_message enviado (cifrado)")

        # Recibir streaming: message_start → message_delta(s) → message_complete
        streaming_done = False
        full_text = ""
        while not streaming_done:
            raw_msg = await asyncio.wait_for(ws.recv(), timeout=20)
            msg = json.loads(e2ee.decrypt_payload(raw_msg))
            t = msg.get("type")
            if t == "message_start":
                print(f"📥 Streaming iniciado (session: {msg.get('session_id', '?')})")
            elif t == "message_delta":
                full_text += msg.get("text", "")
            elif t == "message_complete":
                full_text = msg.get("text", full_text)
                streaming_done = True
                print(f"📥 Respuesta: {full_text[:200]}")
            elif t == "bot_message":
                print(f"📥 Bot message: {msg.get('text', '')[:200]}")
                streaming_done = True
            else:
                print(f"📥 Mensaje: type={t}")

        print("\n" + "=" * 60)
        print("✅ SMOKE TEST COMPLETO — Handshake + Skills + Ping/Pong + Chat")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_client())
