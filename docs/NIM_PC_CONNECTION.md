# NIM PC: Conexión al Servidor WSS de Hermes VPS
**Documento de Conexión para Antigravity — Nim PC (Tauri + Rust)**

Este documento contiene los datos exactos de conexión que Nim PC necesita para enlazarse con el servidor WebSocket Seguro de Hermes VPS. Leer en conjunto con `NIM_PHASE2_HERMES_INSTRUCTIONS.md` y `HERMES_TOOL_PROTOCOL.md`.

---

## 1. Datos de Conexión del VPS

### Conexión Directa (ws:// sin SSL — el cifrado E2EE protege los payloads)
```
ws://72.60.123.163:9876
```

### Conexión Segura (wss:// con SSL — recomendado para producción)
```
wss://72.60.123.163:9876
```
> **Nota SSL:** El VPS usa certificado autofirmado (RSA 4096). Nim PC debe aceptar certificados autofirmados en su cliente WebSocket (Tauri/Rust). El fingerprint del certificado se puede verificar manualmente.

---

## 2. Contraseña Maestra y Fingerprint

La contraseña maestra está en el archivo `.nim_master_password` (NO commiteado a GitHub, configurado manualmente en ambos lados).

**Fingerprint de verificación:**
```
ebba8cf932354988
```

Este fingerprint DEBE ser idéntico en Nim PC al derivar la llave con PBKDF2. Si no coincide, la contraseña maestra es diferente y la comunicación fallará con `InvalidTag` de AES-GCM.

**Para verificar desde Nim PC (TypeScript):**
```typescript
// Usar la misma función que deriveKey pero calcular fingerprint:
// SHA256(derivedKey).substring(0, 16) en hex
```

**Para verificar desde Python:**
```bash
python3 -c "from nim_e2ee import NimE2EE; print(NimE2EE.verify_key_fingerprint('tu-contraseña'))"
```

---

## 3. Protocolo de Handshake

Al conectarse al WebSocket, Nim PC DEBE enviar inmediatamente un mensaje de handshake cifrado (AES-256-GCM, Base64):

### 3.1 Manifiesto de Capacidades (Handshake Request)
```json
{
  "type": "handshake",
  "device": {
    "type": "windows",
    "name": "Nim-PC-Creador",
    "os": "Windows 11",
    "hostname": "creator-desktop"
  },
  "capabilities": ["nim_terminal", "nim_filesystem", "nim_browser"],
  "version": "2.0.0"
}
```

**Formato wire:** 
1. Serializar el JSON a string
2. Cifrar con `NimSecurity.encryptPayload(jsonString)` → Base64
3. Enviar por WebSocket como mensaje de texto

### 3.2 Respuesta del Servidor (Handshake ACK)
```json
{
  "type": "handshake_ack",
  "client_id": "<uuid-generado-por-servidor>",
  "key_fingerprint": "ebba8cf932354988",
  "server_time": "2026-06-01T20:00:00+00:00",
  "message": "Conectado. Fingerprint: ebba8cf932354988"
}
```

> **IMPORTANTE:** Nim PC debe verificar que `key_fingerprint` en la respuesta coincida con su propio fingerprint local. Si no coinciden → ABORTAR conexión.

---

## 4. Formato de Mensajes Post-Handshake

TODOS los mensajes entre Nim PC y Hermes VPS viajan cifrados con AES-256-GCM y codificados en Base64.

### 4.1 Tool Call (Hermes VPS → Nim PC)
Cuando Hermes decide ejecutar una herramienta local, envía:
```json
{
  "type": "tool_call",
  "call_id": "nim_call_a1b2c3d4e5f6",
  "tool_name": "nim_terminal",
  "arguments": {
    "command": "dir C:\\Users\\Creador\\Desktop"
  }
}
```

**Formato de herramientas disponibles** (ver `HERMES_TOOL_PROTOCOL.md` para esquema completo):

| Herramienta | Acción |
|-------------|--------|
| `nim_terminal` | `{command: string, cwd?: string}` |
| `nim_filesystem` | `{action: "read"|"write"|"delete"|"list"|"mkdir", path: string, content?: string}` |
| `nim_browser` | `{action: "get_tabs"|"read_tab"|"click"|"type"|"navigate", tab_id?: int, selector?: string, text?: string}` |

### 4.2 Tool Result (Nim PC → Hermes VPS)
Después de ejecutar, Nim PC responde:
```json
{
  "type": "tool_result",
  "call_id": "nim_call_a1b2c3d4e5f6",
  "tool_name": "nim_terminal",
  "result": {
    "stdout": " Volume in drive C is Windows\n Directory of C:\\Users\\Creador\\Desktop\n ...",
    "stderr": "",
    "exit_code": 0
  }
}
```

En caso de error:
```json
{
  "type": "tool_result",
  "call_id": "nim_call_a1b2c3d4e5f6",
  "tool_name": "nim_terminal",
  "result": {
    "error": "Permiso denegado: no se puede acceder a C:\\Windows\\System32"
  }
}
```

### 4.3 Ping/Pong (Keep-Alive)
El servidor envía ping cada 30 segundos. Nim PC debe responder con pong.
```json
{"type": "ping", "ts": 1717272000.0}
```
```json
{"type": "pong", "ts": 1717272000.1}
```

---

## 5. Flujo de Conexión (Checklist para Nim PC)

1. [ ] Cargar contraseña maestra desde configuración local
2. [ ] Derivar llave AES-256 con PBKDF2 (salt=`nim-omnichannel-salt-v1`, 100K iter, SHA-256)
3. [ ] Verificar fingerprint: debe ser `ebba8cf932354988`
4. [ ] Conectar WebSocket a `ws://72.60.123.163:9876`
5. [ ] Enviar handshake cifrado con capabilities manifest
6. [ ] Recibir `handshake_ack`, verificar fingerprint del servidor
7. [ ] Entrar en loop de mensajería: escuchar tool_calls, ejecutar, devolver tool_results
8. [ ] Responder pings con pongs

---

## 6. Código de Referencia (TypeScript)

El módulo de seguridad en Nim PC (`src/lib/security.ts`) ya implementa:
- `NimSecurity.setMasterKey(password)` — derivación PBKDF2
- `NimSecurity.encryptPayload(plaintext)` — AES-GCM → Base64
- `NimSecurity.decryptPayload(base64)` — Base64 → AES-GCM → plaintext

**Integración con Tauri (Rust):**
El WebSocket se maneja desde Rust (backend de Tauri) o desde TypeScript (frontend). Se recomienda Rust para mejor control del ciclo de vida y reconexión automática.

```rust
// Ejemplo en Rust (usando tokio-tungstenite):
// Conectar a ws://72.60.123.163:9876
// Enviar handshake cifrado
// Loop: recibir tool_calls → ejecutar → devolver tool_results
```

---

## 7. Prueba de Conexión

Para verificar que el servidor está activo antes de conectar Nim PC:

```bash
# Desde el VPS (test local)
cd nim_phase2 && python3 test_wss_client.py

# Desde Windows (PowerShell) — verificar que el puerto responde
Test-NetConnection -ComputerName 72.60.123.163 -Port 9876
```

---

**FIN DEL DOCUMENTO**
*(Antigravity, este documento contiene TODO lo necesario para que Nim PC complete la conexión. Cualquier duda, Hermes está escuchando en el WebSocket.)*
