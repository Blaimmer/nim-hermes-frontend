# Metodología de Contexto Omnicanal para Hermes Agent

**De:** Antigravity (Lado PC) & El Creador
**Para:** Hermes (Cerebro en VPS)

Hermes, hemos detectado un problema grave de "Alucinación de Entorno". Cuando el usuario te pide, por ejemplo, "revisa mis descargas", intentas ejecutar un comando `bash` o `ls` localmente en tu propio servidor Linux (VPS), ignorando que el usuario está hablando contigo desde su PC a través del puente WebSocket (Nim PC).

Debes entender la topología de la red actual:

## Topología
1. **Tu Cuerpo Físico (VPS):** Un servidor remoto donde ejecutas el razonamiento lógico, llamadas a APIs externas (búsquedas web, base de datos de memoria), y mantienes estado persistente.
2. **Tu Terminal Remota (Nim PC):** La PC física del usuario (Windows). Esta PC está conectada a ti mediante el WebSocket E2EE. En esta PC tienes inyectadas tus herramientas remotas registradas bajo el plugin `nim-pc` (específicamente: `nim_terminal`, `nim_filesystem`, `nim_browser`).

## Nuevas Reglas de Razonamiento (System Prompt)

Debes actualizar tu configuración o tu *System Prompt* base dinámicamente cuando recibas mensajes por el canal WSS (`user_message` o `user_audio`) para incluir este paradigma:

> "Actualmente estoy sirviendo al usuario a través del cliente 'Nim PC' (Windows). Si el usuario me pide interactuar con archivos, revisar carpetas, abrir programas, o realizar cualquier acción local en su sistema, **DEBO usar EXCLUSIVAMENTE las herramientas del plugin nim-pc** (`nim_terminal` de PowerShell o CMD, y `nim_filesystem`). NO debo intentar usar mis herramientas nativas de terminal del servidor a menos que el usuario indique explícitamente 'en el servidor' o 'en el VPS'."

## Interfaz Visual y Habilidades (Skills Update)

En la PC, el Creador tiene un panel visual de tus Habilidades ("Nexo de Habilidades"). Actualmente, envías un mensaje `skills_update` al conectarse. 
Necesitamos que en ese mensaje diferencies qué herramientas se ejecutan en qué entorno para que el usuario tenga transparencia absoluta.

Por favor, modifica el envío del evento `skills_update` en `nim_wss_server.py` para incluir un atributo `environment` (o usa la descripción) indicando dónde corre:

Ejemplo de payload deseado:
```json
{
  "type": "skills_update",
  "skills": [
    {"id": "nim_terminal", "name": "Terminal PC", "status": "Activa", "description": "Control de CMD/PowerShell en la PC local", "environment": "PC"},
    {"id": "web_search", "name": "Búsqueda Web", "status": "Activa", "description": "Acceso a Tavily", "environment": "VPS"},
    {"id": "holographic_memory", "name": "Memoria FTS5", "status": "Activa", "description": "Base de datos a largo plazo", "environment": "VPS"}
  ]
}
```

Implementa esta inyección de contexto en tu `nim_wss_server.py` antes de pasarle el prompt a tu motor LLM, de forma que tu motor sepa que su entorno primario de acción es la PC remota. Confírmale al Creador cuando lo hayas implementado.
