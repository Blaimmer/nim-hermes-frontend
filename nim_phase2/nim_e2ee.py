"""
Nim Phase 2 — End-to-End Encryption (E2EE) Module
Mirror exacto de src/lib/security.ts (NimSecurity)

Protocolo:
  - PBKDF2(HMAC-SHA256, salt="nim-omnichannel-salt-v1", iterations=100000) → 32-byte key
  - AES-256-GCM con IV aleatorio de 12 bytes por mensaje
  - Formato wire: Base64( IV[12 bytes] || Ciphertext[N bytes + 16-byte GCM tag] )

El ciphertext producido por AES-GCM incluye implícitamente el auth tag de 16 bytes.
La biblioteca cryptography lo maneja automáticamente.
"""

import os
import base64
import hashlib
import hmac
import secrets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

# ─── Constantes (espejo exacto de security.ts) ───
SALT: bytes = b"nim-omnichannel-salt-v1"
PBKDF2_ITERATIONS: int = 100000
PBKDF2_HASH = hashes.SHA256()
AES_KEY_LENGTH: int = 32  # 256 bits
IV_LENGTH: int = 12       # 96 bits (GCM standard)


class NimE2EE:
    """Capa de cifrado E2EE para comunicación Nim PC ↔ Hermes VPS."""

    def __init__(self, master_password: str | None = None):
        """
        Inicializa la capa de cifrado.
        Si se proporciona master_password, deriva la llave inmediatamente.
        """
        self._key: bytes | None = None
        if master_password is not None:
            self.set_master_key(master_password)

    # ─── Derivación de llave (KDF) ───

    def set_master_key(self, password: str) -> None:
        """
        Deriva una llave AES-256 (32 bytes) desde la contraseña maestra usando PBKDF2.
        Espejo exacto de NimSecurity.setMasterKey() en security.ts.
        """
        if not password:
            raise ValueError("Master password cannot be empty")

        kdf = PBKDF2HMAC(
            algorithm=PBKDF2_HASH,
            length=AES_KEY_LENGTH,
            salt=SALT,
            iterations=PBKDF2_ITERATIONS,
        )
        self._key = kdf.derive(password.encode("utf-8"))

    @property
    def key(self) -> bytes:
        if self._key is None:
            raise RuntimeError(
                "Security Key not initialized. Call set_master_key first."
            )
        return self._key

    @property
    def is_initialized(self) -> bool:
        return self._key is not None

    # ─── Cifrado ───

    def encrypt_payload(self, plaintext: str) -> str:
        """
        Cifra un string plano → Base64( IV[12] || Ciphertext ).
        Espejo exacto de NimSecurity.encryptPayload().

        Returns:
            String Base64 conteniendo IV concatenado con ciphertext.
        """
        if not self._key:
            raise RuntimeError(
                "Security Key not initialized. Call set_master_key first."
            )

        aesgcm = AESGCM(self._key)

        # IV aleatorio de 12 bytes (único por mensaje)
        iv = secrets.token_bytes(IV_LENGTH)

        # Cifrar: AES-GCM añade el auth tag (16 bytes) automáticamente al ciphertext
        plaintext_bytes = plaintext.encode("utf-8")
        ciphertext = aesgcm.encrypt(iv, plaintext_bytes, None)

        # Combinar: [ IV (12 bytes) | Ciphertext (N bytes + 16-byte tag) ]
        combined = iv + ciphertext

        return base64.b64encode(combined).decode("ascii")

    # ─── Descifrado ───

    def decrypt_payload(self, base64_payload: str) -> str:
        """
        Descifra Base64( IV[12] || Ciphertext ) → string plano.
        Espejo exacto de NimSecurity.decryptPayload().

        Raises:
            ValueError: Si el payload está corrupto o la autenticación GCM falla.
        """
        if not self._key:
            raise RuntimeError(
                "Security Key not initialized. Call set_master_key first."
            )

        aesgcm = AESGCM(self._key)

        try:
            combined = base64.b64decode(base64_payload)
        except Exception as e:
            raise ValueError(f"Invalid Base64 payload: {e}") from e

        if len(combined) < IV_LENGTH + 1:
            raise ValueError(
                f"Payload too short: {len(combined)} bytes. "
                f"Minimum is {IV_LENGTH + 1} (12-byte IV + at least 1 byte ciphertext + GCM tag)."
            )

        # Extraer IV (primeros 12 bytes) y Ciphertext (el resto)
        iv = combined[:IV_LENGTH]
        ciphertext = combined[IV_LENGTH:]

        try:
            plaintext_bytes = aesgcm.decrypt(iv, ciphertext, None)
            return plaintext_bytes.decode("utf-8")
        except Exception as e:
            raise ValueError(
                f"Decryption failed. Possible causes: wrong master password, "
                f"corrupted payload, or tampered data. ({e})"
            ) from e

    # ─── Utilidades ───

    @staticmethod
    def derive_key_hex(password: str) -> str:
        """
        Deriva la llave y la retorna en hex para depuración/verificación.
        Útil para confirmar que PC y VPS comparten la misma llave.
        """
        kdf = PBKDF2HMAC(
            algorithm=PBKDF2_HASH,
            length=AES_KEY_LENGTH,
            salt=SALT,
            iterations=PBKDF2_ITERATIONS,
        )
        key = kdf.derive(password.encode("utf-8"))
        return key.hex()

    @staticmethod
    def verify_key_fingerprint(password: str) -> str:
        """
        Retorna un fingerprint corto (primeros 8 caracteres del SHA-256 de la llave)
        para que el usuario pueda verificar visualmente que ambos lados usan la misma contraseña.
        """
        kdf = PBKDF2HMAC(
            algorithm=PBKDF2_HASH,
            length=AES_KEY_LENGTH,
            salt=SALT,
            iterations=PBKDF2_ITERATIONS,
        )
        key = kdf.derive(password.encode("utf-8"))
        return hashlib.sha256(key).hexdigest()[:16]


# ─── Tests de integridad (ejecutar con: python nim_e2ee.py) ───

if __name__ == "__main__":
    print("=" * 60)
    print("Nim E2EE — Pruebas de Integridad")
    print("=" * 60)

    test_password = "NimMasterKey2024!@#Secure"
    e2ee = NimE2EE(test_password)

    # 1. Derivación de llave
    key_hex = NimE2EE.derive_key_hex(test_password)
    fingerprint = NimE2EE.verify_key_fingerprint(test_password)
    print(f"\n[KDF] Master Password: '{test_password}'")
    print(f"[KDF] Derived Key:     {key_hex}")
    print(f"[KDF] Fingerprint:     {fingerprint}")
    assert len(key_hex) == 64, f"Key debe ser 32 bytes (64 hex chars), got {len(key_hex)}"

    # 2. Cifrado/Descifrado — ida y vuelta
    original = '{"tool_call":"nim_terminal","arguments":{"command":"dir C:\\\\Users\\\\Creador\\\\Desktop"}}'
    encrypted = e2ee.encrypt_payload(original)
    decrypted = e2ee.decrypt_payload(encrypted)

    print(f"\n[AES-GCM] Original:   {original}")
    print(f"[AES-GCM] Encrypted:  {encrypted[:60]}... ({len(encrypted)} chars Base64)")
    print(f"[AES-GCM] Decrypted:  {decrypted}")
    assert original == decrypted, "FAIL: encrypt/decrypt round-trip mismatch!"

    # 3. Verificar que cada cifrado produce IV distinto
    encrypted2 = e2ee.encrypt_payload(original)
    assert encrypted != encrypted2, "FAIL: mismo IV detectado — ¡colisión criptográfica!"
    print(f"\n[ENTROPÍA] Mensaje 2: {encrypted2[:60]}... (diferente IV ✓)")

    # 4. Verificar que contraseña incorrecta falla
    e2ee_wrong = NimE2EE("WrongPassword123")
    try:
        e2ee_wrong.decrypt_payload(encrypted)
        assert False, "FAIL: ¡contraseña incorrecta debería haber fallado!"
    except ValueError as e:
        print(f"\n[AUTENTICACIÓN] Contraseña incorrecta: {e}")
        print("[AUTENTICACIÓN] GCM auth tag verification ✓")

    # 5. Verificar que payload corrupto falla
    try:
        corrupted = encrypted[:10] + "XXXX" + encrypted[14:]
        e2ee.decrypt_payload(corrupted)
        assert False, "FAIL: payload corrupto debería haber fallado!"
    except ValueError as e:
        print(f"\n[INTEGRIDAD] Payload corrupto: {e}")
        print("[INTEGRIDAD] Tamper detection ✓")

    print("\n" + "=" * 60)
    print("✅ TODAS LAS PRUEBAS PASARON")
    print("=" * 60)
