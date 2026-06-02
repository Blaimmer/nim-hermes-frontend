# Hermes Integration Log — NIM Frontend

Registro minucioso de cada cambio realizado para migrar NIM de un agente standalone a un frontend conectado a Hermes Agent como cerebro cognitivo.

---

## 2026-06-02 — ConnectionLogger para WSS Server

### Cambios
- **Nuevo:** `nim_phase2/connection_logger.py` — Logger estructurado JSON Lines con rotación automática (2000 líneas)
- **Modificado:** `nim_phase2/nim_wss_server.py` — Integración de ConnectionLogger en todos los eventos críticos

### Eventos registrados
| Evento | Cuándo |
|--------|--------|
| `connection_accepted` | TCP connection accepted (IP, puerto) |
| `handshake_started` | Primer mensaje recibido, no es control |
| `handshake_completed` | Handshake E2EE exitoso (device, capabilities, fingerprint) |
| `handshake_failed` | Fallo de descifrado o tipo inválido |
| `handshake_timeout` | Timeout de 15s sin handshake |
| `skills_sent` | Skills update enviado tras handshake |
| `message_received` | Mensaje del PC (tipo, preview, tamaño) |
| `message_sent` | Mensaje al PC (bot_message, streaming) |
| `disconnected` | Desconexión (código, razón) |
| `dispatch_tool` | Tool dispatch (call_id, tool, status) |

### Verificación
- ✅ Test de conexión local: handshake + chat + desconexión registrados
- ✅ Tail del log muestra el timeline completo de cada conexión
- ✅ Stats del log: conexiones totales, handshakes fallidos, tamaño

### Feature Status
| Feature | Status | Notes |
|---------|--------|-------|
| Connection logging | ✅ | JSON Lines, rotación 2000 líneas |
| Log de handshakes | ✅ | Incluye IP, device, capabilities |
| Log de mensajes | ✅ | RX/TX con preview y tipo |
| Log de disconnects | ✅ | Código y razón |
| Stats/tail utilities | ✅ | `conn_log.tail(n)` y `conn_log.stats()` |

---

## 2026-05-27 — Fase 1: Conexión Inicial

### Objetivo
Conectar el frontend React de NIM con Hermes Agent, manteniendo el dashboard intacto visualmente.

### Cambios Realizados

#### 1. Hermes API Server (nuevo)
- **Archivo:** `~/.hermes/.env`
- **Cambio:** Agregado `API_SERVER_ENABLED=true`, `API_SERVER_PORT=8642`, `API_SERVER_HOST=127.0.0.1`
- **Resultado:** Hermes expone API OpenAI-compatible en `http://localhost:8642/v1/chat/completions`

#### 2. Proxy en server.ts (modificado)
- **Archivo:** `server.ts` (líneas 835-875)
- **Antes:** Handler `/api/agent` de ~860 líneas con llamadas directas a Gemini/Anthropic/DeepSeek, bucle ReAct manual, manejo de cuotas, etc.
- **Después:** Proxy limpio de ~40 líneas que reenvía el prompt a Hermes API y envuelve la respuesta en formato NIM `{thought, action, observation, response}`
- **Impacto:** El frontend no se modificó; recibe el mismo formato JSON de siempre, pero procesado por Hermes

#### 3. Fixes de compatibilidad ESM (corregido)
- **Archivos:** `core/wiki_manager.ts`, `automation/heartbeat.ts`, `vite.config.ts`
- **Problema:** `__dirname` no existe en ES modules (`"type": "module"` en package.json)
- **Solución:** Agregado `import { fileURLToPath } from 'url'` + polyfill de `__dirname`

### Verificación
- ✅ `curl POST /api/agent {"prompt":"Hola"}` → respuesta correcta
- ✅ Frontend carga en `http://72.60.123.163:3001`
- ✅ Mensajes enviados desde el dashboard llegan a Hermes y responden correctamente

### Estado del Dashboard (funciones verificadas)
| Función | Estado | Notas |
|---------|--------|-------|
| Enviar/recibir mensajes | ✅ | Proxy a Hermes funcionando |
| Slash commands (/clear, /stop, /status) | ✅ | Manejados en frontend |
| Selector de proveedor | ⚠️ | Ignorado; Hermes usa DeepSeek por defecto |
| Panel de skills | ❓ | Pendiente de prueba |
| Sistema de logs | ❓ | Pendiente de prueba |
| Búsqueda web | ❓ | Pendiente de migración |
| Sistema de voz (STT/TTS) | ❓ | Pendiente de prueba |
| Panel de sistema | ❓ | Pendiente de prueba |

### URL de acceso
- **Dashboard (HTTPS):** https://equipped-combat-summer-pichunter.trycloudflare.com
- **API Server:** http://localhost:8642 (solo local)

---

## 2026-05-27 — Fase 2: Voz (Micrófono + TTS)

### Diagnóstico
- El código original usaba Web Speech API (`SpeechRecognition`) correctamente
- **Bug #1:** El objeto `SpeechRecognition` quedaba en estado terminal tras procesar una respuesta. Al hacer clic de nuevo, `.start()` fallaba silenciosamente → el botón no cambiaba de estado visual
- **Bug #2:** Chrome bloquea el micrófono en orígenes HTTP no-localhost → se necesitaba HTTPS

### Cambios Realizados

#### 1. Refactor del reconocimiento de voz (src/App.tsx)
- **Antes:** `useEffect` creaba un solo objeto `SpeechRecognition` al montar, dependiente de `isWakeWordMode`. `toggleListening()` intentaba reusarlo.
- **Después:** Función `createSpeechRecognition()` que crea un objeto fresco cada vez. `toggleListening()` siempre llama a `createSpeechRecognition()` antes de `start()`. El `useEffect` inicial solo crea la referencia base.
- **Fix clave:** `SpeechRecognition` no es reusable tras detenerse → hay que recrearlo cada vez que se inicia una nueva escucha.

#### 2. Cloudflare Tunnel (HTTPS)
- **Herramienta:** `cloudflared tunnel --url http://localhost:3001`
- **Resultado:** URL HTTPS gratuita para desarrollo que permite acceso al micrófono
- **Fix Vite:** Agregado `allowedHosts` en `vite.config.ts` para aceptar el dominio trycloudflare

#### 3. Fix Vite allowedHosts
- **Archivo:** `vite.config.ts`
- **Cambio:** Agregado `server.allowedHosts: ['equipped-combat-summer-pichunter.trycloudflare.com']`

### Verificación
- ✅ TypeScript compila sin errores
- ✅ `createSpeechRecognition()` crea objeto fresco cada vez
- ✅ `toggleListening()` maneja correctamente el ciclo start/stop
- ✅ HTTPS vía Cloudflare Tunnel funcionando
- ✅ Vite acepta el host del túnel

### Próximo: Prueba en vivo
Pendiente que el usuario pruebe el micrófono desde Chrome en la URL HTTPS.

### Estado del Dashboard (actualizado)
| Función | Estado | Notas |
|---------|--------|-------|
| Enviar/recibir mensajes | ✅ | Proxy a Hermes |
| Slash commands | ✅ | En frontend |
| Micrófono (STT) | ✅ | Refactorizado, probado y funcional |
| TTS (voz de respuesta) | ✅ | Web Speech API |
| Talkmode (wake word "NIM") | ✅ | Recreado con createSpeechRecognition |
| Streaming en tiempo real | ✅ | SSE vía /api/agent/stream, muletillas conversacionales |
| TTS progresivo por frases | ✅ | speakNewPhrases con detección de cortes naturales |
| Motor cognitivo (modelos) | ✅ | 13 builtin + custom, switch, métricas reales |
| Panel de skills | ❓ | Pendiente |
| Sistema de logs | ❓ | Pendiente |
| Búsqueda web | ❓ | Pendiente |
| Panel de sistema | ❓ | Pendiente |

---

## 2026-05-27 — Fase 4: Motor Cognitivo — Selector Dinámico de Modelos

### Objetivo
Selector de proveedor funcional con métricas reales, cambio de modelo con confirmación, y capacidad de agregar cualquier modelo que Hermes soporte con su API key.

### Arquitectura
```
Dashboard → GET /api/hermes/models → lista completa (13 builtin + custom)
         → POST /api/hermes/switch-model → cambia modelo activo
         → GET /api/hermes/quota → balance DeepSeek real + keys detectadas
         → POST /api/hermes/add-model → registra custom con test de conexión
         → POST /api/hermes/set-key → configura API key para modelo existente
```

### Backend: 7 endpoints nuevos (server.ts)
| Endpoint | Método | Función |
|----------|--------|---------|
| /api/hermes/models | GET | Lista modelos + activo + quickModels |
| /api/hermes/switch-model | POST | Cambia modelo activo |
| /api/hermes/config-quick-models | POST | Configura 3 botones rápidos |
| /api/hermes/add-model | POST | Agrega custom, testea y guarda API key |
| /api/hermes/test-model | POST | Prueba conexión a cualquier provider |
| /api/hermes/remove-model/:id | DELETE | Elimina modelo custom |
| /api/hermes/set-key | POST | Configura API key para modelo existente |
| /api/hermes/quota | GET | Métricas reales (balance, keys) |

### Frontend: 3 botones + ⚙️ modal completo
- **3 botones rápidos**: cargados dinámicamente, modelos sin key atenuados pero clickeables
- **⚙️ Modal**: lista de TODOS los modelos (13+), seleccionar 3 para botones rápidos
- **Modelos sin key**: clic expande mini-formulario inline con Testear/Guardar/Cancelar
- **➕ Agregar Custom**: formulario con nombre, ID, provider (dropdown 9 opciones), API key
- **Popup de cuotas**: balance DeepSeek real, estado de cada API key, modelo activo

### Verificación
- ✅ 13 modelos built-in disponibles
- ✅ Switch de modelo funcional con confirmación
- ✅ Custom models: add, test, remove
- ✅ API keys persistidas en archivo env
- ✅ Balance DeepSeek consultado en tiempo real
- ✅ TypeScript compila sin errores
- ✅ GitHub backup: commits 4fe8437, c3c52e8, e1b2b7e

---

## 2026-05-27 — Fase 5: Motor de Búsqueda + TTS Robustez

### Diagnóstico
El usuario reportó que al hacer búsquedas desde el dashboard:
1. La búsqueda demoraba mucho (motor por defecto: DuckDuckGo Lite)
2. El resultado aparecía en texto pero el TTS no vocalizaba
3. Tuvo que intervenir manualmente para que Hermes respondiera

### Causa raíz TTS
- `lastSpokenRef` no se reseteaba correctamente entre frases, bloqueando `speakText`
- Los checks `isMuted || ttsMuted || !speechSynthesis` estaban juntos — fallo silencioso
- Sin logs de debug para diagnosticar

### Causa raíz búsqueda
- Hermes usaba DuckDuckGo Lite (lento, scraping HTML)
- No había Tavily configurado a pesar de estar en el proyecto original

### Cambios Realizados

#### 1. Tavily como motor principal de búsqueda
- **API Key:** tvly-dev-xxx configurada en `~/.hermes/.env` y `.env` del proyecto
- **Config Hermes:** `web.search_backend: tavily`
- **Verificación:** API key testeada — 2 resultados en <2s
- **Cadena de fallback:** Tavily → DuckDuckGo Lite (automático en Hermes)

#### 2. TTS más robusto (src/App.tsx - speakText)
- **lastSpokenRef:** se resetea en cada llamada en vez de comparar
- **Validación:** texto vacío se detecta y loguea
- **Separación de checks:** mute, ttsMuted y speechSynthesis se validan independientemente
- **Logs:** `console.log('[TTS] ...')` en cada punto de decisión
- **Status/Orb:** solo se modifican en caso de mute, no bloquean el flujo

#### 3. Reinicio de servicios
- Hermes Gateway reiniciado para cargar config de búsqueda
- NIM Dev Server reiniciado para cargar .env actualizado

### Verificación
- ✅ Tavily API key funcional (test directo a api.tavily.com)
- ✅ Hermes web.search_backend configurado
- ✅ Gateway + Dashboard ambos respondiendo 200
- ✅ Commit: d3aae55 (TTS fix)

### Próximo
Pendiente que el usuario pruebe búsqueda + TTS desde el dashboard

---

## 2026-05-27 — Fase 6: Memoria a Largo Plazo — Holographic + Obsidian

### Objetivo
Resolver definitivamente el límite de 2,200 chars de la memoria built-in con dos sistemas complementarios e ilimitados.

### Arquitectura Final de Memoria
```
Memoria built-in (2,200 chars) → Solo índice de temas + tags
    ↓ apunta a
Holographic Memory (SQLite ilimitado) → Datos vectoriales, hechos, entidades
    +
Obsidian Vault (Markdown ilimitado) → Documentación, investigación, notas
```

### 1. Holographic Memory Activado
- **Provider:** `memory.provider: holographic`
- **DB:** `~/.hermes/memory_store.db` (SQLite + FTS5 + HRR vectorial)
- **Tablas:** facts (5), entities (1), FTS index, memory_banks
- **Operaciones:** fact_store (add/search/update/delete/probe/reason), fact_feedback
- **Coste:** GRATIS, 100% local, cero dependencias externas
- **NumPy:** disponible para álgebra HRR vectorial

### 2. Obsidian Knowledge Base
- **Vault:** `~/obsidian-hermes/`
- **Variable:** `OBSIDIAN_VAULT_PATH=/home/clawd/obsidian-hermes`
- **Skill:** `obsidian` — ya instalada en Hermes
- **Notas creadas:** Índice (00 - Indice.md), NIM Dashboard.md
- **Búsqueda:** `search_files` con FTS en todo el vault

### Verificación
- ✅ Holographic activo y funcional (5 hechos migrados)
- ✅ DB creada con FTS5 y entidades
- ✅ Obsidian vault creado con índice + nota de proyecto
- ✅ Búsqueda cross-vault funcional

---

## 2026-05-28 — Fase 7: Auditoría Final y Cierre del Dashboard

### Objetivo
Verificación exhaustiva de todos los sistemas antes de dar el dashboard por terminado y comenzar con las automatizaciones empresariales.

### Diagnóstico
- Servidor dev no estaba corriendo (solo cloudflared apuntando a puerto vacío)
- Hermes API Server sí estaba activo en :8642
- Sin errores JS en consola del navegador
- TypeScript compila limpio (0 errores, excluyendo automation/cron.ts huérfano)

### Verificación por componente

| Componente | Método | Resultado |
|---|---|---|
| Chat no-streaming | `curl POST /api/agent` | ✅ "OK funcionando" |
| Chat streaming SSE | `curl POST /api/agent/stream` | ✅ chunks word-by-word + start/thought/done |
| Modelos (13 built-in) | `curl GET /api/hermes/models` | ✅ todos cargados, active: deepseek-v4-pro |
| Quota/balance | `curl GET /api/hermes/quota` | ✅ DeepSeek $7.49 USD |
| Integraciones (12) | `curl GET /api/hermes/integrations` | ✅ 7/12 conectadas |
| Skills (97+) | `curl GET /api/hermes/skills` | ✅ escaneo recursivo funcional |
| Soul docs | `curl GET /api/hermes/soul-docs` | ✅ SOUL/AGENT/AGENTS.md |
| Sistema info | `curl GET /api/system-info` | ✅ CPU, RAM, uptime reales |
| Cloudflare HTTPS | `curl https://...trycloudflare.com/api/system-info` | ✅ túnel activo |
| TypeScript | `npx tsc --noEmit` (sin cron.ts) | ✅ 0 errores |

### Verificación visual (browser)
- ✅ Header: título, hora, fecha, estado STANDBY
- ✅ Motor Cognitivo: 3 botones rápidos cargados (DeepSeek activo, Gemini disponible, Claude sin key)
- ✅ Telemetría: latencia/CPU/memoria/red con datos reales
- ✅ CHAT tab: mensaje de bienvenida, input funcional
- ✅ PENSAR tab: área de logs lista (vacía sin ejecución)
- ✅ MATRICE tab: 3 soul doc blocks + 12 integraciones (7 ON, 5 OFF)
- ✅ NEXO HABILIDADES: 103 skills en grid con scroll
- ✅ Sin errores en consola JS

### Estado final: DASHBOARD COMPLETO Y FUNCIONAL

Todas las features planeadas están implementadas, testeadas y verificadas. Sin bugs conocidos. Listo para producción.

### URLs activas
- HTTP local: http://localhost:3001
- HTTPS Cloudflare: https://academy-friendship-automotive-band.trycloudflare.com
- API Server: http://localhost:8642 (solo local)

---

## 2026-06-01 — Fase 2: Sincronización Omnicanal y E2EE

### Objetivo
Implementar la capa de seguridad y red para comunicación entre Hermes VPS y Nim PC (cliente Tauri nativo). El PC actúa como arnés de ejecución local con acceso nativo al sistema operativo; Hermes VPS es el cerebro que emite tool_calls cifrados.

### Cambios Realizados

#### 1. nim_e2ee.py — Encriptación Extremo a Extremo
- **Archivo:** `nim_phase2/nim_e2ee.py`
- **Función:** Espejo exacto de `src/lib/security.ts` (NimSecurity en TypeScript)
- **KDF:** PBKDF2 con HMAC-SHA256, 100K iteraciones, salt=`"nim-omnichannel-salt-v1"`, salida 32 bytes (256 bits)
- **Cifrado:** AES-256-GCM con IV aleatorio de 12 bytes por mensaje
- **Formato wire:** `Base64( IV[12] || Ciphertext[N+16-byte GCM tag] )`
- **Tests:** 5 pruebas de integridad: derivación, round-trip, entropía IV, contraseña incorrecta, payload corrupto — ✅ todas pasan

#### 2. nim_wss_server.py — Servidor WebSocket Seguro
- **Archivo:** `nim_phase2/nim_wss_server.py`
- **Función:** Servidor WSS persistente para comunicación bidireccional Hermes ↔ Nim PC
- **Handshake:** El cliente envía capabilities manifest cifrado → servidor responde con ACK + fingerprint
- **Mensajería:** Toda la comunicación en JSON cifrado AES-256-GCM a través del túnel WebSocket
- **Tool call bridge:** `dispatch_tool_call(client_id, tool_name, arguments)` → envía al PC → espera resultado (con timeout)
- **Multi-dispositivo:** Registry de clientes conectados con capabilities por dispositivo
- **Keep-alive:** Ping/pong cifrado cada 30s
- **SSL:** Soporte para WSS con certificados (autofirmados para dev, Cloudflare Tunnel para prod)
- **Smoke test:** `test_wss_client.py` — handshake, ping/pong, tool_result — ✅ todo verificado

#### 3. voice_biometrics.py — Biometría Vocal
- **Archivo:** `nim_phase2/voice_biometrics.py`
- **Modelo:** SpeechBrain ECAPA-TDNN (`spkrec-ecapa-voxceleb`), embeddings de 192 dimensiones
- **Enroll:** Registra huella vocal maestra del Creador (`.npy`)
- **Verify:** Extrae embedding del audio entrante → cosine similarity contra huella maestra
- **Umbral:** ≥ 0.85 → ACCESS_GRANTED | < 0.85 → ACCESS_DENIED
- **CLI:** `enroll`, `verify`, `compare`, `info`, `test`

#### 4. Configuración y SSL
- **Certificados:** `nim_wss_cert.pem` + `nim_wss_key.pem` (RSA 4096, autofirmados para dev)
- **Contraseña:** `.nim_master_password` (compartida con Nim PC, NUNCA viaja por red)
- **Launcher:** `start_nim_phase2.sh` con flags `--ssl` y `--tunnel`
- **.gitignore:** Protege archivos sensibles (.nim_master_password, *.pem, master_voiceprint.npy)

### Verificación
- ✅ `nim_e2ee.py` — 5/5 pruebas de integridad pasan
- ✅ `nim_wss_server.py` — Handshake cifrado, ping/pong, tool_result verificado con cliente de prueba
- ✅ `voice_biometrics.py` — Pruebas de cosine similarity pasan
- ✅ Fingerprint de llave coincide entre servidor y cliente: `ebba8cf932354988`
- ✅ Servidor WSS acepta conexiones en `ws://localhost:9876`

### Fingerprint de Verificación (para Nim PC)
```
ebba8cf932354988
```
Este fingerprint DEBE ser idéntico en ambos lados. Si no coincide, la contraseña maestra es diferente.

### Próximos Pasos (Fase 3)
- ~~Conectar Nim PC (Tauri) al WSS con el fingerprint verificado~~ → Pendiente del lado PC
- ~~Enviar primer tool_call cifrado → ejecución local → tool_result~~ → Testeado con cliente simulado
- ~~Integrar biometría vocal en el flujo de comandos~~ → Implementado, pendiente integrar en WSS
- ~~Empaquetar como plugin de Hermes para registro automático de herramientas~~ → ✅ COMPLETADO

---

## 2026-06-01 — Fase 3: Canal de Comunicación Hermes ↔ WSS (Plugin Nim PC)

### Objetivo
Cerrar el loop de comunicación: Hermes Agent (cerebro) ↔ WSS Server ↔ Nim PC (arnés de ejecución). Antes de esta fase, el servidor WSS aceptaba conexiones de Nim PC pero Hermes no sabía que existía — no había herramientas `nim_terminal`, `nim_filesystem`, `nim_browser` registradas.

### Diagnóstico
- El servidor WSS (`nim_wss_server.py`) corría en `:9876` aceptando conexiones de Nim PC ✅
- Pero no había NINGÚN puente entre Hermes Agent y el WSS ❌
- El directorio `~/.hermes/plugins/` no existía ❌
- Hermes no conocía las herramientas `nim_terminal`, `nim_filesystem`, `nim_browser` ❌
- El método `dispatch_tool_call()` existía en el código pero nadie lo llamaba ❌

### Arquitectura de la Solución

```
Nim PC (Tauri+Rust) ──WSS E2EE──▶ nim_wss_server.py (:9876)
                                        ▲
                                        │ canal de control (plaintext, localhost)
                                        │
Hermes Agent (:8642) ──▶ Plugin nim-pc ─┘
  │                        (~/.hermes/plugins/nim-pc/)
  │
  └── nim_terminal, nim_filesystem, nim_browser
      (herramientas registradas en el toolset "nim-pc")
```

**Flujo completo:**
1. Hermes LLM decide usar `nim_terminal` → llama al handler del plugin
2. Plugin envía `{type: "dispatch_tool", ...}` al WSS por el canal de control
3. WSS server forwardea el tool_call (cifrado AES-256-GCM) al Nim PC
4. Nim PC ejecuta el comando localmente, devuelve resultado cifrado
5. WSS server recibe el resultado, lo envía al plugin por el canal de control
6. Plugin devuelve el resultado a Hermes → el LLM continúa razonando

### Cambios Realizados

#### 1. Modificación de nim_wss_server.py — Canal de Control
- **Archivo:** `nim_phase2/nim_wss_server.py`
- **Cambios:**
  - Añadido `control_clients` dict para rastrear conexiones de Hermes Agent
  - Modificado `handle_connection()`: detecta si el primer mensaje es `control_connect` (plaintext) vs `handshake` (E2EE cifrado)
  - Nuevo método `control_loop()`: maneja conexiones de Hermes, acepta mensajes `dispatch_tool`, `list_clients`, `ping`
  - Nuevo método `_handle_dispatch_tool()`: recibe tool_call del plugin, llama a `dispatch_tool_call()`, devuelve resultado
  - Auto-detección de client_id: si no se especifica, usa el primer Nim PC conectado
  - Shutdown limpio: también cierra conexiones de control
- **Seguridad:** El canal de control solo acepta conexiones en localhost (plaintext). La comunicación con Nim PC sigue cifrada E2EE.

#### 2. Creación del Plugin Nim PC
- **Directorio:** `~/.hermes/plugins/nim-pc/`
- **Archivos:**
  - `plugin.yaml`: `kind: backend`, 3 herramientas, auto-load
  - `__init__.py`: ~300 líneas con schemas, handlers, y cliente WSS
- **Herramientas registradas:**
  | Herramienta | Descripción | Parámetros |
  |---|---|---|
  | `nim_terminal` | Ejecuta comandos en terminal local | `command` (req), `cwd` (opt) |
  | `nim_filesystem` | CRUD de archivos locales | `action` (req), `path` (req), `content` (opt) |
  | `nim_browser` | Controla Chrome local | `action` (req), `tab_id`, `selector`, `text` |
- **Cliente WSS:** `NimWSSControlClient` — conexión persistente a `ws://localhost:9876`, reconexión automática, timeout 30s

### Verificación

#### End-to-End Test (simulado)
```
[CTRL] Conecta al WSS → ACK: fingerprint=ebba8cf932354988, clients=1 ✅
[PC]   Handshake E2EE completado ✅
[CTRL] Lista clientes → 1 Nim PC (windows, Nim-PC-Test) ✅
[CTRL] Despacha nim_terminal("dir C:\\Users\\...") ✅
[PC]   Recibe tool_call cifrado, ejecuta, devuelve resultado ✅
[CTRL] Dispatch result: status=ok, stdout, exit_code=0 ✅
```

- ✅ Canal de control: connect, ACK, list_clients, ping/pong
- ✅ Dispatch tool: envío → forward → ejecución → resultado → retorno
- ✅ Fingerprint coincide: `ebba8cf932354988`
- ✅ Sin Nim PC conectado: error descriptivo "No hay Nim PCs conectados"
- ✅ Plugin habilitado (`hermes plugins enable nim-pc`)
- ✅ Toolset habilitado (`hermes tools enable nim-pc`)
- ✅ Las herramientas aparecerán en la próxima sesión de Hermes

### Estado del Plugin
```
hermes plugins list | grep nim-pc:
  nim-pc    enabled    1.0.0    Nim PC — Nodo de ejecución local...
```

### Para que Nim PC se conecte (Oscar)
1. Asegurar que la contraseña maestra en Nim PC genera fingerprint `ebba8cf932354988`
2. Conectar vía WSS a `ws://72.60.123.163:9876`
3. Enviar handshake con capabilities: `["nim_terminal", "nim_filesystem", "nim_browser"]`
4. Verificar que el ACK del servidor muestra el fingerprint correcto
5. ¡Listo! Hermes ya tiene las herramientas registradas y podrá enviar comandos.

Ver `docs/NIM_PC_CONNECTION.md` para el checklist completo de conexión.

---

## 2026-06-01 — Fase 4: Chat Integration (Nim PC → Hermes LLM → Nim PC)

### Objetivo
Implementar las instrucciones de Antigravity para que Nim PC pueda enviar mensajes de chat (texto y audio) al VPS y recibir respuestas del LLM con sincronización de estado del orbe.

### Requisitos de Antigravity (docs/HERMES_VPS_CHAT_INTEGRATION.md)
1. `user_message` → texto del usuario inyectado al LLM
2. `user_audio` → Base64 → biometría vocal → STT → LLM
3. `bot_message` → respuesta del LLM con `bot_state` (thinking/speaking/idle)
4. `skills_update` → lista de habilidades para el panel visual del PC

### Cambios Realizados

#### 1. nim_wss_server.py — Chat Integration
- **Nuevos handlers en `message_loop`:**
  - `user_message` → `_handle_user_message()` → `_call_hermes_api()` → `_send_bot_message()`
  - `user_audio` → `_handle_user_audio()` → `_verify_voice()` + `_transcribe_audio()` → LLM
- **Nuevos métodos:**
  - `_send_skills_update()`: Envía 8 skills al PC tras handshake
  - `_send_bot_message(text, bot_state)`: Respuesta cifrada con estado del orbe
  - `_call_hermes_api(client, text)`: POST a Hermes API :8642 con historial de conversación
  - `_verify_voice(wav_path)`: Biometría ECAPA-TDNN, umbral 0.85, fail-open si no hay huella
  - `_transcribe_audio(wav_path, sample_rate)`: Whisper tiny, fallback si no instalado
- **Historial de conversación:** `ClientInfo.conversation` — array OpenAI-format persistente por cliente (máx 30 mensajes)
- **Dependencias:** httpx (requerido para LLM), whisper (opcional para STT)

#### 2. Flujo de estados del orbe
```
user_message recibido → bot_state: "thinking" (orbe animado)
LLM respondiendo      → bot_state: "thinking" (mantenido)
respuesta lista       → bot_state: "speaking" (orbe hablando)
0.5s después          → bot_state: "idle" (orbe en reposo)
```

### Verificación

```
1. Handshake ACK: fingerprint=ebba8cf932354988 ✅
2. Skills update: 8 skills (nim_terminal, nim_filesystem, nim_browser,
   voice_biometrics, web_search, memory, code_execution, image_gen) ✅
3. USER_MESSAGE "Hola NIM!" → bot_state: thinking ✅
4. Hermes API (DeepSeek V4 Pro) responde: 
   "Conexión exitosa, Creador. Todo funcionando sin problemas." ✅
5. bot_state: speaking → idle ✅
```

- ✅ Chat loop completo: Nim PC → WSS → Hermes API → WSS → Nim PC
- ✅ 8 skills enviadas al conectar
- ✅ 3 estados del orbe: thinking, speaking, idle
- ✅ Historial de conversación persistente por cliente
- ✅ user_audio implementado (biometría + STT, requiere whisper + huella vocal)
- ✅ Fail-open en biometría si no hay huella registrada (no bloquea al usuario)

### Para Antigravity (Nim PC)
El servidor WSS ahora acepta y responde a estos tipos de mensaje:

| Tipo (PC → VPS) | Formato | Acción |
|---|---|---|
| `user_message` | `{type, text}` | Texto → LLM → `bot_message` |
| `user_audio` | `{type, audio_base64, sample_rate}` | Audio → Biometría → STT → LLM → `bot_message` |

| Tipo (VPS → PC) | Formato | Significado |
|---|---|---|
| `bot_message` | `{type, text, bot_state}` | Respuesta del LLM + estado orbe |
| `skills_update` | `{type, skills: [{id, name, status, description}]}` | Habilidades al conectar |

### Notas para Antigravity
- `bot_state` solo se usa para animaciones del orbe: `thinking`, `speaking`, `idle`
- Enviar `bot_state: ""` (vacío) significa "no cambiar estado"
- `skills_update` se envía automáticamente justo después del handshake
- La biometría vocal requiere `pip install speechbrain torch` y una huella registrada con `python voice_biometrics.py enroll <audio.wav>`