# HERMES TOOL PROTOCOL — Guía de Integración para Nim PC

Este documento define con exactitud milimétrica cómo Hermes Agent emite comandos, espera resultados, y cómo Nim PC debe comportarse como su "arnés de ejecución local" sin fricción alguna.

---

## 1. Resumen de Arquitectura de Hermes

Hermes Agent se compone de estos módulos críticos:

| Módulo | Archivo | Función |
|---|---|---|
| **Cerebro** | `run_agent.py` | Loop principal de conversación. Clase `AIAgent` |
| **Registro de Tools** | `tools/registry.py` | Registro central, descubrimiento automático por AST |
| **Despacho de Tools** | `model_tools.py` | Orquestación: descubre schemas, despacha llamadas, recoge resultados |
| **Toolsets** | `toolsets.py` | Agrupaciones lógicas de herramientas. Solo las incluidas aquí se exponen al LLM |
| **API Server** | `gateway/platforms/api_server.py` | Servidor FastAPI compatible con OpenAI |
| **Hooks** | `gateway/hooks.py` | Sistema de eventos del ciclo de vida |

---

## 2. Formato Exacto de Tool Calls (Hermes → Nim PC)

Cuando Hermes decide ejecutar una herramienta, el LLM emite un `tool_call` en uno de estos dos formatos:

### 2.1 Formato OpenAI (API Server)
```json
{
  "role": "assistant",
  "content": null,
  "tool_calls": [
    {
      "id": "call_abc123",
      "type": "function",
      "function": {
        "name": "terminal",
        "arguments": "{\"command\": \"dir C:\\\\Users\\\\Creador\\\\Desktop\"}"
      }
    }
  ]
}
```

### 2.2 Formato XML Nativo (Hermes Native)
```xml
<tool_call>
{
  "name": "terminal",
  "arguments": {
    "command": "dir C:\\Users\\Creador\\Desktop"
  }
}
</tool_call>
```

> **REGLA PARA NIM PC:** Nim PC debe ser capaz de parsear **AMBOS** formatos. Detectar si el payload contiene `<tool_call>` (XML) o `tool_calls[]` (JSON) y actuar en consecuencia.

---

## 3. Formato Exacto de Tool Results (Nim PC → Hermes)

Después de ejecutar el comando localmente, Nim PC debe devolver el resultado **siempre como JSON string**:

### 3.1 Formato OpenAI
```json
{
  "role": "tool",
  "tool_call_id": "call_abc123",
  "content": "{\"stdout\": \"Contenido del directorio...\", \"exit_code\": 0}"
}
```

### 3.2 Formato XML Nativo
```xml
<tool_response>
{
  "tool_call_id": "call_abc123",
  "name": "terminal",
  "content": "{\"stdout\": \"Contenido del directorio...\", \"exit_code\": 0}"
}
</tool_response>
```

### 3.3 Formato de Error
```json
{
  "role": "tool",
  "tool_call_id": "call_abc123",
  "content": "{\"error\": \"Permiso denegado: no se puede acceder a C:\\\\Windows\\\\System32\"}"
}
```

> **REGLA CRÍTICA:** Los handlers SIEMPRE devuelven `json.dumps()`. NUNCA un dict crudo, NUNCA una excepción. Los errores se encapsulan en `{"error": "mensaje"}`.

---

## 4. Registro de Herramientas (Cómo Nim PC se anuncia a Hermes)

Hermes ofrece **3 métodos** para que un sistema externo registre herramientas. Nim PC usará los 3 según el contexto:

### 4.1 Plugin Python (Para herramientas embebidas)
```
~/.hermes/plugins/nim-pc/
├── plugin.yaml
├── __init__.py
└── tools.py
```

**plugin.yaml:**
```yaml
name: nim-pc
version: "1.0"
description: "Nim PC — Nodo de ejecución local del ecosistema NIM"
```

**__init__.py:**
```python
import json

def register(ctx):
    # Terminal local
    ctx.register_tool(
        name="nim_terminal",
        schema={
            "name": "nim_terminal",
            "description": "Ejecuta un comando en la terminal local de Windows/Mac/Linux del Creador",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Comando a ejecutar"},
                    "cwd": {"type": "string", "description": "Directorio de trabajo (opcional)"}
                },
                "required": ["command"]
            }
        },
        handler=nim_terminal_handler
    )

    # Sistema de archivos local
    ctx.register_tool(
        name="nim_filesystem",
        schema={
            "name": "nim_filesystem",
            "description": "Operaciones sobre el sistema de archivos local del Creador",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["read", "write", "delete", "list", "mkdir"]},
                    "path": {"type": "string", "description": "Ruta absoluta"},
                    "content": {"type": "string", "description": "Contenido para escritura (solo para 'write')"}
                },
                "required": ["action", "path"]
            }
        },
        handler=nim_filesystem_handler
    )

    # Control del navegador local
    ctx.register_tool(
        name="nim_browser",
        schema={
            "name": "nim_browser",
            "description": "Controla el navegador Chrome local del Creador via extensión NIM",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["get_tabs", "read_tab", "click", "type", "navigate"]},
                    "tab_id": {"type": "integer", "description": "ID de la pestaña objetivo"},
                    "selector": {"type": "string", "description": "Selector CSS del elemento"},
                    "text": {"type": "string", "description": "Texto a escribir o URL a navegar"}
                },
                "required": ["action"]
            }
        },
        handler=nim_browser_handler
    )
```

### 4.2 MCP Server (Para conexión remota VPS ↔ PC)
Cuando Nim PC corra en la PC del Creador y Hermes en el VPS, Nim PC expondrá un servidor MCP HTTP:

**En `~/.hermes/config.yaml` del VPS:**
```yaml
mcp_servers:
  nim-pc:
    url: "https://creator-pc.duckdns.org:9443"
    headers:
      Authorization: "Bearer TOKEN_BIOMETRICO_ENCRIPTADO"
    enabled: true
    timeout: 30
    tools:
      include: ["nim_terminal", "nim_filesystem", "nim_browser", "nim_apps"]
```

### 4.3 Skill (Para workflows complejos)
```
~/.hermes/skills/nim-pc/
└── SKILL.md
```

```yaml
---
name: nim-pc-control
description: Controla el PC local del Creador (terminal, archivos, navegador, apps)
version: 1.0.0
author: Creador
metadata:
  hermes:
    tags: [system-control, local-execution, nim-pc]
    requires_toolsets: [nim-pc]
---
# Instrucciones
Cuando el Creador pida ejecutar algo en su PC local, usa las herramientas
nim_terminal, nim_filesystem, o nim_browser según corresponda.
Siempre confirma acciones destructivas antes de ejecutarlas.
```

---

## 5. Streaming SSE (Eventos que Nim PC debe parsear)

### 5.1 API de Chat Completions (`/v1/chat/completions`)
```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hola"},"index":0}]}
```

### 5.2 Progreso de Herramientas (Custom Event)
```
event: hermes.tool.progress
data: {"tool_call_id": "call_123", "name": "web_search", "status": "started", "emoji": "🔍", "label": "Buscando..."}
```
```
event: hermes.tool.progress
data: {"tool_call_id": "call_123", "name": "web_search", "status": "completed", "emoji": "✅", "label": "Búsqueda completa"}
```

> **MAPEO AL ORBE:** `status: "started"` → Orbe en amarillo (THINKING). `status: "completed"` → Esperar al siguiente chunk de texto.

### 5.3 API de Responses (`/v1/responses`)
Flujo ordenado de eventos:
1. `response.created` — Inicio de respuesta
2. `response.output_item.added` — Nuevo item (reasoning, function_call, message)
3. `response.function_call.arguments.delta` — Argumentos incrementales del tool_call
4. `response.function_call_output.done` — Resultado del tool ejecutado
5. `response.output_text.delta` — Texto incremental de la respuesta
6. `response.completed` — Ciclo completo (contiene usage stats)

---

## 6. Las 40+ Herramientas Core de Hermes

Hermes trae estas herramientas integradas que Nim PC debe respetar y complementar (NO duplicar):

### Herramientas de Nube (Las maneja Hermes en el VPS)
| Herramienta | Función |
|---|---|
| `web_search` | Búsqueda web |
| `web_extract` | Extracción de contenido de URLs |
| `image_generate` | Generación de imágenes |
| `text_to_speech` | Síntesis de voz (servidor) |
| `vision_analyze` | Análisis de imágenes |
| `session_search` | Búsqueda en historial de sesiones |
| `memory` | Gestión de memoria persistente |
| `todo` | Lista de tareas |
| `delegate_task` | Delegación a sub-agentes |
| `send_message` | Envío de mensajes cross-platform |
| `cronjob` | Tareas programadas |

### Herramientas Locales (Las ejecuta Nim PC como arnés)
| Herramienta | Función | Nim PC Responsibility |
|---|---|---|
| `terminal` | Ejecución de comandos | Nim PC intercepta y ejecuta en la shell local |
| `read_file` | Lectura de archivos | Nim PC lee del filesystem local |
| `write_file` | Escritura de archivos | Nim PC escribe en el filesystem local |
| `patch` | Edición quirúrgica de archivos | Nim PC aplica el patch localmente |
| `search_files` | Búsqueda en archivos | Nim PC ejecuta grep/ripgrep local |
| `execute_code` | Ejecución de scripts Python | Nim PC corre el script en proceso hijo |
| `browser_*` | 12 herramientas de navegador | Nim PC delega a la extensión Chrome via CDP |

---

## 7. Conexión API del VPS

### Configuración del Servidor API de Hermes
```bash
# En ~/.hermes/.env del VPS:
API_SERVER_ENABLED=true
API_SERVER_KEY=tu_token_secreto_aqui
API_SERVER_PORT=8642
```

### Endpoints que Nim PC consumirá
| Endpoint | Método | Uso |
|---|---|---|
| `/v1/chat/completions` | POST | Enviar mensajes y recibir respuestas (stateless) |
| `/v1/responses` | POST | Enviar mensajes con estado de conversación (stateful) |
| `/v1/models` | GET | Verificar que Hermes está vivo |
| `/health` | GET | Health check |

### Headers requeridos
```
Authorization: Bearer tu_token_secreto_aqui
Content-Type: application/json
X-Hermes-Session-Id: nim-pc-session-001  (opcional, para continuidad de sesión)
```

---

## 8. Sistema de Hooks (Eventos del Ciclo de Vida)

Hermes emite eventos en cada etapa. Nim PC puede suscribirse a ellos:

| Evento | Cuándo se dispara |
|---|---|
| `gateway:startup` | Hermes arranca |
| `session:start` | Nueva sesión de conversación |
| `before:tool_call` | Justo antes de ejecutar una herramienta |
| `after:tool_call` | Justo después de ejecutar una herramienta |
| `agent:end` | Fin de un turno del agente |
| `command:*` | Cualquier slash command |

### Estructura de Hook para Nim PC
```
~/.hermes/hooks/nim-pc-sync/
├── HOOK.yaml
└── handler.py
```

**HOOK.yaml:**
```yaml
name: nim-pc-sync
events:
  - before:tool_call
  - after:tool_call
  - agent:end
```

**handler.py:**
```python
async def handle(event_name, payload, ctx):
    if event_name == "before:tool_call":
        # Notificar a Nim PC que una herramienta está por ejecutarse
        # → Cambiar el Orbe a THINKING
        pass
    elif event_name == "after:tool_call":
        # Notificar resultado
        # → Cambiar el Orbe según éxito/error
        pass
```

---

## 9. Memoria y Persistencia (Omnicanalidad)

| Sistema | Archivo | Función |
|---|---|---|
| **MEMORY.md** | `~/.hermes/MEMORY.md` | Hechos del entorno, lecciones aprendidas. Se inyecta en el system prompt |
| **USER.md** | `~/.hermes/USER.md` | Preferencias del Creador, estilo de comunicación |
| **SOUL.md** | `~/.hermes/SOUL.md` | Personalidad y prompt de sistema del agente |
| **SQLite FTS5** | `~/.hermes/hermes.db` | Búsqueda full-text cross-sesión con resumen por LLM |
| **Honcho** | Integrado | Modelado dialéctico del usuario (evoluciona con el tiempo) |

> **CLAVE OMNICANAL:** Toda esta memoria vive en el VPS. Cuando Nim PC o Nim Mobile se conectan, la conversación se mantiene continua porque el `thread_id` es único por usuario, no por dispositivo.

---

## 10. Protocolos de Comunicación Usados por Hermes

| Protocolo | Dónde se usa | Relevancia para Nim PC |
|---|---|---|
| **REST/HTTP** | API Server (`/v1/*`), MCP HTTP servers | Principal canal de comunicación |
| **SSE** | Streaming de respuestas | Para el Orbe y TTS en tiempo real |
| **WebSocket** | Gateway de mensajería (Discord, Telegram, etc.) | Para conexión persistente PC ↔ VPS |
| **Unix Domain Socket** | `execute_code` RPC local (Linux/Mac) | Si empaquetamos Hermes en local |
| **Loopback TCP** | `execute_code` RPC local (Windows) | Fallback para Windows |
| **stdio** | MCP servers locales | Para herramientas MCP embebidas |
| **CDP** | Chrome DevTools Protocol | Control del navegador local |

---

## 11. Diagrama de Flujo: Comando del Creador → Ejecución en PC

```
┌──────────┐    Audio     ┌──────────┐   WSS/HTTPS   ┌──────────────┐
│ Creador  │ ──────────→  │  Nim PC  │ ────────────→  │ Hermes (VPS) │
│ (Habla)  │              │ (Tauri)  │                │  (Cerebro)   │
└──────────┘              └──────────┘                └──────────────┘
                               │                            │
                               │  1. STT → Texto            │
                               │  2. Biometría → OK         │
                               │  3. Envía texto al VPS ───→│
                               │                            │ 4. LLM razona
                               │                            │ 5. Emite tool_call
                               │  ←── SSE: tool_call ───────│
                               │                            │
                               │  6. Parsea tool_call       │
                               │  7. Ejecuta en shell local │
                               │  8. Devuelve tool_result ─→│
                               │                            │ 9. LLM procesa resultado
                               │  ←── SSE: chunk texto ─────│
                               │                            │
                               │  10. TTS → Altavoz         │
                               │  11. Orbe → SPEAKING       │
                               └────────────────────────────┘
```
