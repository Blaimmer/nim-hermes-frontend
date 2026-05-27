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
- **Dashboard:** http://72.60.123.163:3001
- **API Server:** http://localhost:8642 (solo local)
