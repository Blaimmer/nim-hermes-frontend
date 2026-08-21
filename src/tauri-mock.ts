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

export const { listen, once, emit } = {
  listen: async () => () => {},
  once: async () => {},
  emit: async () => {}
};

export default { invoke, listen, once, emit };
