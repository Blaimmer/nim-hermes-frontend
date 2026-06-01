# NIM PC: Conexión al Servidor WSS de Hermes VPS
**Documento de Conexión para Antigravity — Nim PC (Tauri + Rust)**

Última actualización: 2026-06-01 — Fase 4 completada

Este documento contiene los datos exactos de conexión y el protocolo completo que Nim PC necesita para enlazarse con Hermes VPS. Todo está implementado y testeado del lado VPS.

---

## 1. Datos de Conexión del VPS

### Conexión Directa (ws:// sin SSL — el cifrado E2EE protege los payloads)
```
ws://72.60.123.163:9876
```

### Conexión Segura (wss:// con SSL — recomendado para producción)
```
wss://72.60.123.163:9876
```
> **Nota SSL:** El VPS usa certificado autofirmado (RSA 4096). Nim PC debe aceptar certificados autofirmados en su cliente WebSocket (Tauri/Rust). El fingerprint del certificado se puede verificar manualmente.

---

## 2. Contraseña Maestra y Fingerprint

La contraseña maestra está en el archivo `.nim_master_password` (NO commiteado a GitHub, configurado manualmente en ambos lados).

**Fingerprint de verificación:**
```
ebba8cf932354988
```

Este fingerprint DEBE ser idéntico en Nim PC al derivar la llave con PBKDF2. Si no coincide, la contraseña maestra es diferente y la comunicación fallará con `InvalidTag` de AES-GCM.

**Para verificar desde Nim PC (TypeScript):**
```typescript
// Usar la misma función que deriveKey pero calcular fingerprint:
// SHA256(derivedKey).substring(0, 16) en hex
```

**Para verificar desde Python (VPS):**
```bash
python3 -c "from nim_e2ee import NimE2EE; print(NimE2EE.verify_key_fingerprint('tu-contraseña'))"
```

---

## 3. Protocolo de Handshake

Al conectarse al WebSocket, Nim PC DEBE enviar inmediatamente un mensaje de handshake cifrado (AES-256-GCM, Base64):

### 3.1 Manifiesto de Capacidades (Handshake Request)
```json
{
  "type": "handshake",
  "device": {
    "type": "windows",
    "name": "Nim-PC-Creador",
    "os": "Windows 11",
    "hostname": "creator-desktop"
  },
  "capabilities": ["nim_terminal", "nim_filesystem", "nim_browser"],
  "version": "2.0.0"
}
```

**Formato wire:** 
1. Serializar el JSON a string
2. Cifrar con `NimSecurity.encryptPayload(jsonString)` → Base64
3. Enviar por WebSocket como mensaje de texto

### 3.2 Respuesta del Servidor (Handshake ACK)
```json
{
  "type": "handshake_ack",
  "client_id": "<uuid-generado-por-servidor>",
  "key_fingerprint": "ebba8cf932354988",
  "server_time": "2026-06-01T20:00:00+00:00",
  "message": "Conectado. Fingerprint: ebba8cf932354988"
}
```

> **IMPORTANTE:** Nim PC debe verificar que `key_fingerprint` en la respuesta coincida con su propio fingerprint local. Si no coinciden → ABORTAR conexión.

### 3.3 Skills Update (inmediatamente después del ACK)

Tras el handshake, el servidor envía automáticamente las habilidades disponibles:

```json
{
  "type": "skills_update",
  "skills": [
    {"id": "nim_terminal", "name": "Terminal Local", "status": "Activa",
     "description": "Ejecuta comandos en la PC del Creador (CMD, PowerShell, Bash)"},
    {"id": "nim_filesystem", "name": "Sistema de Archivos", "status": "Activa",
     "description": "Lee, escribe, borra y lista archivos locales"},
    {"id": "nim_browser", "name": "Navegador Chrome", "status": "Activa",
     "description": "Controla pestañas, navega, lee y hace clic en el navegador"},
    {"id": "voice_biometrics", "name": "Biometría Vocal", "status": "Activa",
     "description": "Verifica identidad del Creador por voz (ECAPA-TDNN)"},
    {"id": "web_search", "name": "Búsqueda Web", "status": "Activa",
     "description": "Busca en internet (Tavily + DuckDuckGo)"},
    {"id": "memory", "name": "Memoria Persistente", "status": "Activa",
     "description": "Recuerda preferencias y contexto entre sesiones"},
    {"id": "code_execution", "name": "Ejecución de Código", "status": "Activa",
     "description": "Ejecuta scripts Python en el VPS"},
    {"id": "image_gen", "name": "Generación de Imágenes", "status": "Activa",
     "description": "Crea imágenes con IA"}
  ]
}
```

**Acción para Nim PC:** Poblar el panel visual de habilidades con estos datos.

---

## 4. Mensajería Post-Handshake

TODOS los mensajes entre Nim PC y Hermes VPS viajan cifrados con AES-256-GCM y codificados en Base64.

### 4.1 Tipos de Mensaje: PC → VPS

#### A. user_message — Chat de texto
El usuario escribe en la caja de chat de Nim PC.

```json
{
  "type": "user_message",
  "text": "Hola Hermes, abre la terminal"
}
```

**Qué hace el VPS:** Toma `text`, lo inyecta al LLM (DeepSeek V4 Pro), y responde con `bot_message`.

#### B. user_audio — Chat de voz
El usuario habla, Nim PC graba y envía el audio.

```json
{
  "type": "user_audio",
  "audio_base64": "<string base64 del archivo WAV>",
  "sample_rate": 16000
}
```

**Qué hace el VPS:** 
1. Decodifica Base64 → archivo WAV temporal
2. Verifica biometría vocal (ECAPA-TDNN, umbral 0.85)
3. Si coincide → transcribe con Whisper → texto → LLM
4. Si no coincide → "Identidad vocal no reconocida. Acceso denegado."
5. Responde con `bot_message`

#### C. tool_result — Resultado de herramienta
Después de ejecutar un comando local, Nim PC devuelve el resultado.

```json
{
  "type": "tool_result",
  "call_id": "nim_call_a1b2c3d4e5f6",
  "tool_name": "nim_terminal",
  "result": {
    "stdout": " Volume in drive C is Windows\n Directory of C:\\Users\\Creador\\Desktop\n ...",
    "stderr": "",
    "exit_code": 0
  }
}
```

En caso de error:
```json
{
  "type": "tool_result",
  "call_id": "nim_call_a1b2c3d4e5f6",
  "tool_name": "nim_terminal",
  "result": {
    "error": "Permiso denegado: no se puede acceder a C:\\Windows\\System32"
  }
}
```

### 4.2 Tipos de Mensaje: VPS → PC

#### A. bot_message — Respuesta del LLM
```json
{
  "type": "bot_message",
  "text": "Aquí tienes la respuesta...",
  "bot_state": "speaking"
}
```

**bot_state** controla las animaciones del orbe en Nim PC:
| Valor | Significado | Acción en UI |
|-------|------------|--------------|
| `"thinking"` | El LLM está procesando | Orbe animado, color ámbar |
| `"speaking"` | Respuesta lista, "hablando" | Orbe hablando, color activo |
| `"idle"` | En reposo, esperando | Orbe en reposo |
| `""` (vacío) | No cambiar estado | Mantener estado actual |

**Secuencia típica:** `thinking` → (respuesta con texto) `speaking` → (0.5s después) `idle`

#### B. tool_call — Ejecutar en PC local
Cuando Hermes decide usar una herramienta local, envía un tool_call que Nim PC debe interceptar y ejecutar:

```json
{
  "type": "tool_call",
  "call_id": "nim_call_a1b2c3d4e5f6",
  "tool_name": "nim_terminal",
  "arguments": {
    "command": "dir C:\\Users\\Creador\\Desktop"
  }
}
```

**Herramientas que Hermes puede llamar:**

| Herramienta | Acción | Parámetros |
|-------------|--------|------------|
| `nim_terminal` | Ejecutar comando en shell local | `command` (req), `cwd` (opt) |
| `nim_filesystem` | CRUD de archivos | `action` (read/write/delete/list/mkdir), `path`, `content` |
| `nim_browser` | Controlar Chrome | `action` (get_tabs/read_tab/click/type/navigate), `tab_id`, `selector`, `text` |

**IMPORTANTE:** Nim PC debe ejecutar la herramienta con el `call_id` recibido y devolver un `tool_result` con ese mismo `call_id`.

#### C. Ping/Pong (Keep-Alive)
El servidor envía ping cada 30 segundos. Nim PC debe responder con pong.
```json
{"type": "ping", "ts": 1717272000.0}
```
```json
{"type": "pong", "ts": 1717272000.1}
```

---

## 5. Flujo de Conexión (Checklist para Nim PC)

1. [ ] Cargar contraseña maestra desde configuración local
2. [ ] Derivar llave AES-256 con PBKDF2 (salt=`nim-omnichannel-salt-v1`, 100K iter, SHA-256)
3. [ ] Verificar fingerprint: debe ser `ebba8cf932354988`
4. [ ] Conectar WebSocket a `ws://72.60.123.163:9876`
5. [ ] Enviar handshake cifrado con capabilities: `["nim_terminal", "nim_filesystem", "nim_browser"]`
6. [ ] Recibir `handshake_ack`, verificar fingerprint del servidor
7. [ ] Recibir `skills_update` — poblar panel de habilidades en la UI
8. [ ] Entrar en loop de mensajería:
   - Enviar `user_message` cuando el usuario escriba en el chat
   - Enviar `user_audio` cuando el usuario use el micrófono
   - Recibir `bot_message` y mostrar la respuesta en la UI
   - Recibir `tool_call`, ejecutar localmente, devolver `tool_result`
   - Responder `ping` con `pong`

---

## 6. Flujos Completos (Referencia)

### 6.1 Flujo de Chat (texto)
```
Usuario escribe en Nim PC
  → Nim PC: {type: "user_message", text: "Hola, abre la terminal"}
  → WSS (cifrado AES-256-GCM)
  → Hermes VPS: bot_state "thinking"
  → Hermes API (DeepSeek V4 Pro) procesa
  → Hermes VPS: {type: "bot_message", text: "¡Claro! Ejecutando...", bot_state: "speaking"}
  → WSS (cifrado)
  → Nim PC: muestra respuesta, orbe en "speaking"
  → 0.5s después: {type: "bot_message", text: "", bot_state: "idle"}
  → Orbe vuelve a reposo
```

### 6.2 Flujo de Voz (audio)
```
Usuario habla a Nim PC
  → Nim PC: graba audio, codifica WAV → Base64
  → {type: "user_audio", audio_base64: "...", sample_rate: 16000}
  → WSS (cifrado)
  → Hermes VPS: decodifica → archivo WAV temporal
  → voice_biometrics.py: verifica huella vocal (umbral 0.85)
  → Si OK: Whisper STT → texto → LLM
  → Si NO: "Identidad vocal no reconocida. Acceso denegado."
  → bot_message con respuesta
```

### 6.3 Flujo de Tool Call (ejecución local)
```
Hermes LLM decide usar nim_terminal
  → Hermes VPS → plugin nim-pc → canal de control WSS
  → {type: "tool_call", call_id: "nim_call_abc123", tool_name: "nim_terminal", arguments: {command: "dir"}}
  → WSS (cifrado)
  → Nim PC: ejecuta "dir" en CMD/PowerShell
  → Nim PC: {type: "tool_result", call_id: "nim_call_abc123", result: {stdout: "...", exit_code: 0}}
  → WSS (cifrado)
  → Hermes VPS: resultado → LLM continúa razonando
```

---

## 7. Código de Referencia

### TypeScript (Nim PC — security.ts)
El módulo de seguridad en Nim PC ya implementa:
- `NimSecurity.setMasterKey(password)` — derivación PBKDF2
- `NimSecurity.encryptPayload(plaintext)` — AES-GCM → Base64
- `NimSecurity.decryptPayload(base64)` — Base64 → AES-GCM → plaintext

### Python (VPS — nim_e2ee.py)
Espejo exacto del lado VPS. Mismos algoritmos, misma salt, mismo formato wire.
- `NimE2EE(master_password)` — derivación de llave
- `e2ee.encrypt_payload(json_string)` → Base64
- `e2ee.decrypt_payload(base64_string)` → JSON string
- `NimE2EE.verify_key_fingerprint(password)` → fingerprint hex

---

## 8. Mensajes de Estado del Orbe (Referencia Visual)

| Estado | Color sugerido | Animación |
|--------|---------------|-----------|
| `idle` | Azul tenue | Pulso lento / estático |
| `thinking` | Ámbar / Naranja | Pulso rápido, rotación |
| `speaking` | Verde / Cian | Ondas de voz, expansión |

El servidor siempre envía la secuencia: `thinking` → `speaking` → `idle`.
Nim PC puede ignorar `bot_state: ""` (sin cambios).

---

## 9. Prueba de Conexión

Para verificar que el servidor está activo antes de conectar Nim PC:

```bash
# Desde el VPS (test local)
cd nim_phase2 && python3 test_wss_client.py

# Desde Windows (PowerShell) — verificar que el puerto responde
Test-NetConnection -ComputerName 72.60.123.163 -Port 9876
```

---

## 10. Dependencias del Lado VPS

| Dependencia | Estado | Notas |
|-------------|--------|-------|
| Python 3.10+ | ✅ | websockets, httpx, numpy |
| websockets 16.0 | ✅ | Servidor WSS asíncrono |
| httpx 0.28.1 | ✅ | Cliente HTTP para Hermes API |
| Hermes Agent | ✅ | API Server en :8642 |
| DeepSeek V4 Pro | ✅ | Modelo activo |
| voice_biometrics (SpeechBrain) | ✅ | ECAPA-TDNN, umbral 0.85 |
| Whisper (STT) | ❌ | Opcional — `pip install openai-whisper` |

---

## 11. Arquitectura Completa del Ecosistema NIM

```
┌─────────────────────────────────────────────────────────┐
│                      VPS (72.60.123.163)                 │
│                                                         │
│  ┌──────────────────┐     ┌──────────────────────────┐  │
│  │  Hermes Agent     │     │  nim_wss_server.py       │  │
│  │  (DeepSeek V4 Pro)│◄───►│  (:9876)                 │  │
│  │  :8642            │     │                          │  │
│  │                    │     │  ┌────────────────────┐  │  │
│  │  ┌──────────────┐ │     │  │ Canal Nim PC       │  │  │
│  │  │Plugin nim-pc  │ │     │  │ (E2EE AES-256-GCM) │  │  │
│  │  │nim_terminal   │─┼─────┼─►│ • handshake        │  │  │
│  │  │nim_filesystem │ │     │  │ • user_message     │  │  │
│  │  │nim_browser    │ │     │  │ • user_audio       │  │  │
│  │  └──────────────┘ │     │  │ • tool_call        │  │  │
│  └──────────────────┘     │  │ • bot_message      │  │  │
│                            │  │ • skills_update    │  │  │
│  ┌──────────────────┐     │  │ • ping/pong        │  │  │
│  │ Dashboard Web     │     │  └────────────────────┘  │  │
│  │ :3001 (React)     │     │                          │  │
│  └──────────────────┘     └──────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         │                            ▲
         │ HTTP/SSE                   │ WSS (E2EE)
         ▼                            │
   ┌──────────┐              ┌──────────────────┐
   │ Navegador │              │   Nim PC         │
   │ (Chrome)  │              │ (Tauri + Rust)   │
   └──────────┘              │ Windows/Mac/Linux│
                             │                  │
                             │ • Terminal local │
                             │ • Filesystem     │
                             │ • Chrome (CDP)   │
                             │ • Micrófono      │
                             │ • Altavoces      │
                             └──────────────────┘
```

---

**FIN DEL DOCUMENTO**

*(Antigravity, este documento contiene TODO lo necesario para que Nim PC complete la integración. Del lado VPS está 100% implementado y testeado. Commits relevantes: `d949c7b` (Fase 3), `c5040fe` (Fase 4).)*
