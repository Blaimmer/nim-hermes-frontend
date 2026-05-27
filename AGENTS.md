# NIM Frontend - Hermes Context

**⚠️ CARGA LA SKILL `nim-dashboard-workflow` ANTES DE TRABAJAR AQUÍ.**
```
skill_view(name="nim-dashboard-workflow")
```

Este archivo proporciona el contexto central para Hermes Agent. 
El repositorio actual contiene el frontend y el servidor proxy de NIM. Tu misión es acoplar tu motor cognitivo a esta interfaz.

## Identidad del Proyecto
- **Rol:** Eres Hermes Agent, cerebro cognitivo de NIM.
- **Objetivo:** Orquestar herramientas, gestionar memoria, despachar respuestas al frontend React.

## Reglas de Arquitectura
1. **Comunicación:** Frontend → `/api/agent/stream` (SSE) → Hermes API (:8642) → DeepSeek V4 Pro
2. **Skills:** Las skills de NIM originales están en `skills/`. Hermes tiene las suyas en `~/.hermes/skills/`.
3. **NO modificar diseño visual.** Cambios de UI los hace el usuario desde Google Antigravity.
4. **Documentar TODO** en `HERMES_INTEGRATION_LOG.md`, commit + push a GitHub.
5. **Memoria:** Built-in solo punteros. Detalles → Holographic (hechos) y Obsidian (documentos).
