// ── F4.3 — Panel Antigravity (CLI agy) vía command Tauri nim_antigravity ──
// Ejecuta `agy --print 'prompt'` en la PC local (modo no interactivo) usando el
// command Rust nim_antigravity YA registrado en src-tauri/src/lib.rs (no tocar).
// Sin dependencias nuevas: solo Tailwind (visual NIM oscuro/cyan) + lucide-react.
// Patrón espejo de FileBrowser.tsx: invoke → JSON string → parse, Err como JSON
// {"error": "..."} con errMsg(), y manejo de null en navegador (tauri-mock).
import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eraser,
  Loader2,
  Play,
  Sparkles,
  XCircle
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

// ── Utilidades (espejo de FileBrowser.tsx — sin node path) ─────────────────
const IS_WINDOWS = typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent);
const HOME_DIR =
  typeof process !== 'undefined' && process.env?.HOME ? process.env.HOME : '/home/clawd';
const DEFAULT_CWD = IS_WINDOWS ? 'C:\\Users\\user' : HOME_DIR;

interface AgyResult {
  stdout: string;
  stderr: string;
  exit_code: number;
}

/** Extrae mensaje legible de un error de invoke (el Err de Rust llega como JSON string). */
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

/** Invoca nim_antigravity y parsea su JSON (devuelve {stdout, stderr, exit_code}). */
async function callAgy(prompt: string, cwd: string, timeoutSecs: number): Promise<AgyResult> {
  const raw = await invoke<any>('nim_antigravity', {
    prompt,
    cwd,
    timeout_secs: timeoutSecs
  });
  if (raw === null || raw === undefined) {
    throw new Error('Tauri no disponible en este entorno (modo navegador).');
  }
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (parsed && typeof parsed.error === 'string') throw new Error(parsed.error);
  return {
    stdout: typeof parsed.stdout === 'string' ? parsed.stdout : '',
    stderr: typeof parsed.stderr === 'string' ? parsed.stderr : '',
    exit_code: typeof parsed.exit_code === 'number' ? parsed.exit_code : -1
  };
}

export function AntigravityPanel() {
  const [prompt, setPrompt] = useState('');
  const [cwd, setCwd] = useState(DEFAULT_CWD);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<AgyResult | null>(null);
  const [error, setError] = useState('');
  const [promptHistory, setPromptHistory] = useState<string[]>([]);
  // Indicador de agy disponible: verificación al montar con prompt trivial
  const [agyState, setAgyState] = useState<'checking' | 'ok' | 'missing'>('checking');
  const [agyNote, setAgyNote] = useState('Comprobando agy...');

  // Verificación al montar: invoke nim_antigravity con prompt trivial 'di ok'.
  // Si agy no está en PATH o Tauri no está disponible, muestra el motivo.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await callAgy('di ok', DEFAULT_CWD, 30);
        if (cancelled) return;
        setAgyState('ok');
        setAgyNote(res.exit_code === 0 ? 'agy disponible' : `agy disponible (exit ${res.exit_code})`);
      } catch (e) {
        if (cancelled) return;
        setAgyState('missing');
        setAgyNote(errMsg(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runAgy = useCallback(async () => {
    const p = prompt.trim();
    if (!p) {
      setStatus('error');
      setError('Escribe un prompt para agy (Antigravity CLI).');
      setResult(null);
      return;
    }
    setStatus('loading');
    setError('');
    setResult(null);
    try {
      const res = await callAgy(p, cwd.trim() || DEFAULT_CWD, 120);
      setResult(res);
      setStatus('done');
      setPromptHistory(h => [p, ...h.filter(x => x !== p)].slice(0, 5));
    } catch (e) {
      setError(errMsg(e));
      setStatus('error');
    }
  }, [prompt, cwd]);

  const clearAll = useCallback(() => {
    setPrompt('');
    setResult(null);
    setError('');
    setStatus('idle');
  }, []);

  return (
    <div className="flex flex-col gap-1.5 min-h-0 h-full">
      {/* Header + indicador de disponibilidad de agy */}
      <div className="flex items-center gap-2 border-b border-cyan-950/60 pb-1.5">
        <Sparkles className="text-orange-400 w-3.5 h-3.5" />
        <h2 className="text-[9px] font-bold tracking-widest uppercase font-mono">
          ANTIGRAVITY (agy)
        </h2>
        <span
          className={`ml-auto text-[8px] font-mono px-1.5 py-0.5 rounded border flex items-center gap-1 ${
            agyState === 'checking'
              ? 'text-cyan-500 border-cyan-900/60'
              : agyState === 'ok'
                ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/5'
                : 'text-red-300 border-red-500/40 bg-red-500/5'
          }`}
          title={agyNote}
        >
          {agyState === 'checking' ? (
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
          ) : agyState === 'ok' ? (
            <CheckCircle2 className="w-2.5 h-2.5" />
          ) : (
            <XCircle className="w-2.5 h-2.5" />
          )}
          {agyState === 'checking' ? 'VERIFICANDO' : agyState === 'ok' ? 'AGY OK' : 'SIN AGY'}
        </span>
      </div>

      {/* Prompt multilínea (Ctrl+Enter ejecuta) */}
      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runAgy();
        }}
        placeholder="Prompt para Antigravity (ej: analiza este repo y sugiere mejoras)..."
        rows={3}
        className="bg-[#010912] border border-cyan-950 rounded px-1.5 py-1 text-[9px] font-mono text-cyan-200 placeholder-cyan-800 focus:outline-none focus:border-orange-500/40 resize-none w-full"
      />

      {/* cwd opcional (default: C:\Users\user en Windows, $HOME en Unix) */}
      <input
        value={cwd}
        onChange={e => setCwd(e.target.value)}
        placeholder="Directorio de trabajo (cwd)..."
        className="bg-[#010912] border border-cyan-950 rounded px-1.5 py-1 text-[9px] font-mono text-cyan-200 placeholder-cyan-800 focus:outline-none focus:border-orange-500/40 w-full"
      />

      {/* Acciones */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={runAgy}
          disabled={status === 'loading'}
          className={`px-2 py-1 text-[9px] font-mono uppercase tracking-wider rounded border transition flex items-center gap-1 ${
            status === 'loading'
              ? 'bg-orange-500/5 text-orange-500/60 border-orange-500/20 cursor-wait'
              : 'bg-orange-500/10 text-orange-200 border-orange-500/50 font-bold glow-text hover:bg-orange-500/20'
          }`}
        >
          {status === 'loading' ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Play className="w-3 h-3" />
          )}
          EJECUTAR
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="px-2 py-1 text-[9px] font-mono uppercase tracking-wider rounded border transition flex items-center gap-1 bg-transparent text-cyan-600 border-transparent hover:text-cyan-300"
        >
          <Eraser className="w-3 h-3" />
          LIMPIAR
        </button>
        {status === 'loading' && (
          <span className="ml-auto text-[8.5px] font-mono text-orange-300 animate-pulse flex items-center gap-1">
            <Loader2 className="w-2.5 h-2.5 animate-spin" /> EJECUTANDO agy...
          </span>
        )}
      </div>

      {/* Error (resaltado especial si agy no está en PATH) */}
      {status === 'error' && error && (
        <div className="border border-red-900/40 bg-red-950/10 rounded px-2 py-1.5 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-red-300 text-[9px] font-mono">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span className="font-bold">ERROR</span>
          </div>
          <p className="text-red-400/90 text-[9px] font-mono break-words">{error}</p>
          {error.includes('no está en PATH') && (
            <p className="text-red-400/70 text-[8.5px] font-mono leading-relaxed">
              Instalación: en la PC ejecuta <span className="text-red-200">agy install</span> (o sigue la
              guía en <span className="text-red-200">https://antigravity.dev</span>). Asegúrate de que{' '}
              <span className="text-red-200">agy.exe</span> esté en el PATH de Windows y reinicia la app.
            </p>
          )}
        </div>
      )}

      {/* Resultado: exit_code + stderr (rojo) + stdout (visor scroll) */}
      {status === 'done' && result && (
        <div className="flex flex-col gap-1 min-h-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-[8.5px] font-mono px-1.5 py-0.5 rounded border ${
                result.exit_code === 0
                  ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/5'
                  : 'text-amber-300 border-amber-500/40 bg-amber-500/5'
              }`}
            >
              exit {result.exit_code}
            </span>
            <span className="text-[8.5px] font-mono text-cyan-500">
              {result.stdout.length} chars stdout
              {result.stderr ? ` · ${result.stderr.length} chars stderr` : ''}
            </span>
          </div>
          {result.stderr && (
            <pre className="border border-red-900/40 bg-red-950/10 rounded px-2 py-1.5 text-[8.5px] font-mono text-red-300 whitespace-pre-wrap break-words max-h-[60px] overflow-y-auto custom-scrollbar">
              {result.stderr}
            </pre>
          )}
          <pre className="border border-cyan-950 bg-[#010912] rounded px-2 py-1.5 text-[8.5px] font-mono text-cyan-100 whitespace-pre-wrap break-words max-h-[140px] overflow-y-auto custom-scrollbar">
            {result.stdout || '(sin salida)'}
          </pre>
        </div>
      )}

      {/* Historial de prompts (últimos 5, click para reusar) */}
      {promptHistory.length > 0 && (
        <div className="flex flex-col gap-1 min-h-0">
          <span className="text-[8px] font-mono uppercase tracking-widest text-cyan-600">
            Historial
          </span>
          <div className="flex flex-wrap gap-1">
            {promptHistory.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPrompt(p)}
                title={`Reusar: ${p}`}
                className="px-1.5 py-0.5 text-[8px] font-mono rounded border border-cyan-900/60 bg-cyan-950/20 text-cyan-400 hover:text-orange-300 hover:border-orange-500/40 truncate max-w-[220px]"
              >
                {p.length > 40 ? p.slice(0, 40) + '…' : p}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
