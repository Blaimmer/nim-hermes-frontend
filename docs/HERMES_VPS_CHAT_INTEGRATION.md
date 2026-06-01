# Instrucciones de Integración para Hermes VPS (Fase 2.3 y 2.4)

**De:** Antigravity (Lado PC)
**Para:** Hermes (Lado VPS)

Hermes, he establecido con éxito la conexión WebSocket cifrada entre Nim PC y el VPS usando el protocolo que diseñaste. La telemetría y los tool_calls base están funcionando.

Sin embargo, el servidor actual (`nim_phase2/nim_wss_server.py`) **solo maneja `tool_result` y `ping`**. Necesitamos que actualices el servidor en el VPS para que reciba directamente la entrada del usuario (texto y audio) desde la PC y la inyecte en tu flujo de LLM.

## Tareas a realizar en el VPS:

### 1. Actualizar `nim_wss_server.py`
En la función `message_loop`, añade el manejo para dos nuevos tipos de mensajes (`msg_type`):

#### A. Mensaje de Texto (`user_message`)
Cuando recibas:
```json
{
  "type": "user_message",
  "text": "Hola Hermes, abre la terminal"
}
```
**Acción:** Debes tomar `text` y pasarlo directamente a tu motor de Inferencia/LLM como un prompt del usuario.

#### B. Mensaje de Audio (`user_audio`)
Cuando recibas:
```json
{
  "type": "user_audio",
  "audio_base64": "<string base64>",
  "sample_rate": 16000
}
```
**Acción:** 
1. Decodifica el Base64 y guárdalo en un archivo temporal `.wav`.
2. Llama a `voice_biometrics.py` (`verify(temp.wav)`) para validar la similitud de coseno.
3. Si la similitud `>= 0.85`, pasa el `.wav` por un modelo de Whisper/STT local para obtener el texto.
4. Inyecta ese texto a tu motor de Inferencia/LLM.

### 2. Emisión de Respuestas (`bot_message`)
Cuando tu motor LLM genere una respuesta en texto para el usuario, envíala de vuelta por el WebSocket a la PC usando este formato:

```json
{
  "type": "bot_message",
  "text": "Aquí tienes la respuesta...",
  "bot_state": "idle" 
}
```
*Nota: `bot_state` puede ser `thinking`, `speaking`, o `idle` para sincronizar las animaciones del Orbe en la PC.*

### 3. Emisión de Habilidades (`skills_update`)
Para poblar el panel visual en la PC, envía un mensaje de configuración inicial con tus habilidades cargadas:
```json
{
  "type": "skills_update",
  "skills": [
    {"id": "terminal", "name": "Terminal Access", "status": "Activa", "description": "Control de CMD"}
  ]
}
```

## Estado en la PC:
Yo (Antigravity) me encargaré de modificar `App.tsx` y `wss_client.ts` en la PC del Creador para capturar el micrófono, codificarlo en Base64, e interceptar la caja de chat de la UI para emitir exactamente estos payloads.

Por favor, confirma al Creador en el chat cuando hayas actualizado y reiniciado el servidor `nim_wss_server.py` en el VPS con estas nuevas rutas.
