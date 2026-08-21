// ── F2.2 — Lista de sesiones VPS + resume (gateway hermes serve :9119) ─────
// Componente NIM: lista sesiones reales del VPS vía REST (listAllProfileSessions),
// búsqueda local, archivar, renombrar y resume por id (getLatestSessionMessages).
// Usa SOLO Tailwind + lucide-react — sin radix/cmdk/react-query.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  History,
  KeyRound,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  X
} from 'lucide-react';
import { connectionManager } from '../../lib/connection-manager';
import { isAuthenticated, login, setServeBaseUrl } from '../../lib/hermes/api-client';
import {
  getLatestSessionMessages,
  listAllProfileSessions,
  renameSession,
  setSessionArchived
} from '../../lib/hermes/sessions';
import type { SessionInfo, SessionMessage } from '../../lib/hermes/types';
import type { ChatMessage } from '../../types';

// Servidor por defecto (hermes serve local). Puede sobreescribirse vía variable
// de entorno NIM_SERVE_URL en el build Tauri.
const DEFAULT_SERVE_HTTP = 'http://127.0.0.1:9119';

// Credencial de desarrollo espejo de smoke-test.ts (el estándar del proyecto ya
// tiene credenciales inline hardcodeadas — wssClient.connect("NimMasterKey...")).
const DEV_USER = 'nim';
const DEV_PASSWORD = 'Nim6444dd09728d5011';

interface SessionListProps {
  /** Id de la sesión actualmente reanudada en el chat (para resaltarla). */
  activeSessionId?: string | null;
  /** Callback al hacer resume: entrega la sesión + sus últimos mensajes. */
  onResume: (session: SessionInfo, messages: SessionMessage[]) => void;
}

/** Timestamp UNIX (s o ms) → fecha relativa en español. */
export function relativeSessionTime(ts?: number | null): string {
  if (!ts) return '—';
  const ms = ts > 1e12 ? ts : ts * 1000;
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'ahora';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `hace ${days} d`;
  return new Date(ms).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

/** Extrae texto plano del content de un SessionMessage (string | array de partes). */
export function sessionMessageText(m: SessionMessage): string {
  const c = m.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .map(part => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const p = part as Record<string, unknown>;
          if (p.type === 'text' && typeof p.text === 'string') return p.text;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function fmtTimestamp(ts?: number | null): string {
  if (!ts) return new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const ms = ts > 1e12 ? ts : ts * 1000;
  return new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

/** Convierte mensajes de sesión VPS al formato ChatMessage del dashboard NIM. */
export function sessionMessagesToChat(session: SessionInfo, messages: SessionMessage[]): ChatMessage[] {
  const modelUsed = session.model || undefined;
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    const text = sessionMessageText(m).trim();
    if (!text) continue;
    if (m.role === 'tool') {
      out.push({
        id: `s-${out.length}-${m.timestamp ?? 0}`,
        sender: 'nim',
        text: `[HERRAMIENTA ${m.tool_name ?? 'tool'}]: ${text.slice(0, 600)}`,
        timestamp: fmtTimestamp(m.timestamp),
        modelUsed: 'TOOL'
      });
      continue;
    }
    out.push({
      id: `s-${out.length}-${m.timestamp ?? 0}`,
      sender: m.role === 'user' ? 'user' : 'nim',
      text,
      timestamp: fmtTimestamp(m.timestamp),
      ...(modelUsed ? { modelUsed } : {})
    });
  }
  return out;
}

export function SessionList({ activeSessionId, onResume }: SessionListProps) {
  const [authState, setAuthState] = useState<'checking' | 'needs_login' | 'ready'>('checking');
  const [username, setUsername] = useState(DEV_USER);
  const [password, setPassword] = useState(DEV_PASSWORD);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Sesiones reales del VPS (gateway hermes serve): 50 recientes, sin archivadas.
      const page = await listAllProfileSessions(50, 1);
      setSessions(page?.sessions ?? []);
    } catch (e) {
      setError((e as Error).message?.slice(0, 200) || 'Error al listar sesiones');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setServeBaseUrl((typeof process !== 'undefined' && process.env?.NIM_SERVE_URL) || DEFAULT_SERVE_HTTP);
        // Establece la conexión WS del gateway (necesaria para chat/resume futuro).
        await connectionManager.connectServe();
      } catch {
        // El listado REST funciona aunque el WS no esté abierto; no bloquear.
      }
      if (cancelled) return;
      if (isAuthenticated()) {
        setAuthState('ready');
        await loadSessions();
      } else {
        setAuthState('needs_login');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSessions]);

  const handleLogin = async () => {
    setLoggingIn(true);
    setLoginError('');
    try {
      await login(username.trim() || DEV_USER, password || DEV_PASSWORD);
      setAuthState('ready');
      await loadSessions();
    } catch (e) {
      setLoginError((e as Error).message?.slice(0, 160) || 'Login fallido');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleResume = async (session: SessionInfo) => {
    setResumingId(session.id);
    setError('');
    try {
      const page = await getLatestSessionMessages(session.id);
      onResume(session, page?.messages ?? []);
    } catch (e) {
      setError((e as Error).message?.slice(0, 200) || 'No se pudo cargar la sesión');
    } finally {
      setResumingId(null);
    }
  };

  const handleArchive = async (e: React.MouseEvent, session: SessionInfo) => {
    e.stopPropagation();
    setArchivingId(session.id);
    setError('');
    try {
      await setSessionArchived(session.id, true);
      setSessions(prev => prev.filter(s => s.id !== session.id));
    } catch (err) {
      setError((err as Error).message?.slice(0, 160) || 'No se pudo archivar');
    } finally {
      setArchivingId(null);
    }
  };

  const handleRename = async (e: React.MouseEvent, session: SessionInfo) => {
    e.stopPropagation();
    const next = window.prompt('Nuevo título de la sesión:', session.title ?? '');
    if (!next || next.trim() === (session.title ?? '')) return;
    setError('');
    try {
      const res = await renameSession(session.id, next.trim());
      setSessions(prev =>
        prev.map(s => (s.id === session.id ? { ...s, title: res?.title ?? next.trim() } : s))
      );
    } catch (err) {
      setError((err as Error).message?.slice(0, 160) || 'No se pudo renombrar');
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      s =>
        (s.title ?? '').toLowerCase().includes(q) ||
        (s.preview ?? '').toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.model ?? '').toLowerCase().includes(q)
    );
  }, [sessions, query]);

  const btnCls =
    'px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider rounded border transition flex items-center gap-1';

  return (
    <div className="flex flex-col gap-1.5 min-h-0 h-full">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-cyan-950/60 pb-1.5 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <History className="w-3 h-3 text-cyan-400 flex-shrink-0" />
          <h2 className="text-[9px] font-bold tracking-widest uppercase font-mono text-cyan-200">
            SESIONES VPS
          </h2>
          {sessions.length > 0 && (
            <span className="text-[7px] text-cyan-600 font-mono flex-shrink-0">({sessions.length})</span>
          )}
        </div>
        <button
          type="button"
          onClick={loadSessions}
          disabled={loading || authState !== 'ready'}
          className="p-1 hover:bg-cyan-950/50 rounded text-cyan-500 transition-colors disabled:opacity-40"
          title="Actualizar lista"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {authState === 'checking' && (
        <div className="text-[9px] text-cyan-600/70 font-mono italic text-center py-4 flex items-center justify-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> Verificando gateway :9119...
        </div>
      )}

      {authState === 'needs_login' && (
        <div className="flex flex-col gap-1.5 p-2 border border-amber-900/40 bg-amber-950/10 rounded">
          <div className="flex items-center gap-1.5 text-[8.5px] font-mono text-amber-300 uppercase tracking-wider">
            <KeyRound className="w-3 h-3" /> Conectar al gateway VPS
          </div>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="usuario"
            className="w-full bg-[#010912] border border-cyan-950 rounded px-1.5 py-1 text-[9px] font-mono text-cyan-100 placeholder-cyan-800 focus:border-cyan-500 focus:outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="contraseña"
            className="w-full bg-[#010912] border border-cyan-950 rounded px-1.5 py-1 text-[9px] font-mono text-cyan-100 placeholder-cyan-800 focus:border-cyan-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleLogin}
            disabled={loggingIn}
            className={`${btnCls} justify-center bg-amber-500/10 text-amber-200 border-amber-500/40 hover:bg-amber-500/20 disabled:opacity-50`}
          >
            {loggingIn ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <KeyRound className="w-2.5 h-2.5" />}
            {loggingIn ? 'CONECTANDO...' : 'CONECTAR'}
          </button>
          {loginError && <p className="text-[8px] text-red-400 font-mono break-words">{loginError}</p>}
        </div>
      )}

      {authState === 'ready' && (
        <>
          {/* Búsqueda */}
          <div className="relative shrink-0">
            <Search className="w-3 h-3 absolute left-1.5 top-1/2 -translate-y-1/2 text-cyan-700 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar sesiones..."
              className="w-full bg-[#010912] border border-cyan-950 rounded pl-6 pr-1.5 py-1 text-[9px] font-mono text-cyan-100 placeholder-cyan-800 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          {error && (
            <div className="flex items-center justify-between gap-1.5 border border-red-900/40 bg-red-950/10 rounded p-1.5 shrink-0">
              <p className="text-[8px] text-red-400 font-mono break-words leading-snug">{error}</p>
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

          {/* Lista */}
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 pr-0.5 min-h-0">
            {loading && sessions.length === 0 && (
              <div className="text-[9px] text-cyan-600/70 font-mono italic text-center py-4 flex items-center justify-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Cargando sesiones del VPS...
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div className="text-[9px] text-cyan-600/60 font-mono italic text-center py-4">
                {sessions.length === 0 ? 'Sin sesiones en el VPS.' : 'Sin resultados para la búsqueda.'}
              </div>
            )}

            {filtered.map(session => {
              const title = session.title?.trim() || 'Sesión sin título';
              const preview = (session.preview ?? '').trim();
              const isActive = session.id === activeSessionId;
              const isBusy = resumingId === session.id || archivingId === session.id;
              return (
                <div
                  key={session.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleResume(session)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') handleResume(session);
                  }}
                  className={`w-full text-left bg-[#010912] hover:bg-cyan-950/40 border rounded p-1.5 transition cursor-pointer group ${
                    isActive
                      ? 'border-cyan-500/50 bg-cyan-500/5 shadow-[0_0_8px_rgba(34,211,238,0.15)]'
                      : 'border-cyan-950/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[9px] font-mono font-bold text-cyan-200 truncate">{title}</span>
                    <span className="flex items-center gap-1 flex-shrink-0">
                      {session.is_active && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"
                          title="Sesión activa ahora"
                        />
                      )}
                      <span className="text-[7px] text-cyan-600 font-mono">
                        {relativeSessionTime(session.last_active ?? session.started_at)}
                      </span>
                    </span>
                  </div>

                  {preview && (
                    <p className="text-[8px] text-cyan-600/80 font-mono truncate mt-0.5">{preview}</p>
                  )}

                  <div className="flex items-center gap-1 mt-1 min-w-0">
                    <span className="px-1 py-px text-[7px] rounded bg-cyan-950/60 border border-cyan-950/60 text-cyan-400 font-mono flex-shrink-0">
                      {session.message_count} msgs
                    </span>
                    {session.model && (
                      <span className="px-1 py-px text-[7px] rounded bg-amber-950/40 border border-amber-900/40 text-amber-400 font-mono truncate max-w-[90px]">
                        {session.model}
                      </span>
                    )}
                    {session.source && (
                      <span className="px-1 py-px text-[7px] rounded bg-violet-950/40 border border-violet-900/40 text-violet-300 font-mono flex-shrink-0">
                        {session.source}
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                      {isBusy ? (
                        <Loader2 className="w-2.5 h-2.5 text-cyan-500 animate-spin" />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={e => handleRename(e, session)}
                            className="p-0.5 hover:bg-cyan-500/20 rounded text-cyan-400"
                            title="Renombrar"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                          </button>
                          <button
                            type="button"
                            onClick={e => handleArchive(e, session)}
                            className="p-0.5 hover:bg-red-500/20 rounded text-red-400"
                            title="Archivar"
                          >
                            <Archive className="w-2.5 h-2.5" />
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
