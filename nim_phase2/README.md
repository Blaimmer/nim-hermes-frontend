# Nim Phase 2 — Módulos de Seguridad y Red

Capa de comunicación segura entre **Hermes VPS** (cerebro) y **Nim PC** (arnés de ejecución local).

## Módulos

### `nim_e2ee.py` — Encriptación Extremo a Extremo
Espejo exacto de `src/lib/security.ts` (TypeScript → Python).
- **PBKDF2** (HMAC-SHA256, 100K iteraciones, salt fijo)
- **AES-256-GCM** (IV aleatorio de 12 bytes por mensaje)
- Formato wire: `Base64( IV[12] || Ciphertext[N + 16-byte GCM tag] )`

```bash
# Probar el módulo
python3 nim_e2ee.py
```

### `nim_wss_server.py` — Servidor WebSocket Seguro
Servidor WSS persistente para comunicación bidireccional de baja latencia.
- Handshake inicial con capabilities manifest (cifrado)
- Toda mensajería cifrada AES-256-GCM
- Bridge de tool_calls: Hermes → WSS → Nim PC → ejecución local → resultado
- Multi-dispositivo (registry de clientes)
- Ping/pong keep-alive cada 30s

### `voice_biometrics.py` — Biometría Vocal
Verificación de hablante con SpeechBrain ECAPA-TDNN.
- Embeddings de 192 dimensiones
- Cosine similarity contra huella maestra
- Umbral: ≥ 0.85 → acceso concedido

```bash
# Registrar huella
python3 voice_biometrics.py enroll /ruta/a/voz_creador.wav

# Verificar
python3 voice_biometrics.py verify /ruta/a/muestra.wav

# Comparar dos voces
python3 voice_biometrics.py compare voz1.wav voz2.wav

# Pruebas unitarias
python3 voice_biometrics.py test
```

## Configuración

### 1. Contraseña Maestra
Editar `.nim_master_password` con la misma contraseña que usa Nim PC:
```bash
echo "tu-contraseña-super-segura" > .nim_master_password
chmod 600 .nim_master_password
```

### 2. Iniciar Servidor
```bash
# Desarrollo (ws://)
python3 nim_wss_server.py --port 9876

# Con SSL (wss://)
python3 nim_wss_server.py --port 9876 --ssl-cert nim_wss_cert.pem --ssl-key nim_wss_key.pem

# Usando el launcher
./start_nim_phase2.sh              # ws://
./start_nim_phase2.sh --ssl        # wss:// (cert autofirmado)
./start_nim_phase2.sh --tunnel     # wss:// via Cloudflare
```

### 3. Probar Conexión
```bash
python3 test_wss_client.py
```

## Dependencias
```
pip3 install --break-system-packages websockets cryptography speechbrain
```

## Fingerprint de Verificación
Ambos lados (PC y VPS) deben mostrar el mismo fingerprint:
```bash
python3 -c "from nim_e2ee import NimE2EE; print(NimE2EE.verify_key_fingerprint('tu-contraseña'))"
```
