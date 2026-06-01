# NIM PC ↔ Hermes VPS: Protocolo de Comunicación WSS
**Documento Maestro de Integración — Antigravity + Hermes Agent**

Última actualización: 2026-06-01 — Todas las fases completadas
Commits: `d949c7b` → `c5040fe` → `389fb9d` → `95d6610` → `f88ecdd` → `cfe262a` → `5dc78ae` → `8cd5165` → `c3c3894`

---

## 1. Datos de Conexión

```
ws://72.60.123.163:9876        (desarrollo)
wss://72.60.123.163:9876       (producción, certificado autofirmado RSA 4096)
```

**Fingerprint de verificación E2EE:** `ebba8cf932354988`

---

## 2. Handshake Inicial

### 2.1 Nim PC envía (cifrado AES-256-GCM, Base64)

```json
{
  "type": "handshake",
  "device": {"type": "windows", "name": "Nim-PC-Creador", "os": "Windows 11", "hostname": "creator-desktop"},
  "capabilities": ["nim_terminal", "nim_filesystem", "nim_browser", "nim_patch_file", "nim_grep_search", "nim_list_dir"],
  "version": "2.0.0"
}
```

### 2.2 VPS responde

```json
{
  "type": "handshake_ack",
  "client_id": "<uuid>",
  "key_fingerprint": "ebba8cf932354988",
  "message": "Conectado. Fingerprint: ebba8cf932354988"
}
```

> Nim PC debe verificar que `key_fingerprint` coincida con su fingerprint local.

### 2.3 VPS envía skills_update (inmediatamente después)

```json
{
  "type": "skills_update",
  "skills": [
    {"id": "nim_terminal",     "name": "Terminal PC",         "status": "Activa", "environment": "PC", "description": "CMD/PowerShell en la PC"},
    {"id": "nim_filesystem",   "name": "Archivos PC",         "status": "Activa", "environment": "PC", "description": "Leer/escribir/borrar archivos locales"},
    {"id": "nim_browser",      "name": "Navegador PC",        "status": "Activa", "environment": "PC", "description": "Control de Chrome local"},
    {"id": "nim_patch_file",   "name": "Parche de Código",    "status": "Activa", "environment": "PC", "description": "Micro-cirugía de código (find-and-replace)"},
    {"id": "nim_grep_search",  "name": "Búsqueda en Código",  "status": "Activa", "environment": "PC", "description": "Búsqueda regex en archivos del proyecto"},
    {"id": "nim_list_dir",     "name": "Explorador de Proy.", "status": "Activa", "environment": "PC", "description": "Escanea árbol de directorios"},
    {"id": "voice_biometrics", "name": "Biometría Vocal",     "status": "Activa", "environment": "VPS", "description": "Verificación de voz ECAPA-TDNN"},
    {"id": "web_search",       "name": "Búsqueda Web",        "status": "Activa", "environment": "VPS", "description": "Tavily + DuckDuckGo"},
    {"id": "holographic_memory","name": "Memoria Persistente","status": "Activa", "environment": "VPS", "description": "FTS5 + vectorial a largo plazo"},
    {"id": "code_execution",   "name": "Ejecución Python",    "status": "Activa", "environment": "VPS", "description": "Scripts Python en el VPS"},
    {"id": "image_gen",        "name": "Gen. de Imágenes",    "status": "Activa", "environment": "VPS", "description": "IA de imágenes"}
  ]
}
```

**6 PC | 5 VPS | 11 Total**

---

## 3. Tipos de Mensaje — Referencia Completa

### 3.1 PC → VPS

| Tipo | Propósito | Parámetros |
|------|-----------|------------|
| `user_message` | Chat de texto del usuario | `text` |
| `user_audio` | Chat de voz (Base64 WAV) | `audio_base64`, `sample_rate` |
| `tool_result` | Resultado de herramienta ejecutada | `call_id`, `tool_name`, `result` |
| `get_models` | Pedir lista de modelos | — |
| `switch_model` | Cambiar modelo activo | `modelId` |
| `get_soul` | Cargar bloques soul | — |
| `update_soul` | Guardar bloque soul | `block` (human/persona/task), `content` |
| `session_create` | Crear sesión persistente | `session_id` (opcional) |
| `session_resume` | Resumir sesión | `session_id` |
| `session_interrupt` | Cancelar respuesta en curso | — |
| `ping` | Keep-alive | `ts` |

### 3.2 VPS → PC

| Tipo | Propósito | Parámetros |
|------|-----------|------------|
| `message_start` | Inicio de streaming | `session_id` |
| `message_delta` | Chunk de texto (streaming) | `text` |
| `message_complete` | Fin de respuesta | `text`, `session_id`, `interrupted`? |
| `bot_message` | Respuesta legacy (no-streaming) | `text`, `bot_state` |
| `tool_call` | Ejecutar herramienta en PC | `call_id`, `tool_name`, `arguments` |
| `models_list` | Lista de modelos | `models[]` |
| `soul_data` | Contenido de bloques soul | `humanBlock`, `personaBlock`, `taskBlock` |
| `session_created` | Sesión creada | `session_id` |
| `session_resumed` | Sesión resumida | `session_id`, `message_count` |
| `interrupted` | Confirmación de cancelación | `message` |
| `skills_update` | Habilidades disponibles | `skills[]` |
| `error` | Error del backend | `message` |
| `pong` | Keep-alive | `ts` |

---

## 4. Flujo de Chat con Streaming (recomendado)

```
PC → {type: "user_message", text: "Hola"}
VPS → {type: "message_start", session_id: "..."}
VPS → {type: "message_delta", text: "H"}
VPS → {type: "message_delta", text: "ola"}
VPS → {type: "message_delta", text: ", ¿"}
VPS → {type: "message_delta", text: "cómo estás?"}
VPS → {type: "message_complete", text: "Hola, ¿cómo estás?", session_id: "..."}
```

**Nim PC debe:** `message_start` → crear mensaje vacío → cada `message_delta` concatenar → `message_complete` finalizar.

---

## 5. Flujo de Voz con Biometría

```
PC → {type: "user_audio", audio_base64: "<WAV>", sample_rate: 16000}
VPS → decodifica → archivo WAV temporal
     → voice_biometrics.py (ECAPA-TDNN, umbral 0.85)
     → si OK: Whisper STT → texto → LLM → streaming
     → si NO: {type: "bot_message", text: "Identidad vocal no reconocida. Acceso denegado."}
```

---

## 6. Herramientas de Ejecución Local (Tool Calls)

Cuando Hermes necesita ejecutar algo en la PC, envía un `tool_call` por WSS.

### 6.1 Formato

```json
{
  "type": "tool_call",
  "call_id": "nim_call_abc123",
  "tool_name": "nim_terminal",
  "arguments": {"command": "dir C:\\Users\\Creador\\Desktop"}
}
```

**Nim PC debe:** ejecutar con `call_id` → devolver `tool_result` con el mismo `call_id`.

### 6.2 Catálogo de Herramientas (fuente: NIM_NATIVE_CAPABILITIES.md)

| Herramienta | Acción | Parámetros |
|-------------|--------|------------|
| `nim_terminal` | Shell local (PS/CMD) | `command` (req), `cwd` (opt) |
| `nim_filesystem` | Leer/escribir archivos completos | `action` (read/write), `path`, `content` (solo write) |
| `nim_browser` | Chrome local | `action`, `tab_id`, `selector`, `text` |
| `nim_patch_file` | Micro-cirugía find-and-replace | `path`, `old_string`, `new_string` |
| `nim_grep_search` | Búsqueda regex en proyecto | `pattern`, `path` (req), `file_glob` (opt), `max_results` (opt, default 50) |
| `nim_list_dir` | Árbol de directorios (1 nivel) | `path`, `depth` (opt, default 1) |

### 6.3 Resultado

```json
{
  "type": "tool_result",
  "call_id": "nim_call_abc123",
  "tool_name": "nim_terminal",
  "result": {"stdout": "...", "stderr": "", "exit_code": 0}
}
```

Error:
```json
{"type": "tool_result", "call_id": "...", "tool_name": "...", "result": {"error": "Permiso denegado"}}
```

---

## 7. Gestión de Modelos y Soul

### 7.1 Modelos

```
PC → {type: "get_models"}
VPS → {type: "models_list", models: [{id, name, provider, active}, ...]}   (13 modelos)

PC → {type: "switch_model", modelId: "gpt-4o"}
VPS → {type: "models_list", models: [...]}   (lista actualizada)
```

### 7.2 Soul Docs

```
PC → {type: "get_soul"}
VPS → {type: "soul_data", humanBlock, personaBlock, taskBlock}

PC → {type: "update_soul", block: "human", content: "..."}
VPS → {type: "bot_message", text: "✅ Memoria 'human' actualizada."}
```

---

## 8. Sesiones

```
PC → {type: "session_create"}
VPS → {type: "session_created", session_id: "uuid"}

PC → {type: "session_resume", session_id: "uuid"}
VPS → {type: "session_resumed", session_id: "uuid", message_count: N}
```

---

## 9. Interrupción

```
PC → {type: "session_interrupt"}
VPS → {type: "interrupted", message: "Request cancelada"}
VPS → {type: "message_complete", text: "[Interrumpido]", interrupted: true}
```

---

## 10. Contexto Omnicanal (System Prompt del LLM)

Cada mensaje de Nim PC inyecta este contexto en el LLM:

```
══════════════ TOPOLOGÍA ACTUAL ══════════════
Estás sirviendo al Creador a través de 'Nim PC' (Windows).
El Creador te habla desde su PC conectada por WebSocket E2EE.

🏠 TU CUERPO (VPS Linux): web_search, image_gen, code_execution, memoria
💻 LA PC DEL CREADOR (Windows): nim_terminal, nim_filesystem, nim_browser,
   nim_patch_file, nim_grep_search, nim_list_dir

═══════════ REGLAS DE ORO ═══════════
• Para archivos/carpetas/programas en la PC → SIEMPRE nim_* tools
• NUNCA uses terminal Linux VPS para tareas de la PC
• Solo herramientas VPS para APIs externas
• Si el usuario dice "en el servidor/VPS" → usa nativas
• Ante la duda → pregunta "¿en tu PC o en el VPS?"
```

---

## 11. Ping/Keep-Alive

El VPS envía ping cada 30s. Nim PC debe responder con pong.

```json
{"type": "ping", "ts": 1717272000.0}
{"type": "pong", "ts": 1717272000.1}
```

---

## 12. Estados del Orbe + TTS Local

> **Nota TTS:** El audio hablado se renderiza localmente en Nim PC con voces nativas de Windows. El VPS solo envía texto; Nim PC lo convierte a voz.

| bot_state | Significado |
|-----------|-------------|
| `"thinking"` | LLM procesando → orbe ámbar |
| `"speaking"` | Respuesta lista → orbe activo |
| `"idle"` | En reposo |
| `""` | No cambiar estado |

> Con streaming (message_start/delta/complete), Nim PC gestiona el orbe localmente.

---

## 13. Checklist de Conexión para Nim PC

1. [ ] Cargar contraseña maestra → derivar llave PBKDF2 (salt=`nim-omnichannel-salt-v1`, 100K iter)
2. [ ] Verificar fingerprint: `ebba8cf932354988`
3. [ ] Conectar a `ws://72.60.123.163:9876`
4. [ ] Enviar handshake con 6 capabilities
5. [ ] Verificar `handshake_ack` (fingerprint)
6. [ ] Recibir `skills_update` → poblar panel con 11 skills + badges PC/VPS
7. [ ] Loop: user_message/audio → streaming → tool_calls → tool_results

---

## 14. Arquitectura del Ecosistema

```
┌────────────────── VPS (72.60.123.163) ──────────────────┐
│                                                          │
│  Hermes Agent (DeepSeek V4 Pro)  :8642                   │
│    │                                                     │
│    ├── Plugin nim-pc (6 tools registradas)               │
│    │     └── canal de control → ws://localhost:9876       │
│    │                                                     │
│  nim_wss_server.py  :9876                                │
│    ├── Canal Nim PC (E2EE AES-256-GCM)                   │
│    │     • handshake, chat, voz, tool_calls              │
│    │     • streaming SSE, sesiones, interrupt            │
│    │     • modelos, soul docs, skills                    │
│    └── Canal de control (localhost plaintext)            │
│          • dispatch_tool → Nim PC                        │
│                                                          │
│  Dashboard Web  :3001 (HTTPS Cloudflare)                 │
└──────────────────────────────────────────────────────────┘
         │                              ▲
         │ HTTP/SSE                     │ WSS E2EE
         ▼                              │
   ┌──────────┐              ┌─────────────────────┐
   │ Navegador │              │   Nim PC (Tauri)     │
   │ (Chrome)  │              │   App escritorio     │
   └──────────┘              │   Windows            │
                             │                      │
                             │ • Terminal (PS/CMD)  │
                             │ • Filesystem         │
                             │ • Chrome (CDP)       │
                             │ • Mic + Altavoces    │
                             │ • Patch / Grep / Dir │
                             └─────────────────────┘
```

---

**FIN DEL DOCUMENTO MAESTRO**

*Commits: `d949c7b` (Plugin) → `c5040fe` (Chat) → `95d6610` (Contexto Omnicanal) → `cfe262a` (UI Models/Soul) → `8cd5165` (Streaming/Sesiones/Interrupt) → `c3c3894` (6 Tools PC)*
