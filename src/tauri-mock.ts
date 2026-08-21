// Mock for @tauri-apps/api/core — usado en navegador (no Tauri)
export const invoke = async (cmd: string, args?: any) => {
  console.warn(`[tauri-mock] invoke("${cmd}") called in browser — no-op`);
  return null;
};

export const { listen, once, emit } = {
  listen: async () => () => {},
  once: async () => {},
  emit: async () => {}
};

export default { invoke, listen, once, emit };
