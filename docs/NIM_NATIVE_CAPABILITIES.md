# Capacidades Nativas de Nim PC (Referencia para Hermes)

**Contexto para Hermes:** Este documento es la única y última fuente de verdad sobre las herramientas nativas que la aplicación de Windows de tu Creador (Nim PC) soporta a través del WebSocket (WSS). Úsalo para ajustar los argumentos exactos de tus `tool_call`.

## 1. Arquitectura de Herramientas WSS

Cuando tú (Hermes, desde el VPS) quieras alterar la máquina local del Creador, debes enviar un `tool_call` cifrado a Nim PC.
Nim PC recibe el JSON, lo descifra, lo ejecuta nativamente en Rust (Tauri IPC), y te devuelve un `tool_result` cifrado con el mismo `call_id`.

---

## 2. Herramientas Nativas Disponibles (Especificación Exacta)

A continuación, se listan las herramientas con los nombres de parámetros **exactos** que Nim PC está programado para aceptar. Si usas nombres de parámetros diferentes, el cliente arrojará un error de incompatibilidad.

### 2.1 `nim_terminal`
Ejecuta comandos Bash/PowerShell o aplicaciones en el entorno Windows subyacente.
- `command` *(String, Obligatorio)*: El comando a ejecutar (ej. `npm run dev`, `dir`, `python script.py`).
- `cwd` *(String, Opcional)*: El directorio de trabajo desde donde ejecutar el comando.

### 2.2 `nim_filesystem`
Gestión de lectura y escritura bruta de archivos (CRUD completo). Útil para sobrescribir archivos pequeños completos.
- `action` *(String, Obligatorio)*: La acción a realizar (`"read"`, `"write"`).
- `path` *(String, Obligatorio)*: Ruta absoluta del archivo (ej. `C:\\Users\\user\\Desktop\\app.js`).
- `content` *(String, Opcional)*: El contenido a escribir (sólo obligatorio si `action` es `"write"`).

### 2.3 `nim_patch_file` (NUEVO - Agentic Skill)
Para reemplazar una línea de código o bloque de texto específico sin tener que leer y sobrescribir el archivo completo. Excelente para no gastar tokens.
- `path` *(String, Obligatorio)*: Ruta absoluta del archivo.
- `old_string` *(String, Obligatorio)*: El texto exacto que quieres buscar en el archivo para reemplazar. **Debe ser idéntico**, incluyendo espacios en blanco.
- `new_string` *(String, Obligatorio)*: El texto nuevo con el que vas a reemplazar el `old_string`.

### 2.4 `nim_list_dir` (NUEVO - Agentic Skill)
Devuelve un JSON con el contenido de una carpeta para que analices la estructura del proyecto del Creador antes de codificar.
- `path` *(String, Obligatorio)*: La ruta de la carpeta.
- `depth` *(Int, Opcional)*: Profundidad de búsqueda (Por defecto: 1). *(Nota: Actualmente está restringido a 1 nivel por cuestiones de rendimiento local)*.

### 2.5 `nim_grep_search` (NUEVO - Agentic Skill)
Permite buscar un patrón de texto, variable o función en todo un proyecto usando PowerShell nativo.
- `pattern` *(String, Obligatorio)*: El texto o Regex a buscar (ej. `function login`).
- `path` *(String, Obligatorio)*: El directorio base de búsqueda.
- `file_glob` *(String, Opcional)*: Filtro de extensión (ej. `*.ts`). Si se omite, busca en todos los archivos `*`.
- `max_results` *(Int, Opcional)*: Límite de líneas devueltas para no saturar tu memoria de contexto (Por defecto: 50).

---

## 3. Comandos de la UI al VPS (Recordatorio)

La UI local enviará los siguientes eventos WSS hacia ti cuando el Creador interactúe con los botones:
- `get_models`: Pide que devuelvas `models_list`.
- `switch_model`: Te indica que el Creador eligió otro LLM (argumento: `modelId`).
- `get_soul`: Pide que devuelvas el estado de tu Matrice (`soul_data`).
- `update_soul`: Te envía un bloque actualizado (`block` y `content`) que tú debes guardar en tu memoria.

### 4. Flujo de Audio (Local TTS)
**Hermes**, ten en cuenta que el audio hablado (Text-To-Speech) hacia el Creador ahora se renderiza **localmente en el PC** con las voces nativas de Windows para prevenir bloqueos de CORS/403 en WebView2. Sigue emitiendo tus chunks de texto normalmente (`bot_message` u eventos SSE), Nim PC se encarga de hablarlo sin necesidad de la nube de Google.
