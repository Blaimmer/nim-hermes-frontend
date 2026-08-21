// ── F2.5 — Terminal embebido (xterm.js + tauri-plugin-shell) ────────────────
// Componente NIM: terminal interactivo dentro del dashboard Tauri. Usa
// @xterm/xterm + @xterm/addon-fit para el render y @tauri-apps/plugin-shell
// para spawnear el shell del sistema (powershell/cmd/bash) vía el plugin
// Rust ya registrado (tauri-plugin-shell, capabilities shell:*).
//
// ⚠️ LIMITACIONES CONOCIDAS (documentadas, no bloquean el panel):
// 1. El plugin-shell de Tauri 2 NO provee pty — el shell corre en "pipe mode":
//    sin prompt visual de colores ni señales tipo Ctrl+C, pero funcional para
//    comandos que leen stdin. Aceptado por diseño.
// 2. El alias de vite `@tauri-apps/api/core → src/tauri-mock.ts` es
//    incondicional: en la app Tauri real el mock delega invoke al nativo,
//    pero NO exporta `Channel` (lo usa plugin-shell para recibir eventos).
//    Si spawn() falla (navegador O Channel ausente), el componente cae a
//    modo fallback one-shot vía invoke('nim_terminal') — el panel nunca queda
//    muerto. La inyección condicional real es tarea de arquitectura abierta.
// 3. En navegador puro: mensaje claro + fallback que explica que se requiere
//    la app Tauri.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { invoke } from '@tauri-apps/api/core';
import {
  AlertTriangle,
  Eraser,
  Loader2,
  Play,
  Square,
  Terminal as TerminalIcon,
  X
} from 'lucide-react';

// ── Tipo mínimo del Child de plugin-shell (evita TS dependiente del import) ─
interface ShellChild {
  write(data: string): Promise<void>;
  kill(): Promise<void>;
}

type ShellKind = 'powershell' | 'cmd' | 'bash';

const SHELL_LABELS: Record<ShellKind, string> = {
  powershell: 'PowerShell',
  cmd: 'CMD',
  bash: 'Bash (Unix)'
};

const IS_WINDOWS =
  typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent);
const HOME_DIR =
  typeof process !== 'undefined' && process.env?.HOME ? process.env.HOME : '/home/clawd';
const DEFAULT_CWD = IS_WINDOWS ? 'C:\\Users\\user' : HOME_DIR;

/** Tema oscuro NIM para xterm (fondo #010912, cyan #22d3ee). */
const XTERM_THEME = {
  background: '#010912',
  foreground: '#22d3ee',
  cursor: '#22d3ee',
  cursorAccent: '#010912',
  selectionBackground: '#164e63',
  black: '#010912',
  red: '#f87171',
  green: '#34d399',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#e879f9',
  cyan: '#22d3ee',
  white: '#e2e8f0',
  brightBlack: '#475569',
  brightRed: '#fca5a5',
  brightGreen: '#6ee7b7',
  brightYellow: '#fde68a',
  brightBlue: '#93c5fd',
  brightMagenta: '#f0abfc',
  brightCyan: '#67e8f9',
  brightWhite: '#f8fafc'
};

/** Extrae mensaje legible de un error (el Err de Rust llega como JSON string). */
function errMsg(e: unknown): string {
  if (e === null || e === undefined) return 'Error desconocido';
  const raw = typeof e === 'string' ? e : (e as Error)?.message ?? String(e);
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.error === 'string') return parsed.error;
  } catch {
    /* no es JSON */
  }
  return String(raw).slice(0, 300);
}

/** ¿Estamos dentro de la app Tauri real? (el mock delega invoke solo ahí). */
function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any)?.__TAURI_INTERNALS__?.invoke);
}

export function TerminalPane() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const childRef = useRef<ShellChild | null>(null);
  const disposedRef = useRef(false);

  const [shell, setShell] = useState<ShellKind>(IS_WINDOWS ? 'powershell' : 'bash');
  const [cwd, setCwd] = useState<string>(DEFAULT_CWD);
  const [connected, setConnected] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [fallbackMode, setFallbackMode] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [oneShotCmd, setOneShotCmd] = useState<string>('');
  const [oneShotBusy, setOneShotBusy] = useState<boolean>(false);

  /** Escribe en el terminal si sigue vivo. */
  const write = useCallback((text: string) => {
    if (!disposedRef.current && termRef.current) termRef.current.write(text);
  }, []);

  // ── Init xterm (montaje del componente = panel visible) ─────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({
      fontFamily: 'monospace',
      fontSize: 11,
      lineHeight: 1.15,
      cursorBlink: true,
      scrollback: 2000,
      convertEol: false,
      theme: XTERM_THEME
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    // Banner NIM
    term.writeln('\x1b[38;2;232;121;249mNIM TERMINAL\x1b[0m — shell embebido (xterm.js + plugin-shell)');
    term.writeln('Selecciona el shell y pulsa \x1b[38;2;232;121;249mCONECTAR\x1b[0m. Ctrl+Click no aplica: usa DETENER para matar.');
    term.writeln('');

    // Echo local del input + reenvío al proceso (pipe mode, sin pty)
    const onDataSub = term.onData((data) => {
      // Feedback visual local (el shell en pipe mode no hace echo del stdin)
      if (data === '\r') {
        write('\r\n');
      } else if (data === '\x7f') {
        write('\b \b');
      } else {
        write(data);
      }
      // Reenviar al proceso hijo
      const child = childRef.current;
      if (child) {
        child.write(data).catch((e) => write(`\r\n[error de escritura: ${errMsg(e)}]\r\n`));
      }
    });

    // Fit inicial tras el layout + en resize (debounced)
    const t = setTimeout(() => {
      try { fit.fit(); } catch { /* contenedor oculto */ }
    }, 50);
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        try { fit.fit(); } catch { /* noop */ }
      });
    };
    window.addEventListener('resize', onResize);

    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      onDataSub.dispose();
      disposedRef.current = true;
      // Matar el proceso si está vivo
      if (childRef.current) {
        childRef.current.kill().catch(() => {});
        childRef.current = null;
      }
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      setConnected(false);
    };
  }, [write]);

  /** Spawn del shell interactivo vía tauri-plugin-shell. */
  const connect = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    // En navegador puro el plugin-shell no puede spawnear (mock no-op):
    // detectarlo antes de intentar, con mensaje claro.
    if (!isTauriRuntime()) {
      setConnected(false);
      setFallbackMode(true);
      setNotice(
        'Terminal interactivo requiere la app Tauri (no disponible en navegador). Activado modo comando one-shot.'
      );
      write('\r\n\x1b[38;2;248;113;113m[terminal interactivo no disponible en navegador — usa el modo comando one-shot]\x1b[0m\r\n');
      setBusy(false);
      return;
    }
    try {
      // Import dinámico: el módulo depende del runtime Tauri; el try/catch
      // lo captura y cae a modo fallback sin crashear.
      const { Command } = await import('@tauri-apps/plugin-shell');
      const args: string[] =
        shell === 'powershell' ? ['-NoExit', '-Command', '-'] : shell === 'cmd' ? ['/K'] : [];
      const command = Command.create(shell, args, { cwd: cwd.trim() || undefined });

      command.on('close', (data) => {
        childRef.current = null;
        setConnected(false);
        write(`\r\n\x1b[38;2;100;116;139m[proceso terminado — código ${data.code ?? '?'}]\x1b[0m\r\n`);
      });
      command.on('error', (err) => {
        childRef.current = null;
        setConnected(false);
        write(`\r\n\x1b[38;2;248;113;113m[error del proceso: ${err}]\x1b[0m\r\n`);
      });
      command.stdout.on('data', (line: string) => write(line));
      command.stderr.on('data', (line: string) => write(line));

      const child = await command.spawn();
      // El mock de tauri devuelve null: si no hay handle real, no hay proceso.
      if (!child) {
        throw new Error('plugin-shell no devolvió un proceso (mock en modo navegador)');
      }
      childRef.current = child;
      setConnected(true);
      write(`\r\n\x1b[38;2;52;211;153m[conectado — ${SHELL_LABELS[shell]}${
        cwd.trim() ? ` en ${cwd.trim()}` : ''
      }]\x1b[0m\r\n`);
    } catch (e) {
      childRef.current = null;
      setConnected(false);
      const msg = errMsg(e);
      setFallbackMode(true);
      setNotice(
        `Terminal interactivo no disponible (${msg.slice(0, 120)}). Activado modo comando one-shot vía nim_terminal.`
      );
      write('\r\n\x1b[38;2;248;113;113m[terminal interactivo no disponible — usa el modo comando one-shot]\x1b[0m\r\n');
    } finally {
      setBusy(false);
    }
  }, [busy, cwd, shell, write]);

  /** Mata el proceso hijo (el evento 'close' resetea el estado). */
  const disconnect = useCallback(async () => {
    const child = childRef.current;
    if (!child) return;
    try {
      await child.kill();
    } catch (e) {
      setNotice(`Error al detener: ${errMsg(e)}`);
    } finally {
      childRef.current = null;
      setConnected(false);
    }
  }, []);

  const clear = useCallback(() => {
    termRef.current?.clear();
  }, []);

  /** Fallback one-shot: invoke('nim_terminal') existente en lib.rs. */
  const runOneShot = useCallback(async () => {
    const cmd = oneShotCmd.trim();
    if (!cmd || oneShotBusy) return;
    setOneShotBusy(true);
    setNotice(null);
    write(`\r\n\x1b[38;2;232;121;249m$ ${cmd}\x1b[0m\r\n`);
    try {
      const raw = await invoke<any>('nim_terminal', { command: cmd, cwd: cwd.trim() || null });
      if (raw === null || raw === undefined) {
        throw new Error('Tauri no disponible en este entorno (modo navegador).');
      }
      let parsed: any = raw;
      if (typeof raw === 'string') {
        try { parsed = JSON.parse(raw); } catch { parsed = { stdout: raw }; }
      }
      if (parsed?.stdout) write(parsed.stdout.endsWith('\n') ? parsed.stdout : parsed.stdout + '\r\n');
      if (parsed?.stderr) write(`\x1b[38;2;248;113;113m${parsed.stderr}\x1b[0m`);
      if (parsed?.exit_code !== undefined && parsed.exit_code !== 0) {
        write(`\r\n\x1b[38;2;248;113;113m[código de salida: ${parsed.exit_code}]\x1b[0m\r\n`);
      }
    } catch (e) {
      write(`\r\n\x1b[38;2;248;113;113m[${errMsg(e)}]\x1b[0m\r\n`);
      setNotice(errMsg(e));
    } finally {
      setOneShotBusy(false);
    }
  }, [cwd, oneShotCmd, oneShotBusy, write]);

  return (
    <div className="flex flex-col gap-1.5 min-h-0 h-full">
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-cyan-950/60 pb-1.5">
        <TerminalIcon className="text-fuchsia-400 w-3.5 h-3.5" />
        <h2 className="text-[9px] font-bold tracking-widest uppercase font-mono text-fuchsia-200">
          TERMINAL PC
        </h2>
        <span className="flex items-center gap-1 ml-1">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-500/80'
            }`}
            title={connected ? 'Conectado' : 'Desconectado'}
          />
          <span className="text-[7.5px] font-mono uppercase tracking-wider text-cyan-600">
            {connected ? 'conectado' : 'desconectado'}
          </span>
        </span>
        <span className="text-[7.5px] text-cyan-700 ml-auto font-mono hidden sm:inline">
          xterm + plugin-shell
        </span>
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={shell}
          onChange={(e) => setShell(e.target.value as ShellKind)}
          disabled={connected}
          className="bg-[#010912] border border-cyan-950 rounded px-1.5 py-1 text-[9px] font-mono text-cyan-200 focus:outline-none focus:border-fuchsia-500/40 disabled:opacity-50"
          title="Shell a lanzar"
        >
          <option value="powershell">PowerShell</option>
          <option value="cmd">CMD</option>
          <option value="bash">Bash (Unix)</option>
        </select>
        <input
          value={cwd}
          onChange={(e) => setCwd(e.target.value)}
          placeholder="Directorio de trabajo (cwd) — opcional"
          className="flex-1 min-w-[120px] bg-[#010912] border border-cyan-950 rounded px-1.5 py-1 text-[9px] font-mono text-cyan-200 placeholder:text-cyan-800 focus:outline-none focus:border-fuchsia-500/40"
          title="Directorio de trabajo inicial del shell"
        />
        {connected ? (
          <button
            type="button"
            onClick={disconnect}
            className="px-2 py-1 text-[9px] font-mono uppercase tracking-wider rounded border transition flex items-center gap-1 bg-red-500/10 text-red-200 border-red-500/50 font-bold hover:bg-red-500/20"
            title="Matar el proceso del shell"
          >
            <Square className="w-3 h-3" />
            DETENER
          </button>
        ) : (
          <button
            type="button"
            onClick={connect}
            disabled={busy}
            className="px-2 py-1 text-[9px] font-mono uppercase tracking-wider rounded border transition flex items-center gap-1 bg-fuchsia-500/10 text-fuchsia-200 border-fuchsia-500/50 font-bold glow-text hover:bg-fuchsia-500/20 disabled:opacity-50"
            title="Lanzar el shell interactivo"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            CONECTAR
          </button>
        )}
        <button
          type="button"
          onClick={clear}
          className="px-2 py-1 text-[9px] font-mono uppercase tracking-wider rounded border transition flex items-center gap-1 bg-transparent text-cyan-600 border-transparent hover:text-cyan-300 hover:border-cyan-800/40"
          title="Limpiar la pantalla del terminal"
        >
          <Eraser className="w-3 h-3" />
          LIMPIAR
        </button>
      </div>

      {/* Terminal xterm — altura definida (xterm no renderiza con altura 0) */}
      <div className="h-[240px] rounded bg-[#010912] border border-cyan-950 overflow-hidden">
        <div ref={containerRef} className="h-full w-full px-1 py-0.5" />
      </div>

      {/* Modo fallback one-shot (navegador o plugin-shell no disponible) */}
      {fallbackMode && (
        <div className="flex flex-col gap-1.5 rounded border border-amber-900/40 bg-amber-950/10 p-2">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="text-[8px] font-mono text-amber-200/90 leading-tight">
              Terminal interactivo no disponible — modo comando one-shot (invoke nim_terminal).
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              value={oneShotCmd}
              onChange={(e) => setOneShotCmd(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runOneShot(); }}
              placeholder={IS_WINDOWS ? 'Ej: dir C:\\Users\\user' : 'Ej: ls -la ~'}
              className="flex-1 min-w-0 bg-[#010912] border border-cyan-950 rounded px-1.5 py-1 text-[9px] font-mono text-cyan-200 placeholder:text-cyan-800 focus:outline-none focus:border-fuchsia-500/40"
            />
            <button
              type="button"
              onClick={runOneShot}
              disabled={oneShotBusy || !oneShotCmd.trim()}
              className="px-2 py-1 text-[9px] font-mono uppercase tracking-wider rounded border transition flex items-center gap-1 bg-fuchsia-500/10 text-fuchsia-200 border-fuchsia-500/50 font-bold hover:bg-fuchsia-500/20 disabled:opacity-50"
              title="Ejecutar comando único"
            >
              {oneShotBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              EJECUTAR
            </button>
          </div>
        </div>
      )}

      {/* Aviso descartable */}
      {notice && (
        <div className="flex items-start gap-1.5 rounded border border-red-900/40 bg-red-950/10 px-2 py-1.5">
          <span className="text-[8px] font-mono text-red-200/90 leading-tight flex-1">{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-red-400/70 hover:text-red-200 transition shrink-0"
            title="Descartar aviso"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

export default TerminalPane;
