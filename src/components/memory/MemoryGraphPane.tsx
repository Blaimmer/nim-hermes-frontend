// ── F2.6 — Memory Graph + Skills VPS (gateway hermes serve :9119) ─────────
// Panel NIM: star map REAL del harness (getStarmapGraph) + skills del VPS
// (getSkills). Graph SVG inline con layout circular por categoría (fuerza
// bruta determinista, SIN librerías de graph) + tarjetas de memoria libre +
// lista de skills agrupada por categoría con búsqueda local.
// Login/gateway: espejo del patrón SessionList (F2.2).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BrainCircuit,
  KeyRound,
  Layers,
  Loader2,
  Network,
  Pin,
  RefreshCw,
  Search,
  X
} from 'lucide-react';
import { connectionManager } from '../../lib/connection-manager';
import { isAuthenticated, login, setServeBaseUrl } from '../../lib/hermes/api-client';
import { getSkills, getStarmapGraph } from '../../lib/hermes/skills';
import type { StarmapGraph, StarmapMemoryCard, StarmapNode, SkillInfo } from '../../lib/hermes/types';

const DEFAULT_SERVE_HTTP = 'http://127.0.0.1:9119';
// IP pública del VPS: dentro de la app Tauri (PC Windows) 127.0.0.1 es la PC
// local, no el VPS — el serve solo corre en el VPS.
const VPS_SERVE_HTTP = 'http://72.60.123.163:9119';

/** Resuelve la base del serve: en runtime Tauri apunta al VPS, en navegador localhost. */
function resolveServeBase(): string {
  if (typeof window !== 'undefined' && Boolean((window as any)?.__TAURI_INTERNALS__?.invoke)) {
    return VPS_SERVE_HTTP;
  }
  return DEFAULT_SERVE_HTTP;
}

// Credencial de desarrollo espejo de smoke-test.ts / SessionList.tsx.
const DEV_USER = 'nim';
const DEV_PASSWORD = 'Nim6444dd09728d5011';

// Límite de nodos renderizados para mantener el SVG legible (top por uso).
const MAX_NODES = 140;
// Tarjetas de memoria visibles por defecto (el resto se pliega).
const MAX_CARDS_VISIBLE = 3;

// Paleta para chips de categoría (10 colores, cíclica).
const CATEGORY_COLORS = [
  '#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#fb7185',
  '#818cf8', '#a3e635', '#fb923c', '#2dd4bf', '#f472b6'
];

const SVG_W = 420;
const SVG_H = 300;

interface GraphPos { x: number; y: number }

/** Layout circular determinista: nodos ordenados por categoría (sectores
 *  visuales) + jitter radial pseudo-aleatorio para evitar colisiones. */
function computeGraphLayout(nodes: StarmapNode[], width: number, height: number): Map<string, GraphPos> {
  const cx = width / 2;
  const cy = height / 2;
  const R = Math.min(width, height) / 2 - 30;
  const sorted = [...nodes].sort(
    (a, b) => a.category.localeCompare(b.category) || b.useCount - a.useCount
  );
  const n = Math.max(sorted.length, 1);
  const pos = new Map<string, GraphPos>();
  sorted.forEach((node, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const jitter = 0.8 + ((i * 37) % 35) / 100; // 0.80..1.14 determinista
    const r = R * jitter;
    pos.set(node.id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  });
  return pos;
}

function fmtTs(ts?: null | number): string {
  if (!ts) return '—';
  const ms = ts > 1e12 ? ts : ts * 1000;
  return new Date(ms).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function truncate(s: string, max: number): string {
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

const btnCls =
  'px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider rounded border transition flex items-center gap-1';

export function MemoryGraphPane() {
  const [authState, setAuthState] = useState<'checking' | 'needs_login' | 'ready'>('checking');
  const [username, setUsername] = useState(DEV_USER);
  const [password, setPassword] = useState(DEV_PASSWORD);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [view, setView] = useState<'graph' | 'skills'>('graph');
  const [starmap, setStarmap] = useState<StarmapGraph | null>(null);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [graphError, setGraphError] = useState('');
  const [skillsError, setSkillsError] = useState('');
  const [query, setQuery] = useState('');
  const [showAllCards, setShowAllCards] = useState(false);

  const loadData = useCallback(async () => {
    setLoadingGraph(true);
    setLoadingSkills(true);
    setGraphError('');
    setSkillsError('');
    // Promise.allSettled: si una fuente falla, la otra se muestra igual (resiliente).
    const [g, s] = await Promise.allSettled([getStarmapGraph(), getSkills()]);
    if (g.status === 'fulfilled') setStarmap(g.value);
    else setGraphError((g.reason as Error)?.message?.slice(0, 200) || 'Error al cargar el star map');
    if (s.status === 'fulfilled') setSkills(s.value ?? []);
    else setSkillsError((s.reason as Error)?.message?.slice(0, 200) || 'Error al cargar las skills');
    setLoadingGraph(false);
    setLoadingSkills(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setServeBaseUrl((typeof process !== 'undefined' && process.env?.NIM_SERVE_URL) || resolveServeBase());
        await connectionManager.connectServe();
      } catch {
        // El REST funciona aunque el WS no esté abierto; no bloquear.
      }
      if (cancelled) return;
      if (isAuthenticated()) {
        setAuthState('ready');
        await loadData();
      } else {
        setAuthState('needs_login');
      }
    })();
    return () => { cancelled = true; };
  }, [loadData]);

  const handleLogin = async () => {
    setLoggingIn(true);
    setLoginError('');
    try {
      await login(username.trim() || DEV_USER, password || DEV_PASSWORD);
      setAuthState('ready');
      await loadData();
    } catch (e) {
      setLoginError((e as Error).message?.slice(0, 160) || 'Login fallido');
    } finally {
      setLoggingIn(false);
    }
  };

  // ── Derivados del star map ─────────────────────────────────────────────
  const nodes = useMemo(() => starmap?.nodes ?? [], [starmap]);
  const edges = useMemo(() => starmap?.edges ?? [], [starmap]);
  const clusters = useMemo(() => starmap?.clusters ?? [], [starmap]);
  const memoryCards = useMemo(() => starmap?.memory ?? [], [starmap]);

  const renderedNodes = useMemo(() => {
    const sorted = [...nodes].sort((a, b) => b.useCount - a.useCount);
    return sorted.slice(0, MAX_NODES);
  }, [nodes]);

  const truncated = nodes.length > renderedNodes.length;

  const nodeIds = useMemo(() => new Set(renderedNodes.map(n => n.id)), [renderedNodes]);
  const renderedEdges = useMemo(
    () => edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target)),
    [edges, nodeIds]
  );

  const positions = useMemo(
    () => computeGraphLayout(renderedNodes, SVG_W, SVG_H),
    [renderedNodes]
  );

  const stats = useMemo(() => {
    const skillCount = nodes.filter(n => n.kind === 'skill').length;
    const memCount = nodes.filter(n => n.kind === 'memory').length;
    return { total: nodes.length, skills: skillCount, memory: memCount };
  }, [nodes]);

  const catColor = useCallback((cat: string, idx: number) => CATEGORY_COLORS[idx % CATEGORY_COLORS.length], []);

  // Skills agrupadas por categoría (orden alfabético) + búsqueda local.
  const filteredSkills = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        (s.category ?? '').toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q)
    );
  }, [skills, query]);

  const skillsByCategory = useMemo(() => {
    const map = new Map<string, SkillInfo[]>();
    for (const s of filteredSkills) {
      const cat = s.category?.trim() || 'sin categoría';
      const arr = map.get(cat) ?? [];
      arr.push(s);
      map.set(cat, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredSkills]);

  const visibleCards = showAllCards ? memoryCards : memoryCards.slice(0, MAX_CARDS_VISIBLE);

  const provenanceBadge = (p?: 'agent' | 'bundled' | 'hub') => {
    if (!p) return null;
    const styles: Record<string, string> = {
      agent: 'bg-sky-950/50 border-sky-800/50 text-sky-300',
      bundled: 'bg-emerald-950/50 border-emerald-800/50 text-emerald-300',
      hub: 'bg-violet-950/50 border-violet-800/50 text-violet-300'
    };
    return (
      <span className={`px-1 py-px text-[7px] rounded border font-mono flex-shrink-0 ${styles[p] ?? styles.agent}`}>
        {p}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-1.5 min-h-0 h-full">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-cyan-950/60 pb-1.5 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <BrainCircuit className="w-3 h-3 text-sky-400 flex-shrink-0" />
          <h2 className="text-[9px] font-bold tracking-widest uppercase font-mono text-sky-200">
            MEMORIA VPS
          </h2>
          {stats.total > 0 && (
            <span className="text-[7px] text-sky-600 font-mono flex-shrink-0">
              {stats.total} nodos
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setView(v => (v === 'graph' ? 'skills' : 'graph'))}
            className={`${btnCls} ${
              view === 'graph'
                ? 'bg-sky-500/10 text-sky-200 border-sky-500/40'
                : 'bg-transparent text-cyan-600 border-transparent hover:text-sky-300'
            }`}
            title="Alternar vista"
          >
            {view === 'graph' ? <Network className="w-2.5 h-2.5" /> : <Layers className="w-2.5 h-2.5" />}
            {view === 'graph' ? 'SKILLS' : 'GRAPH'}
          </button>
          <button
            type="button"
            onClick={loadData}
            disabled={loadingGraph || loadingSkills || authState !== 'ready'}
            className="p-1 hover:bg-sky-950/50 rounded text-sky-500 transition-colors disabled:opacity-40"
            title="Actualizar datos"
          >
            <RefreshCw className={`w-3 h-3 ${loadingGraph || loadingSkills ? 'animate-spin' : ''}`} />
          </button>
        </div>
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
            className={`${btnCls} justify-center bg-sky-500/10 text-sky-200 border-sky-500/40 hover:bg-sky-500/20 disabled:opacity-50`}
          >
            {loggingIn ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <KeyRound className="w-2.5 h-2.5" />}
            {loggingIn ? 'CONECTANDO...' : 'CONECTAR'}
          </button>
          {loginError && <p className="text-[8px] text-red-400 font-mono break-words">{loginError}</p>}
        </div>
      )}

      {authState === 'ready' && (
        <>
          {view === 'graph' && (
            <div className="flex flex-col gap-1.5 min-h-0">
              {/* Errores descartables */}
              {graphError && (
                <div className="flex items-center justify-between gap-1.5 border border-red-900/40 bg-red-950/10 rounded p-1.5 shrink-0">
                  <p className="text-[8px] text-red-400 font-mono break-words leading-snug">{graphError}</p>
                  <button
                    type="button"
                    onClick={() => setGraphError('')}
                    className="p-0.5 hover:bg-red-950/40 rounded text-red-400 flex-shrink-0"
                    title="Descartar"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}

              {loadingGraph && !starmap && (
                <div className="text-[9px] text-cyan-600/70 font-mono italic text-center py-4 flex items-center justify-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> Cargando star map del VPS...
                </div>
              )}

              {!loadingGraph && !starmap && !graphError && (
                <div className="text-[9px] text-cyan-600/60 font-mono italic text-center py-4">
                  Star map vacío o sin datos del harness.
                </div>
              )}

              {starmap && (
                <>
                  {/* Estadísticas + clusters */}
                  <div className="flex flex-wrap items-center gap-1 shrink-0">
                    <span className="px-1.5 py-0.5 text-[7.5px] rounded bg-sky-950/50 border border-sky-800/40 text-sky-300 font-mono">
                      {stats.total} NODOS
                    </span>
                    <span className="px-1.5 py-0.5 text-[7.5px] rounded bg-cyan-950/50 border border-cyan-800/40 text-cyan-300 font-mono">
                      {stats.skills} SKILLS
                    </span>
                    <span className="px-1.5 py-0.5 text-[7.5px] rounded bg-violet-950/50 border border-violet-800/40 text-violet-300 font-mono">
                      {stats.memory} MEMORIA
                    </span>
                    <span className="px-1.5 py-0.5 text-[7.5px] rounded bg-amber-950/50 border border-amber-800/40 text-amber-300 font-mono">
                      {edges.length} EDGES
                    </span>
                  </div>

                  {clusters.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 shrink-0">
                      {clusters.map((c, i) => (
                        <span
                          key={c.category}
                          className="px-1 py-px text-[7px] rounded font-mono border flex items-center gap-1"
                          style={{ borderColor: `${catColor(c.category, i)}55`, color: catColor(c.category, i), background: `${catColor(c.category, i)}14` }}
                          title={`Categoría ${c.category}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: catColor(c.category, i) }} />
                          {c.category} <span className="opacity-70">×{c.count}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Graph SVG inline (sin librerías) */}
                  {renderedNodes.length === 0 ? (
                    <div className="text-[9px] text-cyan-600/60 font-mono italic text-center py-4 border border-cyan-950/40 rounded">
                      Sin nodos en el star map.
                    </div>
                  ) : (
                    <div className="relative shrink-0">
                      <svg
                        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                        className="w-full h-auto bg-[#010912] border border-cyan-950/60 rounded"
                        role="img"
                        aria-label="Memory graph del harness"
                      >
                        {/* anillo guía */}
                        <circle
                          cx={SVG_W / 2} cy={SVG_H / 2}
                          r={Math.min(SVG_W, SVG_H) / 2 - 30}
                          fill="none" stroke="#0e3a52" strokeWidth="0.5" strokeDasharray="2 3" opacity="0.5"
                        />
                        {/* edges */}
                        {renderedEdges.map((e, i) => {
                          const s = positions.get(e.source);
                          const t = positions.get(e.target);
                          if (!s || !t) return null;
                          return (
                            <line
                              key={`e-${i}`}
                              x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                              stroke="#155e75" strokeWidth="0.6" opacity="0.45"
                            />
                          );
                        })}
                        {/* nodos */}
                        {renderedNodes.map((node, i) => {
                          const p = positions.get(node.id);
                          if (!p) return null;
                          const r = 4 + Math.min(node.useCount || 0, 8); // diámetro 8..24
                          const fill = node.kind === 'skill' ? '#22d3ee' : '#a78bfa';
                          const isPinned = !!node.pinned;
                          return (
                            <circle
                              key={node.id}
                              cx={p.x} cy={p.y} r={r}
                              fill={fill}
                              fillOpacity={isPinned ? 0.95 : 0.7}
                              stroke={isPinned ? '#fbbf24' : '#03111d'}
                              strokeWidth={isPinned ? 1.8 : 0.8}
                              style={isPinned ? { filter: 'drop-shadow(0 0 3px rgba(251,191,36,0.8))' } : undefined}
                              data-kind={node.kind}
                              data-category={node.category}
                              data-idx={i}
                            >
                              <title>
                                {`${node.label}\n${node.kind === 'skill' ? 'skill' : 'memoria'} · ${node.category}\nuso: ${node.useCount} · estado: ${node.state ?? '—'}${node.pinned ? '\n📌 pinned' : ''}`}
                              </title>
                            </circle>
                          );
                        })}
                      </svg>
                      {truncated && (
                        <div className="absolute top-1 right-1 px-1 py-px text-[7px] rounded bg-amber-950/60 border border-amber-800/40 text-amber-300 font-mono">
                          mostrando {renderedNodes.length}/{nodes.length} top por uso
                        </div>
                      )}
                    </div>
                  )}

                  {/* Leyenda */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 shrink-0 text-[7px] font-mono text-cyan-500">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#22d3ee]" /> skill</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#a78bfa]" /> memoria</span>
                    <span className="flex items-center gap-1"><Pin className="w-2 h-2 text-amber-400" /> pinned</span>
                    <span className="flex items-center gap-1 text-cyan-600">tamaño ∝ uso (hover para detalle)</span>
                  </div>

                  {/* Memory cards libres */}
                  {memoryCards.length > 0 && (
                    <div className="flex flex-col gap-1 min-h-0">
                      <div className="text-[8px] font-bold tracking-widest uppercase font-mono text-sky-300/80 border-b border-cyan-950/50 pb-0.5 shrink-0">
                        MEMORIA LIBRE ({memoryCards.length})
                      </div>
                      <div className="flex flex-col gap-1 overflow-y-auto custom-scrollbar pr-0.5 max-h-[110px]">
                        {visibleCards.map((card: StarmapMemoryCard, i: number) => (
                          <div key={`${card.title}-${i}`} className="bg-[#010912] border border-cyan-950/60 rounded p-1.5">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[8px] font-mono font-bold text-cyan-200 truncate">{card.title || 'Sin título'}</span>
                              <span className="text-[7px] text-cyan-700 font-mono flex-shrink-0">
                                {card.source === 'memory' ? 'memoria' : 'perfil'} · {fmtTs(card.timestamp)}
                              </span>
                            </div>
                            {card.body && (
                              <p className="text-[7.5px] text-cyan-500/90 font-mono leading-snug mt-0.5 break-words">
                                {truncate(card.body, 160)}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                      {memoryCards.length > MAX_CARDS_VISIBLE && (
                        <button
                          type="button"
                          onClick={() => setShowAllCards(v => !v)}
                          className="self-start text-[7.5px] font-mono uppercase tracking-wider text-sky-400 hover:text-sky-200 transition"
                        >
                          {showAllCards ? '▲ plegar' : `▼ ver ${memoryCards.length - MAX_CARDS_VISIBLE} más`}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {view === 'skills' && (
            <div className="flex flex-col gap-1.5 min-h-0">
              {skillsError && (
                <div className="flex items-center justify-between gap-1.5 border border-red-900/40 bg-red-950/10 rounded p-1.5 shrink-0">
                  <p className="text-[8px] text-red-400 font-mono break-words leading-snug">{skillsError}</p>
                  <button
                    type="button"
                    onClick={() => setSkillsError('')}
                    className="p-0.5 hover:bg-red-950/40 rounded text-red-400 flex-shrink-0"
                    title="Descartar"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}

              {/* Búsqueda local */}
              <div className="relative shrink-0">
                <Search className="w-3 h-3 absolute left-1.5 top-1/2 -translate-y-1/2 text-cyan-700 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar skills..."
                  className="w-full bg-[#010912] border border-cyan-950 rounded pl-6 pr-1.5 py-1 text-[9px] font-mono text-cyan-100 placeholder-cyan-800 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              {loadingSkills && skills.length === 0 && (
                <div className="text-[9px] text-cyan-600/70 font-mono italic text-center py-4 flex items-center justify-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> Cargando skills del VPS...
                </div>
              )}

              {!loadingSkills && skills.length === 0 && !skillsError && (
                <div className="text-[9px] text-cyan-600/60 font-mono italic text-center py-4">
                  Sin skills disponibles.
                </div>
              )}

              {/* Skills agrupadas por categoría */}
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-0.5 min-h-0 space-y-1.5">
                {skillsByCategory.map(([cat, items]) => (
                  <div key={cat} className="flex flex-col gap-0.5">
                    <div className="text-[7.5px] font-bold tracking-widest uppercase font-mono text-sky-400/90 flex items-center gap-1 sticky top-0 bg-[#020914] py-0.5">
                      <span className="text-cyan-700">▸</span> {cat}
                      <span className="text-cyan-700 font-normal">({items.length})</span>
                    </div>
                    {items.map(s => (
                      <div key={s.name} className="bg-[#010912] border border-cyan-950/60 rounded px-1.5 py-1 flex items-start justify-between gap-1.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-[8.5px] font-mono font-bold text-cyan-200 truncate">{s.name}</span>
                            {provenanceBadge(s.provenance)}
                          </div>
                          {s.description && (
                            <p className="text-[7.5px] text-cyan-500/90 font-mono leading-snug mt-0.5 break-words">
                              {truncate(s.description, 110)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {typeof s.usage === 'number' && (
                            <span className="px-1 py-px text-[7px] rounded bg-cyan-950/50 border border-cyan-900/50 text-cyan-500 font-mono" title="Uso total">
                              {s.usage}u
                            </span>
                          )}
                          <span
                            className={`px-1 py-px text-[7px] rounded border font-mono font-bold flex-shrink-0 ${
                              s.enabled
                                ? 'bg-emerald-950/50 border-emerald-800/50 text-emerald-300'
                                : 'bg-red-950/40 border-red-900/50 text-red-400'
                            }`}
                          >
                            {s.enabled ? 'ON' : 'OFF'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                {!loadingSkills && skills.length > 0 && filteredSkills.length === 0 && (
                  <div className="text-[9px] text-cyan-600/60 font-mono italic text-center py-3">
                    Sin resultados para la búsqueda.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
