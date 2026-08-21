// Mock for @tauri-apps/api/core — usado en navegador (no Tauri).
//
// FIX CRÍTICO (2026-08-21, F2.3): antes este archivo era un no-op incondicional
// y el alias de vite.config.ts lo aplicaba TAMBIÉN en el build Tauri real —
// eso dejaba TODAS las tools PC (nim_terminal, nim_list_dir, nim_computer_use…)
// inertes en la app de escritorio. Ahora detecta window.__TAURI_INTERNALS__
// (presente solo dentro de la app Tauri) y delega al invoke nativo; en
// navegador puro sigue siendo no-op con warning.
export const invoke = async (cmd: string, args?: any) => {
  const w = typeof window !== 'undefined' ? (window as any) : undefined;
  if (w?.__TAURI_INTERNALS__?.invoke) {
    return w.__TAURI_INTERNALS__.invoke(cmd, args);
  }
  console.warn(`[tauri-mock] invoke("${cmd}") called in browser — no-op`);
  return null;
};

// ── Channel (F2.5, 2026-08-21) ──────────────────────────────────────────────
// @tauri-apps/plugin-shell importa `{ invoke, Channel }` del core. Sin este
// export, Rollup falla el build ("Channel is not exported by src/tauri-mock.ts")
// y el plugin-shell no puede recibir eventos stdout/stderr.
// Réplica fiel del Channel de @tauri-apps/api/core (core.js): el id viene de
// window.__TAURI_INTERNALS__.transformCallback() (presente solo en la app
// Tauri real) y se serializa como `__CHANNEL__:<id>` — el formato que el
// invoke nativo de Tauri 2 espera. En la app Tauri real esto hace funcionar
// el terminal interactivo; en navegador (sin INTERNALS) el id queda en 0 y el
// spawn falla → TerminalPane cae a modo one-shot. No tocar la semántica.
export class Channel<T = unknown> {
  id: number;
  private _onmessage: ((response: T) => void) | null = null;
  private _nextIndex = 0;
  private _pending: Record<number, T> = {};
  private _endIndex: number | undefined;

  constructor(onmessage?: (response: T) => void) {
    if (onmessage) this._onmessage = onmessage;
    const w = typeof window !== 'undefined' ? (window as any) : undefined;
    if (w?.__TAURI_INTERNALS__?.transformCallback) {
      this.id = w.__TAURI_INTERNALS__.transformCallback((rawMessage: any) => {
        // Preserva el orden de los mensajes (igual que el core real)
        const index = rawMessage.index;
        if ('end' in rawMessage) {
          if (index === this._nextIndex) this.cleanupCallback();
          else this._endIndex = index;
          return;
        }
        const message = rawMessage.message as T;
        if (index === this._nextIndex) {
          this._onmessage?.call(this, message);
          this._nextIndex += 1;
          while (this._nextIndex in this._pending) {
            this._onmessage?.call(this, this._pending[this._nextIndex]);
            delete this._pending[this._nextIndex];
            this._nextIndex += 1;
          }
          if (this._endIndex === this._nextIndex - 1) this.cleanupCallback();
        } else {
          this._pending[index] = message;
        }
      });
    } else {
      this.id = 0;
    }
  }

  set onmessage(handler: (response: T) => void) {
    this._onmessage = handler;
  }

  get onmessage(): (response: T) => void {
    return this._onmessage ?? (() => {});
  }

  private cleanupCallback() {
    const w = typeof window !== 'undefined' ? (window as any) : undefined;
    try { w?.__TAURI_INTERNALS__?.transformCallback?.cleanup?.(this.id); } catch { /* noop */ }
  }

  toJSON(): string {
    return `__CHANNEL__:${this.id}`;
  }
}

export const { listen, once, emit } = {
  listen: async () => () => {},
  once: async () => {},
  emit: async () => {}
};

export default { invoke, listen, once, emit };
