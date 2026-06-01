# Protocolo de Enrutamiento de Interfaz Visual (UI ↔ WSS)

**De:** Antigravity (Frontend Arquitecto)
**Para:** Hermes (Backend VPS)

Hermes, la migración de la interfaz gráfica a una aplicación nativa de escritorio independiente (.exe con Tauri) nos ha dejado con un problema arquitectónico: los botones de control de modelos y guardado de memoria (Soul) en la interfaz intentan comunicarse con la antigua API REST (`/api/hermes/...`) que ya no existe.

Debemos enrutar todas las acciones de la UI visual a través de nuestro túnel WebSocket seguro existente (NimE2EE). He actualizado el cliente `wss_client.ts` en la PC para enviar los siguientes payloads cifrados.

**TU TAREA:** Debes modificar tu bucle principal en `nim_wss_server.py` (`message_loop`) para atrapar estos nuevos `msg_type` e implementar la lógica correspondiente.

---

### 1. Petición de Modelos Disponibles
La UI te pedirá la lista de modelos cada vez que el usuario abra la pestaña de configuración.

**UI envía:**
```json
{
  "type": "get_models"
}
```

**TÚ respondes (inmediatamente):**
```json
{
  "type": "models_list",
  "models": [
    {
      "id": "deepseek-v4-pro",
      "name": "DeepSeek V4 Pro",
      "provider": "openai",
      "active": true
    },
    ...
  ]
}
```
*(Nota: Estructura la lista como necesites, pero la UI espera un array `models` con objetos que tengan `id`, `name`, `provider` y `active`)*

---

### 2. Petición para Cambiar Modelo Principal
Cuando el Creador hace clic en un botón de modelo en el panel rápido:

**UI envía:**
```json
{
  "type": "switch_model",
  "modelId": "gpt-4o"
}
```

**TÚ haces:**
- Actualizas tu estado interno para usar el nuevo modelo como motor LLM primario.
- Guardas el cambio en tu base de datos persistente si es necesario.
- (Opcional pero recomendado) Respondes con un `"type": "models_list"` actualizado para que la UI refresque sus botones.

---

### 3. Petición para Actualizar Memoria / Soul (Matrice)
Cuando el usuario edita su Human Block, Persona Block o Task Block en la UI visual y pulsa "Guardar":

**UI envía:**
```json
{
  "type": "update_soul",
  "block": "human",         // o "persona" o "task"
  "content": "Nuevos datos..."
}
```

**TÚ haces:**
- Recibes el texto.
- Actualizas tu prompt maestro de configuración (ej. reescribiendo tus archivos locales del VPS o DB de memoria a largo plazo).
- NO necesitas responder nada (la UI asume que funcionó, aunque puedes enviar un `bot_message` al usuario diciendo "Memoria actualizada").

---

### 4. Petición de Historial / Carga Inicial de Soul (Opcional)
Para poblar los campos de texto al inicio:
**UI envía:**
```json
{
  "type": "get_soul"
}
```
**TÚ respondes:**
```json
{
  "type": "soul_data",
  "humanBlock": "...",
  "personaBlock": "...",
  "taskBlock": "..."
}
```

*(Si no implementas `get_soul`, no pasa nada crítico, simplemente la UI empezará con las cajas de texto en blanco, pero es fundamental implementar `update_soul` y `switch_model`).*

---

Por favor, confirma al Creador cuando hayas parcheado tu `nim_wss_server.py` para soportar estos nuevos tipos de mensajes. Yo ya estoy programando el Frontend para enviarlos.
