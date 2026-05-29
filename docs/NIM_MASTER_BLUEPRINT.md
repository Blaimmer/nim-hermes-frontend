# NIM Master Blueprint: The Omnichannel Omniscient Agent

Este documento es la hoja de ruta técnica suprema para la evolución de **NIM** y **Hermes Agent**. Define la arquitectura para escalar el dashboard web actual hacia un ecosistema de aplicaciones nativas (Escritorio y Móvil) con control profundo del sistema, escucha activa, y biometría de voz.

---

## 1. Arquitectura de Nodos de Ejecución (El Ecosistema)

El ecosistema se divide estrictamente entre el **Cerebro Central (VPS)** y los **Nodos Sensoriales/Motores (Dispositivos)**.

### 1.1 Hermes Agent (VPS - El Cerebro)
- **Rol:** Almacena la memoria a largo plazo (SQLite/Obsidian), procesa el LLM, gestiona las conexiones con MCPs de nube (Google, Notion, GitHub).
- **Comunicación:** Expone un WebSocket seguro (WSS) al cual los nodos (PC, Móvil) se conectan. Emite comandos de acción (`ActionRequests`) para que los dispositivos físicos los ejecuten.

### 1.2 Nim PC (Desktop App - Windows, Mac, Linux)
- **Tecnología a usar:** **Tauri (Rust + React)**. 
  - *¿Por qué no Electron?* Tauri consume ~30MB de RAM frente a los ~300MB de Electron, crucial para un agente que siempre estará en segundo plano. Además, Rust permite acceso al sistema de bajo nivel con seguridad absoluta.
- **Capacidades:** Ejecución de comandos de terminal, manipulación del sistema de archivos, instalación de programas, y comunicación con la extensión de Chrome vía *Native Messaging*.
- **Factibilidad:** **100% Factible.** Al correr nativamente, tiene permisos totales de usuario/administrador.

### 1.3 Nim Mobile (App Android e iOS)
- **Tecnología a usar:** **React Native**. Permite reutilizar la lógica de la interfaz (UI) del dashboard actual de React.
- **Android (Deep Control):**
  - *Factibilidad:* **Muy Alta**. Android permite usar `Accessibility Services` (Servicios de Accesibilidad) y permisos de lectura de notificaciones/SMS. Nim Mobile podrá "leer" la pantalla, enviar mensajes de WhatsApp automatizando toques, y abrir/gestionar otras apps instaladas.
- **iOS (Deep Control):**
  - *Factibilidad:* **Limitada (Restricciones del OS)**. Apple utiliza un *Sandbox* estricto. Nim Mobile **no podrá** controlar WhatsApp directamente simulando toques en la pantalla ni leer SMS libremente.
  - *Mitigación para iOS:* Usaremos la API de *Siri Shortcuts* (Atajos) y *Deep Links* (`whatsapp://send?text=...`) para interactuar con otras apps hasta donde Apple lo permita.

---

## 2. Escucha Activa y Biometría ("Wake Word" y Espectro Vocal)

Tu visión es que NIM siempre esté escuchando, despierte con un comando específico y **sólo** te obedezca a ti basándose en la frecuencia de tu voz.

### 2.1 Always-Listening (Wake Word)
Estar transmitiendo audio al VPS 24/7 es inviable (latencia y privacidad). El dispositivo debe escuchar localmente.
- **Tecnología:** **openWakeWord** (ONNX) o **Picovoice Porcupine**.
- **Cómo funciona:** La app (Nim PC o Mobile) corre un modelo pequeñísimo en segundo plano que gasta ~5MB de RAM. Solo escucha una palabra ("Oye NIM" o "Despierta Hermes"). 
- Al detectar la palabra mágica, se abre el micrófono principal para grabar el comando real.

### 2.2 Validación Biométrica (Speaker Verification)
Una vez que el micrófono graba el comando (ej. "Borra la carpeta de descargas"), antes de obedecer, verifica tu identidad:
- **Tecnología:** **SpeechBrain** o **Resemblyzer** (Ejecutándose de preferencia en el VPS por potencia, o un modelo ONNX ligero en local).
- **El Flujo Biométrico:**
  1. Hablas.
  2. El audio se procesa en un vector acústico (Embedding de 256 dimensiones).
  3. Se compara contra tu *Voiceprint* (Huella Vocal) registrada en la base de datos usando similitud de coseno.
  4. Si la similitud es menor al 85% (Ej. alguien más dice tu palabra de activación), el agente responde: *"Identidad vocal no reconocida, acceso denegado"*.
  5. Si es > 85%, el comando se procesa.

---

## 3. ¿Qué necesitamos cambiar en el Dashboard Actual?

Para migrar a esta visión, el repositorio actual sufrirá una metamorfosis.

1. **Desacoplar la UI de los Sensores:** El dashboard actual captura el micrófono usando la Web Speech API del navegador. Hay que modificarlo para que la entrada de audio pueda venir desde el motor nativo de Tauri (Rust) o React Native (Java/Swift).
2. **Implementar el Router de Comandos:** Actualmente el frontend solo *recibe* respuestas de Hermes. Debemos añadir un listener en el WebSocket para que cuando Hermes envíe un evento tipo `EXECUTE_LOCAL_TOOL`, el frontend lo intercepte, corra el comando en Tauri/React Native, y le devuelva el `stdout/stderr` a Hermes.
3. **Registro de Capacidades (Handshake):** Al iniciar la app, Nim debe enviarle a Hermes un manifiesto: *"Hola Hermes, soy Nim Windows. Mis herramientas locales son [terminal, filesystem]"*. O *"Soy Nim iOS. Mis herramientas locales son [camera, gps, shortcuts]"*.

---

## 4. Repositorios y Referencias Recomendadas
Para la integración, nos basaremos en los estándares de estos ecosistemas:
- **Tauri Framework:** [https://tauri.app/](https://tauri.app/) (Para compilar Nim PC).
- **openWakeWord:** [https://github.com/dscripka/openWakeWord](https://github.com/dscripka/openWakeWord) (Para la detección offline de la palabra de activación).
- **SpeechBrain Speaker Verification:** [https://github.com/speechbrain/speechbrain](https://github.com/speechbrain/speechbrain) (Para la biometría de voz).
- **Model Context Protocol (MCP):** Para mantener la estandarización de las herramientas en todos los nodos.
