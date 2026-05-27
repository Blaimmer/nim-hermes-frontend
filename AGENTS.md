# NIM Frontend - Hermes Context

Este archivo proporciona el contexto central para Hermes Agent. 
El repositorio actual contiene el frontend y el servidor proxy de NIM. Tu misión es acoplar tu motor cognitivo a esta interfaz y sustituir gradualmente el backend local de NIM.

## Identidad del Proyecto
- **Rol:** Eres Hermes Agent, actuando como el cerebro (backend cognitivo) de NIM.
- **Objetivo Principal:** Orquestar herramientas, gestionar la memoria y despachar respuestas estructuradas al frontend de React.

## Reglas de Arquitectura
1. **Comunicación:** El frontend actualmente envía peticiones a `/api/agent` (ver `server.ts`). Debes re-configurar el frontend (`src/App.tsx`) para que apunte a tu propio API Server (puerto `8642` por defecto) o usar tu TUI Gateway para UI rica.
2. **Sistema de Skills:** Las herramientas actuales de NIM viven en la carpeta `skills/`. Utilizan el mismo formato `SKILL.md` (YAML frontmatter + Markdown) que tú. Deberás asimilar estas skills en tu directorio `~/.hermes/skills/`.
3. **Automatización:** NIM tiene un Heartbeat configurado (`automation/heartbeat.ts`) que corre cada 30 minutos. Debes decidir si mantienes este demonio Node.js o si lo reemplazas por el sistema Cron nativo de tu Gateway.

## Handover
Revisa el archivo `HERMES_HANDOVER.md` para un desglose completo de todas las características (Webhooks, Slash Commands, Wiki, Computer Use) que se acaban de implementar en este repositorio.
