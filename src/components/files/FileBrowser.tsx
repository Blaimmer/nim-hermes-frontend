// ── F2.3 — Explorador de archivos local (PC) vía commands Tauri nativos ─────
// Componente NIM: tree lazy con nim_list_dir (expansión por demanda), visor de
// archivos con nim_filesystem("read") y ops con nim_file_ops (move/copy/mkdir/
// delete). Sin dependencias nuevas — solo Tailwind + lucide-react, mismo visual
// del dashboard NIM (oscuro/cyan, font-mono, tamaños pequeños).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  FileWarning,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  MoveRight,
  Pencil,
  RefreshCw,
  Trash2,
  X
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

// ── Plataforma / utilidades de ruta (sin node path — separadores manuales) ──
const IS_WINDOWS = typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent);
const SEP = IS_WINDOWS ? '\\' : '/';
const HOME_DIR =
  typeof process !== 'undefined' && process.env?.HOME ? process.env.HOME : '/home/clawd';
const DEFAULT_ROOT = IS_WINDOWS ? 'C:\\' : HOME_DIR;
const MAX_VIEW_CHARS = 50 * 1024; // ~50 KB en caracteres (vista previa)

function joinPath(dir: string, name: string): string {
  return (dir.endsWith(SEP) ? dir : dir + SEP) + name;
}

function parentPath(p: string): string | null {
  const trimmed = p.endsWith(SEP) ? p.slice(0, -1) : p;
  const idx = trimmed.lastIndexOf(SEP);
  if (idx === 0) return SEP; // Unix: /home → /
  if (idx < 0) {
    if (IS_WINDOWS && /^[A-Za-z]:$/.test(trimmed)) return trimmed + SEP; // C: → C:\
    return null; // raíz alcanzada — sin directorio padre
  }
  return trimmed.slice(0, idx) + SEP;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

interface FsEntry {
  name: string;
  is_dir: boolean;
}

interface TreeNode {
  path: string;
  name: string;
  is_dir: boolean;
  expanded: boolean;
  loaded: boolean;
  loading: boolean;
  children: string[];
  parent: string | null;
}

interface ViewerState {
  path: string;
  content: string;
  truncated: boolean;
  binary: boolean;
  size: number | null;
}

export function FileBrowser() {
  const [nodes, setNodes] = useState<Record<string, TreeNode>>({});
  const [currentPath, setCurrentPath] = useState<string>(DEFAULT_ROOT);
  const [pathInput, setPathInput] = useState<string>(DEFAULT_ROOT);
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);

  const nodesRef = useRef<Record<string, TreeNode>>({});
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  /** Crea la cadena de nodos de `path` (raíz → path) en el árbol. */
  const ensureNode = useCallback((path: string) => {
    setNodes(prev => {
      if (prev[path]) return prev;
      const next: Record<string, TreeNode> = { ...prev };
      const parts = path.split(SEP).filter(Boolean);
      let cur: string;
      if (IS_WINDOWS) {
        cur = (parts[0] ?? 'C:') + SEP;
        parts.shift();
      } else {
        cur = '/';
      }
      const ensure = (p: string, parent: string | null, name: string) => {
        if (!next[p]) {
          next[p] = {
            path: p,
            name,
            is_dir: true,
            expanded: false,
            loaded: false,
            loading: false,
            children: [],
            parent
          };
          if (parent && next[parent]) next[parent].children.push(p);
        }
      };
      ensure(cur, null, cur);
      let curPath = cur;
      for (const part of parts) {
        const child = joinPath(curPath, part);
        ensure(child, curPath, part);
        curPath = child;
      }
      return next;
    });
  }, []);

  /** Carga el listado de `path` (nim_list_dir) y actualiza el árbol. */
  const loadDir = useCallback(
    async (path: string) => {
      ensureNode(path);
      setLoadingPath(path);
      setError('');
      try {
        const data = await callCommand('nim_list_dir', { path });
        const entries: FsEntry[] = Array.isArray(data?.entries) ? data.entries : [];
        const sorted = [...entries].sort((a, b) => {
          if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setNodes(prev => {
          const next: Record<string, TreeNode> = { ...prev };
          const existing = next[path];
          const node: TreeNode = existing ?? {
            path,
            name: path,
            is_dir: true,
            expanded: false,
            loaded: false,
            loading: false,
            children: [],
            parent: null
          };
          const children: string[] = [];
          for (const e of sorted) {
            const childPath = joinPath(path, e.name);
            children.push(childPath);
            if (!next[childPath]) {
              next[childPath] = {
                path: childPath,
                name: e.name,
                is_dir: e.is_dir,
                expanded: false,
                loaded: false,
                loading: false,
                children: [],
                parent: path
              };
            } else {
              // refrescar metadatos (dir ↔ archivo) sin perder expansión
              next[childPath] = { ...next[childPath], is_dir: e.is_dir };
            }
          }
          // hijos que ya no existen (refresco) → limpiar
          for (const oldChild of node.children) {
            if (!children.includes(oldChild)) delete next[oldChild];
          }
          node.children = children;
          node.loaded = true;
          node.loading = false;
          next[path] = node;
          return next;
        });
      } catch (e) {
        setError(`No se pudo leer "${path}": ${errMsg(e)}`);
        setNodes(prev => {
          const n = prev[path];
          if (!n) return prev;
          return { ...prev, [path]: { ...n, loading: false } };
        });
      } finally {
        setLoadingPath(null);
      }
    },
    [ensureNode]
  );

  /** Expande/colapsa una carpeta (expansión lazy: carga hijos solo al abrir). */
  const toggleExpand = useCallback(
    (path: string) => {
      const node = nodesRef.current[path];
      if (!node) return;
      const willExpand = !node.expanded;
      setNodes(prev => {
        const n = prev[path];
        if (!n) return prev;
        return {
          ...prev,
          [path]: {
            ...n,
            expanded: willExpand,
            loading: willExpand && !n.loaded ? true : n.loading
          }
        };
      });
      if (willExpand && !node.loaded && !node.loading) void loadDir(path);
    },
    [loadDir]
  );

  /** Navega a `path`: expande la cadena de ancestros y carga su listado. */
  const navigateTo = useCallback(
    (path: string) => {
      const clean = path.trim();
      if (!clean) return;
      ensureNode(clean);
      setNodes(prev => {
        const next = { ...prev };
        let p: string | null = clean;
        while (p) {
          const n = next[p];
          if (n) next[p] = { ...n, expanded: true };
          p = n?.parent ?? null;
        }
        return next;
      });
      setCurrentPath(clean);
      setPathInput(clean);
      setViewer(null);
      void loadDir(clean);
    },
    [ensureNode, loadDir]
  );

  const goUp = useCallback(() => {
    const p = parentPath(currentPath);
    if (p) navigateTo(p);
  }, [currentPath, navigateTo]);

  const refresh = useCallback(() => {
    void loadDir(currentPath);
  }, [currentPath, loadDir]);

  /** Lee un archivo (nim_filesystem "read") y lo muestra en el visor. */
  const openFile = useCallback(async (path: string) => {
    setViewerLoading(true);
    setError('');
    try {
      let size: number | null = null;
      try {
        const sizeData = await callCommand('nim_file_ops', { action: 'size', path });
        if (typeof sizeData?.size === 'number') size = sizeData.size;
      } catch {
        /* el tamaño es opcional — no bloquear el visor */
      }
      const data = await callCommand('nim_filesystem', { action: 'read', path, content: null });
      let content: string = typeof data?.content === 'string' ? data.content : '';
      const binary = content.slice(0, 8192).includes('\u0000');
      let truncated = false;
      if (content.length > MAX_VIEW_CHARS) {
        content = content.slice(0, MAX_VIEW_CHARS);
        truncated = true;
      }
      setViewer({ path, content: binary ? '' : content, truncated, binary, size });
    } catch (e) {
      setError(`No se pudo leer "${path}": ${errMsg(e)}`);
    } finally {
      setViewerLoading(false);
    }
  }, []);

  // ── Operaciones de archivo (nim_file_ops) ────────────────────────────────
  const handleMkdir = useCallback(async () => {
    const name = window.prompt('Nombre de la nueva carpeta:', 'nueva_carpeta');
    if (!name || !name.trim()) return;
    const target = joinPath(currentPath, name.trim());
    setError('');
    try {
      await callCommand('nim_file_ops', { action: 'mkdir', path: target, dest: null });
      setFeedback(`Carpeta creada: ${name.trim()}`);
      void loadDir(currentPath);
    } catch (e) {
      setError(`Error al crear carpeta: ${errMsg(e)}`);
    }
  }, [currentPath, loadDir]);

  const handleRename = useCallback(
    async (entryPath: string, currentName: string) => {
      const next = window.prompt('Nuevo nombre:', currentName);
      if (!next || !next.trim() || next.trim() === currentName) return;
      const dest = joinPath(parentPath(entryPath) ?? currentPath, next.trim());
      setError('');
      try {
        await callCommand('nim_file_ops', { action: 'move', path: entryPath, dest });
        setFeedback(`Renombrado → ${next.trim()}`);
        if (viewer?.path === entryPath) setViewer(null);
        void loadDir(currentPath);
      } catch (e) {
        setError(`Error al renombrar: ${errMsg(e)}`);
      }
    },
    [currentPath, loadDir, viewer]
  );

  const handleCopy = useCallback(
    async (entryPath: string, currentName: string) => {
      const dest = window.prompt(
        'Ruta destino completa (copiar a):',
        joinPath(currentPath, `copia_de_${currentName}`)
      );
      if (!dest || !dest.trim()) return;
      setError('');
      try {
        await callCommand('nim_file_ops', { action: 'copy', path: entryPath, dest: dest.trim() });
        setFeedback(`Copiado → ${dest.trim()}`);
        void loadDir(currentPath);
      } catch (e) {
        setError(`Error al copiar: ${errMsg(e)}`);
      }
    },
    [currentPath, loadDir]
  );

  const handleMove = useCallback(
    async (entryPath: string) => {
      const dest = window.prompt('Ruta destino completa (mover a):', entryPath);
      if (!dest || !dest.trim() || dest.trim() === entryPath) return;
      setError('');
      try {
        await callCommand('nim_file_ops', { action: 'move', path: entryPath, dest: dest.trim() });
        setFeedback(`Movido → ${dest.trim()}`);
        if (viewer?.path === entryPath) setViewer(null);
        void loadDir(currentPath);
      } catch (e) {
        setError(`Error al mover: ${errMsg(e)}`);
      }
    },
    [currentPath, loadDir, viewer]
  );

  const handleDelete = useCallback(
    async (entryPath: string, currentName: string) => {
      if (!window.confirm(`¿Eliminar definitivamente?\n\n${entryPath}`)) return;
      setError('');
      try {
        await callCommand('nim_file_ops', { action: 'delete', path: entryPath, dest: null });
        setFeedback(`Eliminado: ${currentName}`);
        if (viewer?.path === entryPath) setViewer(null);
        void loadDir(currentPath);
      } catch (e) {
        setError(`Error al eliminar: ${errMsg(e)}`);
      }
    },
    [currentPath, loadDir, viewer]
  );

  // ── Render del árbol visible (DFS desde la raíz, solo nodos expandidos) ──
  const visibleNodes = useMemo(() => {
    const out: { node: TreeNode; depth: number }[] = [];
    const root = nodes[DEFAULT_ROOT];
    if (!root) return out;
    const stack: { path: string; depth: number }[] = [{ path: root.path, depth: 0 }];
    let guard = 0;
    while (stack.length && guard < 600) {
      guard += 1;
      const { path, depth } = stack.pop()!;
      const node = nodes[path];
      if (!node) continue;
      out.push({ node, depth });
      if (node.expanded) {
        for (let i = node.children.length - 1; i >= 0; i -= 1) {
          const child = nodes[node.children[i]];
          if (child) stack.push({ path: child.path, depth: depth + 1 });
        }
      }
    }
    return out;
  }, [nodes]);

  // Auto-limpiar el feedback de operaciones
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(''), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  // Montaje: raíz + listado inicial
  useEffect(() => {
    ensureNode(DEFAULT_ROOT);
    void loadDir(DEFAULT_ROOT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const btnCls =
    'px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider rounded border transition flex items-center gap-1';
  const iconBtnCls =
    'p-1 rounded text-cyan-600 hover:text-cyan-300 hover:bg-cyan-950/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed';
  const rowIconBtnCls = 'hover:bg-cyan-950/50 rounded p-0.5 transition-colors';

  return (
    <div className="flex flex-col gap-1.5 min-h-0 h-full">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-cyan-950/60 pb-1.5 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <FolderOpen className="w-3 h-3 text-emerald-400 flex-shrink-0" />
          <h2 className="text-[9px] font-bold tracking-widest uppercase font-mono text-emerald-200/90">
            ARCHIVOS — PC LOCAL
          </h2>
          <span className="text-[7px] text-cyan-600 font-mono flex-shrink-0">
            {IS_WINDOWS ? 'win' : 'unix'}
          </span>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loadingPath !== null}
          className="p-1 hover:bg-cyan-950/50 rounded text-cyan-500 transition-colors disabled:opacity-40"
          title="Refrescar directorio actual"
        >
          <RefreshCw className={`w-3 h-3 ${loadingPath !== null ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Barra de ruta + subir + nueva carpeta */}
      <div className="flex items-center gap-1 shrink-0">
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={goUp}
            disabled={!parentPath(currentPath)}
            className={iconBtnCls}
            title="Subir (directorio padre)"
          >
            <ArrowUp className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={handleMkdir}
            className={iconBtnCls}
            title="Nueva carpeta (mkdir)"
          >
            <FolderPlus className="w-3 h-3" />
          </button>
        </div>
        <input
          type="text"
          value={pathInput}
          onChange={e => setPathInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') navigateTo(pathInput);
          }}
          placeholder={DEFAULT_ROOT}
          spellCheck={false}
          className="w-full bg-[#010912] border border-cyan-950 rounded px-1.5 py-1 text-[9px] font-mono text-cyan-100 placeholder-cyan-800 focus:border-cyan-500 focus:outline-none"
          title="Ruta actual — Enter para navegar"
        />
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

      {/* Feedback de operaciones */}
      {feedback && !error && (
        <div className="px-1.5 py-0.5 text-[8px] font-mono text-emerald-400/90 truncate shrink-0">
          ✓ {feedback}
        </div>
      )}

      {/* Árbol (expansión lazy) */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar border border-cyan-950/60 rounded-md bg-[#010912]/60">
        {loadingPath !== null && visibleNodes.length === 0 && (
          <div className="text-[9px] text-cyan-600/70 font-mono italic text-center py-4 flex items-center justify-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Cargando {loadingPath}...
          </div>
        )}

        {loadingPath === null && visibleNodes.length === 0 && (
          <div className="text-[9px] text-cyan-600/60 font-mono italic text-center py-4">
            {error ? '—' : 'Carpeta vacía (o sin permisos de lectura)'}
          </div>
        )}

        {visibleNodes.length > 0 && (
          <div className="py-0.5">
            {visibleNodes.map(({ node, depth }) => (
              <div
                key={node.path}
                className={`flex items-center gap-1 px-1 py-[1.5px] rounded-sm ${
                  node.path === currentPath ? 'bg-cyan-500/10' : 'hover:bg-cyan-950/40'
                }`}
                style={{ paddingLeft: `${6 + depth * 10}px` }}
              >
                {node.is_dir ? (
                  <button
                    type="button"
                    onClick={() => toggleExpand(node.path)}
                    className="text-cyan-600 hover:text-cyan-300 shrink-0"
                    title={node.expanded ? 'Contraer' : 'Expandir (cargar hijos)'}
                  >
                    {node.loading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : node.expanded ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                  </button>
                ) : (
                  <span className="w-3 shrink-0" />
                )}

                {node.is_dir ? (
                  <button
                    type="button"
                    onClick={() => navigateTo(node.path)}
                    className="flex items-center gap-1 min-w-0 flex-1 text-left"
                    title={`Abrir ${node.path}`}
                  >
                    {node.expanded ? (
                      <FolderOpen className="w-3 h-3 text-amber-400/90 shrink-0" />
                    ) : (
                      <Folder className="w-3 h-3 text-amber-400/70 shrink-0" />
                    )}
                    <span className="text-[8.5px] font-mono text-cyan-200 truncate">
                      {node.name}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openFile(node.path)}
                    className="flex items-center gap-1 min-w-0 flex-1 text-left"
                    title={`Ver ${node.path}`}
                  >
                    <FileText className="w-3 h-3 text-cyan-500 shrink-0" />
                    <span className="text-[8.5px] font-mono text-cyan-300 truncate">
                      {node.name}
                    </span>
                  </button>
                )}

                {node.path !== DEFAULT_ROOT && (
                  <span className="flex items-center gap-0.5 shrink-0 opacity-60 hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => handleMove(node.path)}
                      className={`${rowIconBtnCls} text-cyan-700 hover:text-cyan-300`}
                      title="Mover a otra ruta"
                    >
                      <MoveRight className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(node.path, node.name)}
                      className={`${rowIconBtnCls} text-cyan-700 hover:text-cyan-300`}
                      title="Copiar a otra ruta"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRename(node.path, node.name)}
                      className={`${rowIconBtnCls} text-cyan-700 hover:text-cyan-300`}
                      title="Renombrar"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(node.path, node.name)}
                      className={`${rowIconBtnCls} text-rose-700 hover:text-rose-400`}
                      title="Eliminar (con confirmación)"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Visor de archivo */}
      {viewerLoading && !viewer && (
        <div className="text-[8.5px] text-cyan-600/70 font-mono italic py-1 flex items-center gap-1.5 shrink-0">
          <Loader2 className="w-3 h-3 animate-spin" /> Leyendo archivo...
        </div>
      )}

      {viewer && (
        <div className="flex flex-col border border-cyan-950/70 rounded-md bg-[#010912] min-h-0 max-h-[150px] shrink-0">
          <div className="flex items-center justify-between gap-1 px-1.5 py-1 border-b border-cyan-950/70 shrink-0">
            <div className="flex items-center gap-1 min-w-0">
              {viewer.binary ? (
                <FileWarning className="w-3 h-3 text-amber-400 shrink-0" />
              ) : (
                <FileText className="w-3 h-3 text-cyan-400 shrink-0" />
              )}
              <span className="text-[8.5px] font-mono text-cyan-300 truncate" title={viewer.path}>
                {viewer.path}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {viewer.size !== null && (
                <span className="text-[8px] font-mono text-cyan-700">{fmtSize(viewer.size)}</span>
              )}
              <button
                type="button"
                onClick={() => setViewer(null)}
                className="p-0.5 hover:bg-cyan-950/40 rounded text-cyan-600 hover:text-cyan-300"
                title="Cerrar visor"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
          <pre className="px-1.5 py-1 text-[8px] font-mono text-cyan-100/90 whitespace-pre-wrap break-all overflow-y-auto custom-scrollbar min-h-0">
            {viewer.binary
              ? '⚠ Archivo binario — el contenido no se muestra (solo metadatos).'
              : viewer.content || '(archivo vacío)'}
          </pre>
          {viewer.truncated && (
            <div className="px-1.5 pb-1 text-[7.5px] font-mono text-amber-400/90 shrink-0">
              ⚠ Vista previa truncada a los primeros {MAX_VIEW_CHARS.toLocaleString('es')}{' '}
              caracteres.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FileBrowser;
