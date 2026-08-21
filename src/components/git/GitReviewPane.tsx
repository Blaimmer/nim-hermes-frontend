// ── F2.4 — Git review pane (repo local vía commands Tauri nativos) ─────────
// Componente NIM: revisión git de cualquier repo local de la PC. Usa los
// commands Rust ya registrados en src-tauri (nim_git_status / nim_git_diff /
// nim_git_commit). Sin dependencias nuevas — solo Tailwind + lucide-react,
// mismo visual del dashboard NIM (oscuro/cyan, font-mono, tamaños pequeños).
// En navegador puro el mock de tauri devuelve null → mensaje claro.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileCode2,
  GitBranch,
  GitCommit,
  Loader2,
  RefreshCw,
  X
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

// ── Plataforma / ruta por defecto (sin node path — solo heurística) ──────
const IS_WINDOWS = typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent);
const HOME_DIR =
  typeof process !== 'undefined' && process.env?.HOME ? process.env.HOME : '/home/clawd';
// Usuario Windows de Oscar: 'user' (fact conocido) → C:\Users\user
const DEFAULT_CWD = IS_WINDOWS ? 'C:\\Users\\user' : HOME_DIR;

/** Invoca un command Tauri y parsea su JSON (los commands Rust devuelven String). */
async function callCommand(cmd: string, args: Record<string, unknown>): Promise<any> {
  const raw = await invoke<any>(cmd, args);
  if (raw === null || raw === undefined) {
    throw new Error('Tauri no disponible en este entorno (modo navegador).');
  }
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }
  return raw;
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

interface GitFile {
  /** Ruta real del archivo (para el diff). En renames: la parte nueva. */
  path: string;
  /** Texto a mostrar (puede ser "old -> new" en renames). */
  display: string;
  /** Código staged (X en "XY path"); ' ' si no hay cambios staged. */
  staged: string;
  /** Código worktree (Y en "XY path"); ' ' si no hay cambios unstaged. */
  worktree: string;
}

/** Metadatos visuales por código de estado git (porcelain v1). */
const STATUS_META: Record<string, { label: string; cls: string }> = {
  A: { label: 'Añadido', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
  M: { label: 'Modificado', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
  D: { label: 'Eliminado', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/40' },
  '?': { label: 'Sin trackear', cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40' },
  R: { label: 'Renombrado', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/40' },
  C: { label: 'Copiado', cls: 'bg-teal-500/15 text-teal-300 border-teal-500/40' },
  U: { label: 'Conflicto', cls: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40' },
  T: { label: 'Tipo cambiado', cls: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40' }
};

/**
 * Parsea el stdout de `git status --porcelain=v1 --branch`.
 * Primera línea: "## rama...origin/rama [ahead N]" → rama actual.
 * Resto: "XY path" (X = índice staged, Y = worktree; índice 2 = separador).
 * Los paths pueden tener espacios — el path va desde el índice 3 en adelante.
 */
function parseStatusLines(stdout: string): { branch: string | null; files: GitFile[] } {
  const lines = stdout.split('\n').filter(l => l.length > 0);
  let branch: string | null = null;
  const files: GitFile[] = [];
  for (const line of lines) {
    if (line.startsWith('## ')) {
      const m = line.match(/^##\s+(\S+)/);
      if (m) {
        const raw = m[1].split('...')[0];
        branch = raw === 'HEAD' ? 'HEAD (desprendido)' : raw;
      }
      continue;
    }
    if (line.length < 3) continue;
    const x = line[0];
    const y = line[1];
    let display = line.slice(3);
    let path = display;
    const arrow = display.indexOf(' -> ');
    if (arrow !== -1) path = display.slice(arrow + 4); // rename "R  old -> new"
    files.push({ path, display, staged: x, worktree: y });
  }
  return { branch, files };
}

/** Resumen legible del resultado de nim_git_commit. */
function commitSummary(data: any): { ok: boolean; text: string } {
  const commit = data?.commit;
  const commitOut = commit?.stdout ? String(commit.stdout).trim() : '';
  const commitErr = commit?.stderr ? String(commit.stderr).trim() : '';
  if (commit && typeof commit.exit_code === 'number' && commit.exit_code !== 0) {
    return { ok: false, text: commitErr || commitOut || 'git commit falló.' };
  }
  if (commitOut) return { ok: true, text: commitOut };
  const addErr = data?.add?.stderr ? String(data.add.stderr).trim() : '';
  if (addErr) return { ok: false, text: `git add: ${addErr}` };
  return { ok: true, text: 'Commit realizado.' };
}

export function GitReviewPane() {
  const [cwd, setCwd] = useState<string>(DEFAULT_CWD);
  const [cwdInput, setCwdInput] = useState<string>(DEFAULT_CWD);
  const [branch, setBranch] = useState<string | null>(null);
  const [files, setFiles] = useState<GitFile[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  // Visor de diff
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedDisplay, setSelectedDisplay] = useState<string>('');
  const [selectedUntracked, setSelectedUntracked] = useState<boolean>(false);
  const [showStaged, setShowStaged] = useState<boolean>(false);
  const [diff, setDiff] = useState<string>('');
  const [diffLoading, setDiffLoading] = useState<boolean>(false);

  // Commit
  const [commitMsg, setCommitMsg] = useState('');
  const [committing, setCommitting] = useState<boolean>(false);
  const [commitResult, setCommitResult] = useState<{ ok: boolean; text: string } | null>(null);

  /** Carga el status del repo en `dir` (nim_git_status) y lo parsea. */
  const loadStatus = useCallback(async (dir: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await callCommand('nim_git_status', { cwd: dir });
      const { branch: b, files: f } = parseStatusLines(
        typeof data?.stdout === 'string' ? data.stdout : ''
      );
      setCwd(dir);
      setBranch(b);
      setFiles(f);
    } catch (e) {
      setError(`No se pudo leer el status git de "${dir}": ${errMsg(e)}`);
      setBranch(null);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Carga el diff de un archivo (nim_git_diff con staged opcional). */
  const loadDiff = useCallback(
    async (path: string, staged: boolean) => {
      setDiffLoading(true);
      setError('');
      try {
        const data = await callCommand('nim_git_diff', { cwd, path, staged });
        setDiff(typeof data?.stdout === 'string' ? data.stdout : '');
      } catch (e) {
        setError(`No se pudo obtener el diff de "${path}": ${errMsg(e)}`);
        setDiff('');
      } finally {
        setDiffLoading(false);
      }
    },
    [cwd]
  );

  /** Selecciona un archivo: staged si tiene cambios en el índice, si no worktree. */
  const selectFile = useCallback(
    (f: GitFile) => {
      setSelectedPath(f.path);
      setSelectedDisplay(f.display);
      setSelectedUntracked(f.staged === '?');
      const hasStaged = f.staged !== ' ' && f.staged !== '?';
      setShowStaged(hasStaged);
      if (f.staged === '?') {
        setDiff('');
      } else {
        void loadDiff(f.path, hasStaged);
      }
    },
    [loadDiff]
  );

  /** Cambia staged ↔ worktree en el visor y recarga el diff. */
  const toggleStaged = useCallback(() => {
    if (!selectedPath || selectedUntracked) return;
    const next = !showStaged;
    setShowStaged(next);
    void loadDiff(selectedPath, next);
  }, [selectedPath, selectedUntracked, showStaged, loadDiff]);

  /** Ejecuta git add -A + git commit -m (nim_git_commit) y refresca el status. */
  const handleCommit = useCallback(async () => {
    const msg = commitMsg.trim();
    if (!msg) {
      setError('Escribe un mensaje de commit primero.');
      return;
    }
    setCommitting(true);
    setError('');
    try {
      const data = await callCommand('nim_git_commit', { cwd, message: msg });
      const summary = commitSummary(data);
      setCommitResult(summary);
      setFeedback(summary.ok ? `Commit: ${summary.text.slice(0, 120)}` : summary.text.slice(0, 200));
      setCommitMsg('');
      setSelectedPath(null);
      setSelectedDisplay('');
      setSelectedUntracked(false);
      setDiff('');
      void loadStatus(cwd);
    } catch (e) {
      setError(`Error al commitear: ${errMsg(e)}`);
    } finally {
      setCommitting(false);
    }
  }, [commitMsg, cwd, loadStatus]);

  const refresh = useCallback(() => {
    void loadStatus(cwd);
  }, [cwd, loadStatus]);

  // Auto-limpiar el feedback
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(''), 5000);
    return () => clearTimeout(t);
  }, [feedback]);

  // Montaje: cargar status del default (en navegador mock → error claro)
  useEffect(() => {
    void loadStatus(DEFAULT_CWD);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fileCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of files) {
      for (const code of [f.staged, f.worktree]) {
        if (code !== ' ') counts[code] = (counts[code] ?? 0) + 1;
      }
    }
    return counts;
  }, [files]);

  const btnCls =
    'px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider rounded border transition flex items-center gap-1';

  const statusBadge = (code: string) => {
    const meta = STATUS_META[code] ?? { label: code, cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40' };
    return (
      <span
        key={code}
        title={meta.label}
        className={`${meta.cls} border rounded px-[3px] py-px text-[7.5px] font-mono leading-none flex-shrink-0`}
      >
        {code}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-1.5 min-h-0 h-full">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-cyan-950/60 pb-1.5 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <GitBranch className="w-3 h-3 text-amber-400 flex-shrink-0" />
          <h2 className="text-[9px] font-bold tracking-widest uppercase font-mono text-amber-200/90">
            GIT REVIEW — REPO LOCAL
          </h2>
          <span className="text-[7px] text-cyan-600 font-mono flex-shrink-0">
            {IS_WINDOWS ? 'win' : 'unix'}
          </span>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="p-1 hover:bg-cyan-950/50 rounded text-cyan-500 transition-colors disabled:opacity-40"
          title="Refrescar status del repo"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Ruta del repo (cwd) */}
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="text"
          value={cwdInput}
          onChange={e => setCwdInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') void loadStatus(cwdInput.trim() || DEFAULT_CWD);
          }}
          placeholder={DEFAULT_CWD}
          spellCheck={false}
          className="w-full bg-[#010912] border border-cyan-950 rounded px-1.5 py-1 text-[9px] font-mono text-cyan-100 placeholder-cyan-800 focus:border-amber-500 focus:outline-none"
          title="Ruta del repo (Enter para cargar)"
        />
        <button
          type="button"
          onClick={() => void loadStatus(cwdInput.trim() || DEFAULT_CWD)}
          disabled={loading}
          className={`${btnCls} border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 disabled:opacity-40 shrink-0`}
          title="Cargar status del repo en esta ruta"
        >
          CARGAR
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center justify-between gap-1.5 border border-red-900/40 bg-red-950/10 rounded p-1.5 shrink-0">
          <p className="text-[8px] text-red-400 font-mono break-words leading-snug flex items-start gap-1">
            <AlertTriangle className="w-2.5 h-2.5 mt-px shrink-0" />
            <span>{error}</span>
          </p>
          <button
            type="button"
            onClick={() => setError('')}
            className="p-0.5 hover:bg-red-950/40 rounded text-red-400 flex-shrink-0"
            title="Descartar"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      )}

      {/* Feedback (commit / refresco) */}
      {feedback && !error && (
        <div className="px-1.5 py-0.5 text-[8px] font-mono text-emerald-400/90 truncate shrink-0">
          ✓ {feedback}
        </div>
      )}

      {/* Rama + resumen */}
      {!loading && !error && branch !== null && (
        <div className="flex items-center gap-1.5 px-1 shrink-0">
          <GitBranch className="w-2.5 h-2.5 text-amber-400/90 shrink-0" />
          <span className="text-[8.5px] font-mono text-amber-200 truncate" title={branch}>
            {branch}
          </span>
          {files.length === 0 ? (
            <span className="text-[8px] font-mono text-emerald-400/90 flex items-center gap-1 ml-auto shrink-0">
              <CheckCircle2 className="w-2.5 h-2.5" /> Sin cambios
            </span>
          ) : (
            <span className="text-[8px] font-mono text-cyan-600 ml-auto shrink-0">
              {files.length} archivo{files.length === 1 ? '' : 's'}
              {Object.entries(fileCounts).map(([code, n]) => (
                <span key={code} className="ml-1.5">
                  {STATUS_META[code]?.label ?? code}: {n}
                </span>
              ))}
            </span>
          )}
        </div>
      )}

      {/* Lista de archivos */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar border border-cyan-950/60 rounded-md bg-[#010912]/60">
        {loading && (
          <div className="text-[9px] text-cyan-600/70 font-mono italic text-center py-4 flex items-center justify-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Cargando status...
          </div>
        )}

        {!loading && error && (
          <div className="text-[9px] text-cyan-600/60 font-mono italic text-center py-4">
            — (sin status cargado)
          </div>
        )}

        {!loading && !error && branch !== null && files.length === 0 && (
          <div className="text-[9px] text-emerald-400/80 font-mono italic text-center py-4 flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-3 h-3" /> Repositorio limpio — sin cambios
          </div>
        )}

        {!loading && !error && branch === null && (
          <div className="text-[9px] text-cyan-600/60 font-mono italic text-center py-4 px-2">
            Sin status cargado — escribe la ruta del repo y pulsa CARGAR.
          </div>
        )}

        {!loading && !error && files.length > 0 && (
          <div className="py-0.5">
            {files.map(f => {
              const active = selectedPath === f.path;
              return (
                <button
                  key={f.path + f.display}
                  type="button"
                  onClick={() => selectFile(f)}
                  className={`w-full flex items-center gap-1 px-1 py-[2px] text-left rounded-sm transition-colors ${
                    active ? 'bg-amber-500/10' : 'hover:bg-cyan-950/40'
                  }`}
                  title={`${f.display} — clic para ver diff`}
                >
                  <span className="flex items-center gap-0.5 shrink-0">
                    {f.staged !== ' ' ? statusBadge(f.staged) : null}
                    {f.worktree !== ' ' ? statusBadge(f.worktree) : null}
                  </span>
                  <FileCode2 className={`w-3 h-3 shrink-0 ${active ? 'text-amber-400' : 'text-cyan-600'}`} />
                  <span
                    className={`text-[8.5px] font-mono truncate flex-1 ${
                      active ? 'text-amber-100' : 'text-cyan-300'
                    }`}
                  >
                    {f.display}
                  </span>
                  {active && <ChevronRight className="w-3 h-3 text-amber-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Visor de diff */}
      {selectedPath !== null && (
        <div className="flex flex-col border border-cyan-950/70 rounded-md bg-[#010912] min-h-0 max-h-[130px] shrink-0">
          <div className="flex items-center justify-between gap-1 px-1.5 py-1 border-b border-cyan-950/70 shrink-0">
            <div className="flex items-center gap-1 min-w-0">
              <FileCode2 className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-[8.5px] font-mono text-amber-100 truncate" title={selectedDisplay}>
                {selectedDisplay}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!selectedUntracked && (
                <button
                  type="button"
                  onClick={toggleStaged}
                  className={`px-1 py-px text-[7.5px] font-mono uppercase tracking-wider rounded border transition ${
                    showStaged
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                      : 'bg-cyan-950/40 text-cyan-500 border-cyan-900 hover:text-cyan-300'
                  }`}
                  title="Alternar diff staged (--cached) ↔ worktree"
                >
                  {showStaged ? 'STAGED' : 'WORKTREE'}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setSelectedPath(null);
                  setSelectedDisplay('');
                  setSelectedUntracked(false);
                  setDiff('');
                }}
                className="p-0.5 hover:bg-cyan-950/40 rounded text-cyan-600 hover:text-cyan-300"
                title="Cerrar visor de diff"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
          {selectedUntracked ? (
            <p className="px-1.5 py-1 text-[8px] font-mono text-cyan-500 italic">
              Archivo sin trackear — git no genera diff. Se incluirá completo en el commit.
            </p>
          ) : diffLoading ? (
            <div className="px-1.5 py-1 text-[8.5px] text-cyan-600/70 font-mono italic flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Cargando diff...
            </div>
          ) : diff === '' ? (
            <p className="px-1.5 py-1 text-[8px] font-mono text-cyan-500 italic">
              {showStaged
                ? 'Sin cambios en el índice (staged) para este archivo.'
                : 'Sin cambios en el directorio de trabajo para este archivo.'}
            </p>
          ) : (
            <pre className="px-1.5 py-1 text-[8px] font-mono whitespace-pre-wrap break-all overflow-y-auto custom-scrollbar min-h-0">
              {diff.split('\n').map((ln, i) => {
                let cls = 'text-cyan-700/80';
                if (
                  ln.startsWith('diff --git') ||
                  ln.startsWith('index ') ||
                  ln.startsWith('new file') ||
                  ln.startsWith('deleted file') ||
                  ln.startsWith('similarity index') ||
                  ln.startsWith('rename from') ||
                  ln.startsWith('rename to')
                ) {
                  cls = 'text-cyan-900';
                } else if (ln.startsWith('+++') || ln.startsWith('---')) {
                  cls = 'text-cyan-400/80';
                } else if (ln.startsWith('@@')) {
                  cls = 'text-cyan-300';
                } else if (ln.startsWith('+')) {
                  cls = 'text-emerald-400';
                } else if (ln.startsWith('-')) {
                  cls = 'text-rose-400';
                }
                return (
                  <div key={i} className={cls}>
                    {ln.length === 0 ? ' ' : ln}
                  </div>
                );
              })}
            </pre>
          )}
        </div>
      )}

      {/* Commit */}
      <div className="flex items-center gap-1 shrink-0">
        <GitCommit className="w-3 h-3 text-amber-400/90 shrink-0" />
        <input
          type="text"
          value={commitMsg}
          onChange={e => setCommitMsg(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') void handleCommit();
          }}
          placeholder="Mensaje del commit (git add -A + commit)"
          spellCheck={false}
          disabled={committing || branch === null}
          className="w-full bg-[#010912] border border-cyan-950 rounded px-1.5 py-1 text-[9px] font-mono text-cyan-100 placeholder-cyan-800 focus:border-amber-500 focus:outline-none disabled:opacity-40"
          title="Mensaje del commit — Enter para ejecutar"
        />
        <button
          type="button"
          onClick={() => void handleCommit()}
          disabled={committing || branch === null || !commitMsg.trim()}
          className={`${btnCls} border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 disabled:opacity-40 shrink-0`}
          title="git add -A && git commit -m"
        >
          {committing ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <GitCommit className="w-2.5 h-2.5" />}
          COMMIT
        </button>
      </div>

      {/* Resultado del commit */}
      {commitResult && (
        <div
          className={`border rounded p-1.5 shrink-0 ${
            commitResult.ok
              ? 'border-emerald-900/40 bg-emerald-950/10'
              : 'border-red-900/40 bg-red-950/10'
          }`}
        >
          <p
            className={`text-[8px] font-mono break-words whitespace-pre-wrap leading-snug ${
              commitResult.ok ? 'text-emerald-400/90' : 'text-red-400'
            }`}
          >
            {commitResult.text}
          </p>
        </div>
      )}
    </div>
  );
}

export default GitReviewPane;
