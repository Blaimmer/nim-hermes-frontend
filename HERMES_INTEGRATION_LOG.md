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
