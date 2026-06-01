/**
 * Nim PC - End-to-End Encryption (E2EE) Module
 * Uses AES-256-GCM to securely encrypt all payloads before sending them to Hermes VPS.
 */

export class NimSecurity {
  private key: CryptoKey | null = null;

  /**
   * Derives a 256-bit AES-GCM CryptoKey from a raw master password.
   * This master password must be shared exactly with the Hermes VPS.
   */
  async setMasterKey(password: string): Promise<void> {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );

    // Using PBKDF2 to derive a robust AES key from the password
    this.key = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: enc.encode("nim-omnichannel-salt-v1"), // Fixed salt for omnichannel deterministic derivation
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Encrypts a plaintext string into a base64-encoded string containing the IV and Ciphertext.
   */
  async encryptPayload(plaintext: string): Promise<string> {
    if (!this.key) throw new Error("Security Key not initialized. Call setMasterKey first.");

    const enc = new TextEncoder();
    // AES-GCM requires a unique 12-byte initialization vector (IV) per encryption
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const cipherBuffer = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      this.key,
      enc.encode(plaintext)
    );

    // Combine IV and Ciphertext: [ IV (12 bytes) | Ciphertext (N bytes) ]
    const combined = new Uint8Array(iv.length + cipherBuffer.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(cipherBuffer), iv.length);

    // Return as Base64 for safe transport via WebSockets
    return this.arrayBufferToBase64(combined.buffer);
  }

  /**
   * Decrypts a base64-encoded string back into plaintext.
   */
  async decryptPayload(base64Payload: string): Promise<string> {
    if (!this.key) throw new Error("Security Key not initialized. Call setMasterKey first.");

    const combinedBuffer = this.base64ToArrayBuffer(base64Payload);
    const combined = new Uint8Array(combinedBuffer);

    // Extract IV (first 12 bytes) and Ciphertext (the rest)
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      this.key,
      ciphertext
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
  }

  // --- Utility functions for Base64 conversion ---

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

// Export a singleton instance for global use in the app
export const security = new NimSecurity();
