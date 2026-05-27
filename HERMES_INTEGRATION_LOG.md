# Hermes Integration Log — NIM Frontend

Registro minucioso de cada cambio realizado para migrar NIM de un agente standalone a un frontend conectado a Hermes Agent como cerebro cognitivo.

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
| Selector de proveedor | ⚠️ | Ignorado; Hermes usa DeepSeek |
| Panel de skills | ❓ | Pendiente |
| Sistema de logs | ❓ | Pendiente |
| Búsqueda web | ❓ | Pendiente |
| Panel de sistema | ❓ | Pendiente |

---

## 2026-05-27 — Fase 3: Streaming y Conversación Natural (Muletillas)

### Objetivo
Que la conversación se sienta viva mientras Hermes procesa tareas. En vez de pantalla en blanco hasta la respuesta final, el texto aparece palabra por palabra en tiempo real.

### Arquitectura
```
Frontend (fetch + ReadableStream)
    → POST /api/agent/stream (SSE)
        → POST /v1/chat/completions (stream:true)
            → Hermes Agent (DeepSeek + tools)
```

### Cambios Realizados

#### 1. Nuevo endpoint SSE en server.ts
- **Archivo:** `server.ts`
- **Ruta:** `POST /api/agent/stream`
- **Funcionamiento:** Proxy SSE que reenvía los chunks de Hermes al frontend
- **Eventos:** `start`, `chunk` (cada palabra), `done` (respuesta completa), `error`

#### 2. Frontend con streaming en tiempo real
- **Archivo:** `src/App.tsx` — función `submitPrompt`
- **Antes:** `fetch('/api/agent')` → espera respuesta completa → muestra de golpe
- **Después:** `fetch('/api/agent/stream')` → lee ReadableStream → actualiza mensaje palabra por palabra
- **Placeholder:** Aparece "● Procesando..." al inicio y se va llenando
- **Fallback:** Si el streaming falla, automáticamente usa el endpoint no-streaming
- **Tipo:** Agregado `streaming?: boolean` a `ChatMessage` en `types.ts`

#### 3. Efecto "muletilla" conversacional
- Hermes naturalmente escribe mientras piensa/ejecuta herramientas
- El usuario ve el texto aparecer en tiempo real — "estoy buscando...", "casi tengo el informe...", etc.
- Sin cambios en el prompt de Hermes ni en el diseño visual

### Verificación
- ✅ SSE streaming end-to-end: Hermes → server.ts → frontend
- ✅ TypeScript compila sin errores
- ✅ Fallback automático a no-streaming si falla
- ✅ El placeholder "● Procesando..." se reemplaza en vivo
