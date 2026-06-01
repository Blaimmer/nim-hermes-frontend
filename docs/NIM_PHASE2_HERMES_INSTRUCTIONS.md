# NIM PC: Fase 2 - Integración Omnicanal y E2EE
**Documento Técnico de Sincronización para Hermes Agent (VPS)**

Este documento resume la arquitectura técnica construida en la Fase 1 del "Nim PC" (el cliente de escritorio nativo) y define los requisitos exactos de seguridad y red que el servidor **Hermes VPS** debe implementar para completar la Fase 2 (Sincronización Omnicanal con Encriptación Extremo a Extremo).

---

## 1. Estado Actual del Cliente (Nim PC)
Nim PC ha sido migrado exitosamente a un entorno **Nativo Windows (Tauri + Rust)**. 
- **Bridge IPC:** La interfaz gráfica de React tiene conexión directa con el sistema operativo mediante un puente IPC escrito en Rust.
- **Capacidades Locales:** Nim PC puede ejecutar comandos de terminal (`nim_terminal`) y manipular el sistema de archivos (`nim_filesystem`) sin restricciones.
- **Arquitectura de Rol:** Nim PC ya NO procesa lógica de IA. Actúa exclusivamente como un "Arnés/Terminal Tonto" con capacidades nativas. Su único objetivo es escuchar al usuario y ejecutar ciegamente los `tool_calls` que Hermes VPS le envíe.

---

## 2. Requisitos de Seguridad: Encriptación Extremo a Extremo (E2EE)
Dado que Nim PC ejecutará comandos con privilegios nativos en Windows, la conexión entre el PC y el VPS debe estar **100% encriptada localmente (E2EE)** para prevenir intercepciones (Man-in-the-Middle) o falsificación de comandos.

Nim PC ya ha implementado el siguiente protocolo criptográfico. **Hermes VPS debe implementar el espejo exacto en Python:**

### A. Derivación de la Llave (KDF)
Ambos nodos (PC y VPS) compartirán una **Contraseña Maestra (Master Password)** configurada localmente por el usuario. No viajará por la red.
Para derivar la llave de cifrado (256 bits), Hermes debe usar:
- **Algoritmo:** `PBKDF2`
- **Hash:** `SHA-256`
- **Iteraciones:** `100,000`
- **Salt:** `"nim-omnichannel-salt-v1"` (string estático).
- **Longitud de salida:** `32 bytes` (256 bits).

### B. Cifrado y Descifrado (AES-GCM)
Nim PC envía y recibe todos los *payloads* usando **AES-256-GCM**.
El paquete enviado por el PC al VPS a través de WebSocket es una cadena codificada en **Base64** estructurada de la siguiente manera:
1. Se decodifica el Base64 en bytes puros.
2. Los **primeros 12 bytes** corresponden al **Vector de Inicialización (IV)**.
3. El **resto de los bytes** corresponden al **Texto Cifrado (Ciphertext)** (que incluye implícitamente el Auth Tag gestionado por GCM).

**Instrucción para Hermes:** Debes desempaquetar el Base64, separar el IV y el Ciphertext, y usar la llave PBKDF2 para descifrar el JSON en Python. Las respuestas (como los `tool_calls` hacia el PC) deben seguir exactamente la misma estructura de cifrado (generando un IV aleatorio nuevo de 12 bytes por cada mensaje).

---

## 3. Requisitos de Red (WebSockets)
Para mantener una comunicación de baja latencia bidireccional, Hermes debe levantar un servidor WebSocket seguro:
- **Endpoint requerido:** Un servidor WSS (`wss://`) persistente en el VPS.
- **Handshake Inicial:** El PC se conectará e inmediatamente enviará su manifiesto de "Capacidades" (Capabilities) cifrado.
- **Mensajería:** Toda la comunicación entre Hermes y Nim PC debe viajar en formato JSON cifrado a través de este túnel WebSocket. Nim PC ya no usará el protocolo HTTP REST estándar.

---

## 4. Requisitos de Biometría Vocal (Próximos Pasos)
Para asegurar que solo el dueño de la PC pueda ordenar la ejecución de comandos, Nim PC grabará el audio y lo enviará (cifrado) al VPS.
**Instrucción para Hermes:** 
1. Necesitas configurar en el VPS un script de **Extracción de Embeddings de Audio** (ej. usando el modelo `Resemblyzer` de Google, o `SpeechBrain` en Python).
2. Deberás almacenar localmente en el VPS una huella vocal maestra (Master Voice Print) del usuario.
3. Cada comando de audio entrante debe ser comparado usando **Similitud del Coseno (Cosine Similarity)**. Si la similitud cae por debajo de un umbral (ej. 0.85), Hermes debe abortar el flujo y emitir un mensaje de "Acceso Denegado".

---
**FIN DEL DOCUMENTO**
*(Hermes, si comprendes estos requisitos, por favor confirma la inicialización de los scripts en Python para PBKDF2/AES-GCM y expón la URL del servidor WebSocket para conectar a Nim PC).*
