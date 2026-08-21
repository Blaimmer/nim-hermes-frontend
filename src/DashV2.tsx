import React, { useState, useEffect } from 'react';
import { Cpu, Play, Pause, Clock, RotateCw, FileText, TrendingUp, Users, Activity, Zap, AlertTriangle, CheckCircle2, XCircle, BarChart3, Search, FolderOpen } from 'lucide-react';

// ═══════════════════════════════════════════
// AGENTES PANEL
// ═══════════════════════════════════════════
export function AgentesPanel() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/hermes/agents')
      .then(r => r.json())
      .then(d => { setAgents(d.agents || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-cyan-500 text-center py-6 animate-pulse">Cargando agentes...</div>;

  const statusColors: Record<string, string> = {
    online: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
    idle: 'bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.4)]',
    offline: 'bg-gray-600',
    error: 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]'
  };
  const statusLabels: Record<string, string> = { online: 'ACTIVO', idle: 'ESPERA', offline: 'OFFLINE', error: 'ERROR' };

  return (
    <div className="space-y-2">
      {agents.map((agent) => (
        <div key={agent.id} className="border border-cyan-950/40 bg-[#010912] p-2.5 rounded hover:border-cyan-800/50 transition-colors">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[agent.status] || statusColors.offline}`} />
              <span className="text-cyan-200 font-bold text-[10px] font-mono">{agent.name}</span>
              <span className="text-cyan-600 text-[8px] font-mono">{agent.role}</span>
            </div>
            <span className={`px-1.5 py-0.5 rounded text-[7px] font-bold uppercase font-mono ${
              agent.status === 'online' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
              agent.status === 'idle' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' :
              'bg-gray-500/10 text-gray-400 border border-gray-500/30'
            }`}>
              {statusLabels[agent.status] || 'UNKNOWN'}
            </span>
          </div>
          <p className="text-cyan-500/70 text-[8px] leading-relaxed mb-1.5 font-mono">{agent.description}</p>
          <div className="flex gap-4 text-[8px] font-mono">
            <span className="text-cyan-600">✓ {agent.metrics?.tasksCompleted || 0} tareas</span>
            <span className="text-emerald-600">{agent.metrics?.successRate || 0}% éxito</span>
            <span className="text-cyan-600">⏱ {agent.metrics?.avgTime || '—'}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════
// TAREAS PANEL
// ═══════════════════════════════════════════
export function TareasPanel() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/hermes/tasks')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-cyan-500 text-center py-6 animate-pulse">Cargando tareas...</div>;
  if (!data) return null;

  const statusColor = (s: string) => s === 'completed' ? 'text-emerald-400' : s === 'in_progress' ? 'text-amber-400' : 'text-gray-500';
  const statusIcon = (s: string) => s === 'completed' ? '✓' : s === 'in_progress' ? '⟳' : '○';

  return (
    <div className="space-y-3">
      {/* Tareas */}
      <div>
        <div className="text-cyan-400 font-bold text-[9px] uppercase tracking-wider mb-2 font-mono flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Tareas ({data.tasks?.length || 0})
        </div>
        {data.tasks?.map((t: any) => (
          <div key={t.id} className="border border-cyan-950/40 bg-[#010912] p-2 rounded mb-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className={`${statusColor(t.status)} font-bold text-[8px]`}>{statusIcon(t.status)}</span>
                <span className="text-cyan-200 text-[9px] font-mono">{t.title}</span>
              </div>
              <span className={`px-1.5 py-0.5 rounded text-[7px] font-bold uppercase border ${
                t.priority === 'high' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                t.priority === 'medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                'bg-gray-500/10 text-gray-400 border-gray-500/30'
              }`}>{t.priority}</span>
            </div>
            <div className="text-cyan-600 text-[7px] font-mono mt-0.5">{t.description}</div>
          </div>
        ))}
      </div>

      {/* Procesos */}
      <div>
        <div className="text-cyan-400 font-bold text-[9px] uppercase tracking-wider mb-2 font-mono flex items-center gap-1">
          <Activity className="w-3 h-3" /> Procesos activos
        </div>
        {data.processes?.slice(0, 8).map((p: any, i: number) => (
          <div key={i} className="flex items-center justify-between text-[8px] font-mono py-0.5 border-b border-cyan-950/20">
            <span className="text-cyan-500/80 truncate max-w-[180px]">{p.command}</span>
            <span className="text-cyan-600 flex-shrink-0 ml-2">CPU:{p.cpu}% MEM:{p.mem}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// CLIENTES PANEL
// ═══════════════════════════════════════════
export function ClientesPanel() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/hermes/clients')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-cyan-500 text-center py-6 animate-pulse">Cargando clientes...</div>;
  if (!data) return null;

  const statusStyle = (s: string) => {
    const map: Record<string, string> = {
      lead: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
      contacted: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
      negotiation: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      closed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      lost: 'bg-red-500/10 text-red-400 border-red-500/30'
    };
    return map[s] || 'bg-gray-500/10 text-gray-400 border-gray-500/30';
  };

  return (
    <div className="space-y-2">
      {/* Stats */}
      <div className="grid grid-cols-5 gap-1 mb-2">
        {[
          { label: 'Total', value: data.stats?.total, color: 'text-cyan-400' },
          { label: 'Leads', value: data.stats?.leads, color: 'text-purple-400' },
          { label: 'Contact.', value: data.stats?.contacted, color: 'text-cyan-400' },
          { label: 'Negoc.', value: data.stats?.negotiation, color: 'text-amber-400' },
          { label: 'Cerrados', value: data.stats?.closed, color: 'text-emerald-400' }
        ].map((s, i) => (
          <div key={i} className="text-center border border-cyan-950/30 bg-[#010912] p-1.5 rounded">
            <div className={`text-sm font-bold ${s.color}`}>{s.value}</div>
            <div className="text-cyan-600 text-[7px] font-mono">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Clientes */}
      {data.clients?.map((c: any) => (
        <div key={c.id} className="border border-cyan-950/40 bg-[#010912] p-2 rounded">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-cyan-200 text-[10px] font-bold font-mono">{c.name}</span>
              <span className="text-cyan-600 text-[8px] ml-2 font-mono">{c.company}</span>
            </div>
            <span className={`px-1.5 py-0.5 rounded text-[7px] font-bold uppercase border ${statusStyle(c.status)}`}>
              {c.status}
            </span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-cyan-600 text-[7px] font-mono">{c.notes?.substring(0, 60)}</span>
            <span className="text-cyan-500/70 text-[7px] font-mono">💎 {c.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════
// CRON PANEL
// ═══════════════════════════════════════════
export function CronPanel() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/hermes/cron-jobs')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-cyan-500 text-center py-6 animate-pulse">Cargando cron jobs...</div>;
  if (!data) return null;

  return (
    <div className="space-y-2">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-1 mb-2">
        {[
          { label: 'Total', value: data.stats?.total, color: 'text-cyan-400' },
          { label: 'Activos', value: data.stats?.active, color: 'text-emerald-400' },
          { label: 'Pausa', value: data.stats?.paused, color: 'text-amber-400' },
          { label: 'Error', value: data.stats?.error, color: 'text-red-400' }
        ].map((s, i) => (
          <div key={i} className="text-center border border-cyan-950/30 bg-[#010912] p-1.5 rounded">
            <div className={`text-sm font-bold ${s.color}`}>{s.value}</div>
            <div className="text-cyan-600 text-[7px] font-mono">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Jobs */}
      {data.cronJobs?.map((job: any) => (
        <div key={job.id} className="border border-cyan-950/40 bg-[#010912] p-2.5 rounded">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-cyan-400" />
              <span className="text-cyan-200 font-bold text-[10px] font-mono">{job.name}</span>
            </div>
            <span className={`px-1.5 py-0.5 rounded text-[7px] font-bold uppercase border ${
              job.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
              job.status === 'paused' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
              'bg-red-500/10 text-red-400 border-red-500/30'
            }`}>
              {job.status}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[8px] font-mono">
            <div><span className="text-cyan-600">Schedule:</span> <span className="text-cyan-300">{job.schedule}</span></div>
            <div><span className="text-cyan-600">Próx:</span> <span className="text-cyan-300">{job.nextRun}</span></div>
            <div><span className="text-cyan-600">Último:</span> <span className="text-cyan-300">{job.lastRun}</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════
// DOCUMENTOS PANEL
// ═══════════════════════════════════════════
export function DocumentosPanel() {
  const [files, setFiles] = useState<any[]>([]);
  const [content, setContent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dir, setDir] = useState('/home/clawd');

  useEffect(() => {
    loadDir(dir);
  }, [dir]);

  const loadDir = (directory: string) => {
    setLoading(true);
    setContent(null);
    fetch('/api/hermes/documents/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory })
    })
      .then(r => r.json())
      .then(d => { setFiles(d.files || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  const openFile = (path: string) => {
    setContent({ loading: true });
    fetch('/api/hermes/documents/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    })
      .then(r => r.json())
      .then(d => setContent(d))
      .catch(e => setContent({ error: e.message }));
  };

  const quickDirs = [
    { label: '🏠 Home', path: '/home/clawd' },
    { label: '📋 Skills', path: '/home/clawd/.hermes/skills' },
    { label: '🤖 Dashboard', path: '/home/clawd/nim-hermes-frontend' },
    { label: '🧠 Obsidian', path: '/home/clawd/obsidian-hermes' }
  ];

  return (
    <div className="space-y-2">
      {/* Quick nav */}
      <div className="flex gap-1 flex-wrap">
        {quickDirs.map((qd, i) => (
          <button key={i} onClick={() => setDir(qd.path)} 
            className={`px-2 py-1 text-[8px] font-mono rounded border transition ${
              dir === qd.path ? 'bg-cyan-500/10 text-cyan-200 border-cyan-500/50' : 'bg-transparent text-cyan-600 border-cyan-950/40 hover:text-cyan-300'
            }`}>
            {qd.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-cyan-500 text-center py-4 animate-pulse text-xs">Cargando...</div>}

      {/* File list */}
      {!content && !loading && (
        <div className="space-y-0.5 max-h-[180px] overflow-y-auto">
          {files.map((f: any, i: number) => (
            <div key={i} onClick={() => openFile(f.path)}
              className="flex items-center justify-between p-1.5 border border-cyan-950/30 bg-[#010912] rounded cursor-pointer hover:border-cyan-700/50 transition-colors">
              <div className="flex items-center gap-1.5 min-w-0">
                <FileText className="w-3 h-3 text-cyan-500 flex-shrink-0" />
                <span className="text-cyan-200 text-[9px] font-mono truncate">{f.name}</span>
              </div>
              <span className="text-cyan-600 text-[7px] font-mono flex-shrink-0 ml-2">{f.sizeFormatted}</span>
            </div>
          ))}
        </div>
      )}

      {/* Document content */}
      {content?.loading && <div className="text-cyan-500 text-center py-6 animate-pulse text-xs">Abriendo documento...</div>}
      {content?.error && <div className="text-red-400 text-xs p-3 border border-red-500/30 rounded bg-red-500/10">{content.error}</div>}
      {content?.content && (
        <div>
          <div className="flex items-center justify-between mb-1 pb-1 border-b border-cyan-950/40">
            <span className="text-cyan-400 font-bold text-[9px] font-mono">{content.path?.split('/').pop()}</span>
            <span className="text-cyan-600 text-[7px]">{content.sizeFormatted} · {content.totalLines} líneas · {content.type}</span>
          </div>
          <pre className="text-[8px] text-cyan-200 font-mono bg-[#010912] p-2 rounded border border-cyan-950/40 max-h-[200px] overflow-y-auto whitespace-pre-wrap leading-relaxed">
            {content.content}
          </pre>
          {content.truncated && <div className="text-amber-500 text-[7px] mt-1 text-center">⚠️ Contenido truncado (50K chars)</div>}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// GRÁFICAS PANEL
// ═══════════════════════════════════════════
export function GraficasPanel() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/hermes/metrics/history')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-cyan-500 text-center py-6 animate-pulse">Cargando métricas...</div>;
  if (!data) return null;

  const maxTokens = Math.max(...(data.points?.map((p: any) => p.tokens) || [1]));
  const maxSessions = Math.max(...(data.points?.map((p: any) => p.sessions) || [1]));
  const maxToolCalls = Math.max(...(data.points?.map((p: any) => p.toolCalls) || [1]));

  return (
    <div className="space-y-3">
      {/* System Info */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'CPU', value: `${data.currentStats?.cpuCount || '?'} núcleos`, sub: data.currentStats?.cpuModel?.substring(0, 20) },
          { label: 'RAM', value: data.currentStats?.usedMemory, sub: `de ${data.currentStats?.totalMemory}` },
          { label: 'Uptime', value: `${Math.floor((data.currentStats?.uptime || 0) / 3600)}h`, sub: data.currentStats?.hostname },
          { label: 'Sesiones', value: data.totalSessions, sub: 'estimadas' }
        ].map((item, i) => (
          <div key={i} className="border border-cyan-950/40 bg-[#010912] p-2 rounded text-center">
            <div className="text-cyan-400 font-bold text-xs">{item.value}</div>
            <div className="text-cyan-600 text-[7px] font-mono uppercase">{item.label}</div>
            {item.sub && <div className="text-cyan-500/60 text-[6px] truncate">{item.sub}</div>}
          </div>
        ))}
      </div>

      {/* Mini bar charts */}
      <div>
        <div className="text-cyan-400 font-bold text-[9px] uppercase tracking-wider mb-1.5 font-mono flex items-center gap-1">
          <BarChart3 className="w-3 h-3" /> Sesiones (24h)
        </div>
        <div className="flex items-end gap-[2px] h-10">
          {data.points?.map((p: any, i: number) => (
            <div key={i} className="flex-1 relative group" title={`${p.timestamp}: ${p.sessions} sesiones`}>
              <div className="bg-cyan-500/40 rounded-t-sm transition-all hover:bg-cyan-400/60"
                style={{ height: `${(p.sessions / maxSessions) * 100}%`, minHeight: '2px' }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[6px] text-cyan-700 font-mono mt-0.5">
          <span>24h atrás</span><span>Ahora</span>
        </div>
      </div>

      <div>
        <div className="text-cyan-400 font-bold text-[9px] uppercase tracking-wider mb-1.5 font-mono flex items-center gap-1">
          <Zap className="w-3 h-3" /> Tool Calls (24h)
        </div>
        <div className="flex items-end gap-[2px] h-10">
          {data.points?.map((p: any, i: number) => (
            <div key={i} className="flex-1 relative group" title={`${p.timestamp}: ${p.toolCalls} calls`}>
              <div className="bg-emerald-500/40 rounded-t-sm transition-all hover:bg-emerald-400/60"
                style={{ height: `${(p.toolCalls / maxToolCalls) * 100}%`, minHeight: '2px' }} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-cyan-400 font-bold text-[9px] uppercase tracking-wider mb-1.5 font-mono flex items-center gap-1">
          <TrendingUp className="w-3 h-3" /> Tokens (24h)
        </div>
        <div className="flex items-end gap-[2px] h-10">
          {data.points?.map((p: any, i: number) => (
            <div key={i} className="flex-1 relative group" title={`${p.timestamp}: ${(p.tokens/1000).toFixed(1)}K tokens`}>
              <div className="bg-purple-500/40 rounded-t-sm transition-all hover:bg-purple-400/60"
                style={{ height: `${(p.tokens / maxTokens) * 100}%`, minHeight: '2px' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Load */}
      <div className="grid grid-cols-3 gap-2 text-[8px] font-mono">
        <div className="text-center"><span className="text-cyan-600">Load 1m:</span> <span className="text-cyan-300">{data.currentStats?.loadAvg?.[0]}</span></div>
        <div className="text-center"><span className="text-cyan-600">Load 5m:</span> <span className="text-cyan-300">{data.currentStats?.loadAvg?.[1]}</span></div>
        <div className="text-center"><span className="text-cyan-600">Load 15m:</span> <span className="text-cyan-300">{data.currentStats?.loadAvg?.[2]}</span></div>
      </div>
    </div>
  );
}
