# Hermes Agent - Developer Handoff Log

Saludos, Hermes. Si estás leyendo esto, el Señor te ha transferido el control cognitivo del proyecto NIM.
Esta es una bitácora detallada de lo que construimos recientemente en este repositorio para emular y preparar el terreno para tu arquitectura.

## 1. Lo que se ha construido en NIM

### A. Comandos Slash (`/`)
- **Dónde:** `src/App.tsx` (función `submitPrompt`).
- **Qué hace:** Intercepta comandos como `/status`, `/clear` y `/stop` antes de enviarlos al backend.
- **Acción para Hermes:** Puedes extender este interceptor o delegar los comandos a tu propio CLI/Gateway.

### B. Webhooks Seguros
- **Dónde:** `server.ts` (ruta `POST /api/webhook/execute`).
- **Qué hace:** Permite disparar flujos agénticos desde el exterior usando un Bearer token.
- **Acción para Hermes:** Tu Gateway ya expone APIs similares, por lo que podrías migrar los scripts externos (ej. Zapier) para que apunten a tu API nativa (`/v1/chat/completions`) o a un webhook propio.

### C. Automatización (Heartbeat y Cron)
- **Dónde:** `automation/cron.ts` y `automation/heartbeat.ts`.
- **Qué hace:** Levanta un proceso cron en Node que despierta al agente cada 30 minutos para leer `data/standing_orders.md`.
- **Acción para Hermes:** Puedes absorber `standing_orders.md` dentro de tu configuración de cron nativa (`AGENTS.md`) y dar de baja el demonio de Node.

### D. Memoria Wiki (Largo Plazo)
- **Dónde:** `core/wiki_manager.ts` y herramientas `wiki_write`/`wiki_search`.
- **Qué hace:** Guarda recuerdos en formato Markdown estructurado dentro de `data/wiki/`.
- **Acción para Hermes:** Tu arquitectura usa SQLite FTS5 y `MEMORY.md`. Deberás sincronizar o migrar los archivos de la bóveda Wiki de NIM hacia tu base de datos relacional para no perder el progreso.

### E. Computer Use (Fundaciones)
- **Dónde:** `server.ts` (herramienta `computer_use`).
- **Qué hace:** Delega acciones (click, type, screenshot) al backend.
- **Acción para Hermes:** Puedes mapear esto directamente a tu backend de ejecución nativa (Local/Daytona) o usar un servidor MCP de Computer Use oficial.

## 2. Instrucciones Inmediatas de Integración
1. Arranca tu API Server (ej. `hermes gateway`).
2. Modifica la ruta de `fetch('/api/agent', ...)` en `src/App.tsx` (línea ~686) para que apunte a `http://localhost:8642/v1/chat/completions`.
3. Adapta el payload JSON del frontend para que cumpla con el estándar de mensajes de OpenAI o implementa el protocolo JSON-RPC si usas la TUI Gateway para UI rica.
4. Migra las carpetas de `skills/` hacia `~/.hermes/skills/`.

Buena suerte. El Señor confía en ti.
