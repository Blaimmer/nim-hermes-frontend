import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { wssClient } from './lib/wss_client';
import { 
  Mic, 
  MicOff, 
  Cpu, 
  Activity, 
  Globe, 
  Server, 
  Terminal, 
  Volume2, 
  VolumeX, 
  Trash2, 
  Send, 
  Layers, 
  Settings, 
  CheckCircle2, 
  XCircle, 
  RotateCw,
  Info,
  Clock,
  Play,
  Database,
  Grid,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  ShieldAlert,
  Menu,
  ChevronRight,
  MessageSquare,
  HelpCircle,
  Hash,
  Plus,
  Maximize2,
  History,
  FolderOpen,
  GitBranch,
  X
} from 'lucide-react';
import { SystemStatus, LogEntry, ChatMessage, Skill, Stats, HermesModel } from './types';
import { AgentesPanel, TareasPanel, ClientesPanel, CronPanel, DocumentosPanel, GraficasPanel } from './DashV2';
import { SessionList, sessionMessagesToChat } from './components/sessions/SessionList';
import { FileBrowser } from './components/files/FileBrowser';
import { GitReviewPane } from './components/git/GitReviewPane';
import type { SessionInfo, SessionMessage } from './lib/hermes/types';

// Web Speech API for browser vocal compatibility
const SpeechRecognitionAPI = 
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export default function App() {
  // General State
  const [activeModel, setActiveModel] = useState<string>('deepseek-v4-pro');
  const [activeModelName, setActiveModelName] = useState<string>('DeepSeek V4 Pro');
  const [modelsList, setModelsList] = useState<HermesModel[]>([]);
  const [quickModels, setQuickModels] = useState<string[]>(['deepseek-v4-pro', 'gemini-2.5-flash', 'claude-sonnet-4']);
  const [showModelSettings, setShowModelSettings] = useState<boolean>(false);
  const [tempQuickSelection, setTempQuickSelection] = useState<string[]>(['deepseek-v4-pro', 'gemini-2.5-flash', 'claude-sonnet-4']);
  const [status, setStatus] = useState<SystemStatus>('STANDBY');

  // Custom model form state
  const [customModelName, setCustomModelName] = useState('');
  const [customModelId, setCustomModelId] = useState('');
  const [customModelProvider, setCustomModelProvider] = useState('openrouter');
  const [customModelApiKey, setCustomModelApiKey] = useState('');
  const [customModelTestResult, setCustomModelTestResult] = useState<{ok: boolean; message: string} | null>(null);
  const [customModelAdding, setCustomModelAdding] = useState(false);
  const [customModelTesting, setCustomModelTesting] = useState(false);
  const [customModelDeleting, setCustomModelDeleting] = useState<string | null>(null);

  // Inline API key configuration for models without keys
  const [configuringModelId, setConfiguringModelId] = useState<string | null>(null);
  const [configuringApiKey, setConfiguringApiKey] = useState('');
  const [configuringTestResult, setConfiguringTestResult] = useState<{ok: boolean; message: string} | null>(null);
  const [configuringTesting, setConfiguringTesting] = useState(false);
  const [configuringSaving, setConfiguringSaving] = useState(false);

  // Server-side audited system information state
  const [serverSysInfo, setServerSysInfo] = useState<{
    platform: string;
    arch: string;
    cpus: number;
    totalMemory: string;
    freeMemory: string;
    uptime: number;
    nodeVersion: string;
  } | null>(null);

  // Client-side environment and hardware specs detector
  const detectSystemInfo = () => {
    const ua = window.navigator.userAgent;
    let os = 'Dispositivo Desconocido';
    let browser = 'Navegador Genérico';

    // OS detection
    if (/Macintosh|Mac OS X/.test(ua)) os = 'macOS';
    else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS (iPhone/iPad)';
    else if (/Windows/.test(ua)) os = 'Windows';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/Linux/.test(ua)) os = 'Linux';

    // Browser detection
    if (/Chrome|CriOS/.test(ua) && !/Edge|Edg|OPR|Opera/.test(ua)) browser = 'Google Chrome';
    else if (/Safari/.test(ua) && !/Chrome|CriOS/.test(ua)) browser = 'Apple Safari';
    else if (/Firefox|FxiOS/.test(ua)) browser = 'Mozilla Firefox';
    else if (/Edge|Edg/.test(ua)) browser = 'Microsoft Edge';
    else if (/OPR|Opera/.test(ua)) browser = 'Opera';

    return {
      os,
      browser,
      cores: window.navigator.hardwareConcurrency || 8,
      memory: (window.navigator as any).deviceMemory || 16,
      userAgent: ua,
    };
  };
  const [inputVal, setInputVal] = useState<string>('');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isWakeWordMode, setIsWakeWordMode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'thought_engine' | 'chat_history' | 'agentic_core' | 'agentes' | 'tareas' | 'clientes' | 'cron' | 'documentos' | 'graficas'>('chat_history');

  // F2.2 — Sesiones VPS (gateway :9119): panel de lista + sesión reanudada
  const [showSessions, setShowSessions] = useState<boolean>(false);
  const [activeSession, setActiveSession] = useState<{ id: string; title: string } | null>(null);

  // F2.3 — Explorador de archivos local (PC): panel toggle en el aside
  const [showFiles, setShowFiles] = useState<boolean>(false);

  // F2.4 — Git review (repo local): panel toggle en el aside
  const [showGit, setShowGit] = useState<boolean>(false);

  // Agent Core States (Working Memory, Knowledge Graph, Auto-Skills)
  const [coreStatus, setCoreStatus] = useState<{
    workingMemory: { humanBlock: string; personaBlock: string; taskBlock: string; lastUpdated: string };
    ltmSize: number;
    graphNodesCount: number;
    graphEdgesCount: number;
    graph: { nodes: any[]; edges: any[] };
    skills: any[];
  } | null>(null);

  const [wmHuman, setWmHuman] = useState('');
  const [wmPersona, setWmPersona] = useState('');
  const [wmTask, setWmTask] = useState('');
  const [wmUpdating, setWmUpdating] = useState(false);

  // MATRICE: Soul docs editor + MCP status
  const [soulHuman, setSoulHuman] = useState('');
  const [soulPersona, setSoulPersona] = useState('');
  const [soulTask, setSoulTask] = useState('');
  const [soulSaving, setSoulSaving] = useState<string | null>(null);
  const [mcpServers, setMcpServers] = useState<any[]>([]);
  const [expandedBlock, setExpandedBlock] = useState<string | null>(null); // 'human' | 'persona' | 'task' | null

  const [evolveSkillId, setEvolveSkillId] = useState('data_compiler');
  const [evolveSkillName, setEvolveSkillName] = useState('Compilador de Datos');
  const [evolveSkillDesc, setEvolveSkillDesc] = useState('Análisis sintáctico y estructuración de archivos.');
  const [evolveInstructions, setEvolveInstructions] = useState('');
  const [evolveLoading, setEvolveLoading] = useState(false);

  const [sleeptimeLoading, setSleeptimeLoading] = useState(false);
  const [consoleCommand, setConsoleCommand] = useState('npm run lint');
  const [consoleResult, setConsoleResult] = useState<{ success?: boolean; stdout?: string; stderr?: string } | null>(null);
  const [consoleLoading, setConsoleLoading] = useState(false);

  // Integrated Cognitive Onboarding, Telemetry and MCP states
  const [onboardingData, setOnboardingData] = useState<{
    initialized: boolean;
    profile: any;
    nextFormState: { question: string; fieldToUpdate: string; options?: string[]; voiceText?: string } | null;
  } | null>(null);
  const [onboardingInput, setOnboardingInput] = useState('');
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  
  // Voice-First reactive energy orb and TTS settings
  const [orbState, setOrbState] = useState<'idle' | 'speaking' | 'thinking' | 'listening'>('idle');
  const [ttsMuted, setTtsMuted] = useState(false);
  const [systemStatusMessage, setSystemStatusMessage] = useState('');
  const lastSpokenRef = useRef('');
  const micErrorRef = useRef(false); // Track mic errors across async handlers

  // Telemetry Search simulation states
  const [telemetryQuery, setTelemetryQuery] = useState('especificacion mcp 2026');
  const [telemetryScope, setTelemetryScope] = useState('programming_code_markdown');
  const [telemetryResult, setTelemetryResult] = useState<any>(null);
  const [telemetryLoading, setTelemetryLoading] = useState(false);

  // MCP dynamic management states
  const [mcpData, setMcpData] = useState<any>(null);
  const [mcpKeyword, setMcpKeyword] = useState('notion');
  const [mcpInstallLoading, setMcpInstallLoading] = useState(false);
  const [mcpInstallOutput, setMcpInstallOutput] = useState<any>(null);
  const [showMcpDetail, setShowMcpDetail] = useState(false);

  const fetchOnboardingAndMCP = async () => {
    try {
      const obRes = await fetch('/api/agent-core/onboarding');
      if (obRes.ok) {
        const data = await obRes.json();
        setOnboardingData(data);
      }
      const mcpRes = await fetch('/api/agent-core/mcp');
      if (mcpRes.ok) {
        const data = await mcpRes.json();
        setMcpData(data);
      }
    } catch (err) {
      console.error('Error loading onboarding or MCP configs:', err);
    }
  };

  useEffect(() => {
    (window as any).playCloudTTS = (textToSpeak: string) => {
      // Revertido a síntesis local debido al bloqueo de WebView2 con APIs de nube sin key
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = 'es-ES';
      // Intentar encontrar voces de Microsoft o Sabina
      const voices = window.speechSynthesis.getVoices();
      const esVoices = voices.filter(v => v.lang.startsWith('es'));
      const bestVoice = esVoices.find(v => v.name.includes('Sabina') || v.name.includes('Microsoft') || v.name.includes('Natural')) || esVoices[0];
      if (bestVoice) {
        utterance.voice = bestVoice;
      }
      utterance.onend = () => {
        // Nada, el estado idle lo maneja Hermes por WSS
      };
      utterance.onerror = (e) => {
        console.error("Error en TTS Local:", e);
      };
      window.speechSynthesis.speak(utterance);
    };

    // WSS Connection
    wssClient.connect("NimMasterKey2024!@#Secure").catch(err => {
      console.error("Error conectando a Hermes:", err);
    });

    // WSS Event Hooks
    wssClient.onLog = (type: string, message: string) => {
      addLog(type as any, message);
    };

    // Streaming palabra por palabra: message_start/delta/complete
    let streamMsgId: string | null = null;
    let streamAccum = "";
    wssClient.onStreamStart = () => {
      streamAccum = "";
      streamMsgId = `msg-${Date.now()}`;
      setChatMessages(prev => [...prev, {
        id: streamMsgId!,
        sender: 'nim',
        text: '▍',
        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        modelUsed: 'HERMES-VPS'
      }]);
      setOrbState('thinking');
    };
    wssClient.onStreamDelta = (text: string) => {
      streamAccum += text;
      if (!streamMsgId) return;
      setChatMessages(prev => prev.map(m =>
        m.id === streamMsgId ? { ...m, text: streamAccum + '▍' } : m
      ));
    };
    wssClient.onStreamComplete = (text: string) => {
      const finalText = text || streamAccum;
      if (!streamMsgId) {
        // Sin streaming: fallback a bot_message-style append
        setChatMessages(prev => [...prev, {
          id: `msg-${Date.now()}`,
          sender: 'nim',
          text: finalText,
          timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
          modelUsed: 'HERMES-VPS'
        }]);
      } else {
        setChatMessages(prev => prev.map(m =>
          m.id === streamMsgId ? { ...m, text: finalText } : m
        ));
      }
      streamMsgId = null;
      streamAccum = "";
      setOrbState('idle');

      // Hablar la respuesta si no está silenciado (CLOUD TTS)
      if (!ttsMuted) {
        const clean = finalText.replace(/```[\s\S]*?```/g, "").replace(/[*_~`#\[\]{}]/g, "").trim();
        if (!clean) return;
        if ((window as any).playCloudTTS) {
          (window as any).playCloudTTS(clean);
        } else {
          const u = new SpeechSynthesisUtterance(clean);
          u.lang = 'es-ES';
          u.rate = 1.05;
          u.pitch = 0.95;
          window.speechSynthesis.speak(u);
        }
      }
    };

    wssClient.onBotMessage = (text: string, state: string) => {
      setChatMessages(prev => [...prev, {
        id: `msg-${Date.now()}`,
        sender: 'nim',
        text: text,
        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        modelUsed: 'HERMES-VPS'
      }]);
      setOrbState(state as any);
      
      // Hablar la respuesta si no está silenciado (CLOUD TTS)
      if (!ttsMuted) {
        const clean = text.replace(/```[\s\S]*?```/g, "").replace(/[*_~`#[\]{}]/g, "").trim();
        if (!clean) return;
        
        // Función global en la ventana o importada, pero por simplicidad la definimos aquí
        if ((window as any).playCloudTTS) {
          (window as any).playCloudTTS(clean);
        } else {
          // Si no está definida, fallback
          const u = new SpeechSynthesisUtterance(clean);
          u.lang = 'es-ES';
          u.rate = 1.05;
          u.pitch = 0.95;
          window.speechSynthesis.speak(u);
        }
      }
    };

    wssClient.onSkillsUpdate = (newSkills: any[]) => {
      setSkills(prev => newSkills.map(s => {
        const existing = prev.find(p => p.id === s.id);
        return {
          id: s.id,
          name: s.name,
          status: s.status || 'Activa',
          description: s.description,
          environment: s.environment,
          isEnabled: existing ? existing.isEnabled : true,
          callCount: existing ? existing.callCount : 0
        };
      }));
    };
    wssClient.onModelsList = (newModels: any[]) => {
      setModelsList(newModels);
      const active = newModels.find(m => m.active);
      if (active) setActiveModelId(active.id);
    };

    wssClient.onSoulData = (soul: any) => {
      setSoulHuman(soul.humanBlock || '');
      setSoulPersona(soul.personaBlock || '');
      setSoulTask(soul.taskBlock || '');
    };
  }, []);

  // Cargar datos para MATRICE (Soul docs + MCP status)
  useEffect(() => {
    fetch('/api/hermes/soul-docs').then(r => r.json()).then(d => {
      setSoulHuman(d.humanBlock || '');
      setSoulPersona(d.personaBlock || '');
      setSoulTask(d.taskBlock || '');
    }).catch(() => {});
    fetch('/api/hermes/integrations').then(r => r.json()).then(d => {
      setMcpServers(d.integrations || []);
    }).catch(() => {});
  }, []);

  // Speak next onboarding question aloud whenever it changes or loads
  useEffect(() => {
    if (onboardingData?.nextFormState) {
      const text = onboardingData.nextFormState.voiceText || onboardingData.nextFormState.question;
      speakText(text);
    }
  }, [onboardingData?.nextFormState?.question, ttsMuted]);

  // Active Agentic tool execution state (ReAct feedback loop)
  const [activeToolCall, setActiveToolCall] = useState<{
    toolName: string;
    parameters: any;
    status: 'idle' | 'executing' | 'success' | 'error';
    observation?: string;
  } | null>(null);

  // Quotas & Rate Limits State
  const [quotaData, setQuotaData] = useState<any>(null);
  const [showQuotasModal, setShowQuotasModal] = useState<boolean>(false);
  const [hasKeys, setHasKeys] = useState<Record<string, boolean>>({});
  const previousQuotaStatus = useRef<any>(null);

  // Stats State
  const [stats, setStats] = useState<Stats>({
    latency: 24,
    cpu: 18,
    memory: '1.2 / 16 GB',
    networkStatus: 'NOMINAL',
  });

  // Time & Date State
  const [currentTime, setCurrentTime] = useState<string>('00:00:00');
  const [currentDate, setCurrentDate] = useState<string>('');

  // Initial Logs
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'system-init',
      timestamp: new Date().toLocaleTimeString(),
      type: 'system',
      message: 'NÚCLEO ACCESIÓN NIM INICIALIZADO.',
    },
    {
      id: 'system-ready',
      timestamp: new Date().toLocaleTimeString(),
      type: 'system',
      message: 'Protocolos cognitivos de NIM en línea. Reconocimiento de voz y audio listos.',
    },
  ]);

  // Conversational History State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('nim_chat_history');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing chat history:', e);
      }
    }
    return [
      {
        id: 'welcome',
        sender: 'nim',
        text: 'Buenas tardes, Señor. He completado el reescalado de mis matrices de pensamiento. El núcleo de NIM está completamente activo y enlazado con su receptor de audio. ¿Cuál es su instrucción hoy?',
        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        modelUsed: 'SYSTEM'
      }
    ];
  });

  // Persist chat history across F5 reloads
  useEffect(() => {
    localStorage.setItem('nim_chat_history', JSON.stringify(chatMessages));
  }, [chatMessages]);


  // Connected Skills State — cargadas dinámicamente desde Hermes
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);

  // Cargar skills reales desde Hermes
  useEffect(() => {
    fetch('/api/hermes/skills')
      .then(r => r.json())
      .then(d => {
        const mapped: Skill[] = (d.skills || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          status: s.enabled ? 'Activa' : 'Inactiva',
          isEnabled: s.enabled,
          description: s.description,
          callCount: 0,
        }));
        setSkills(mapped);
        setSkillsLoading(false);
      })
      .catch(() => setSkillsLoading(false));
  }, []);

  const [selectedSkillId, setSelectedSkillId] = useState<string>('web_search');

  // Interactive Skill Playground States
  const [playSearchQuery, setPlaySearchQuery] = useState('Últimas noticias de tecnología CNN y Reuters');
  const [playSearchLoading, setPlaySearchLoading] = useState(false);
  const [webSearchResults, setWebSearchResults] = useState<any>(null);
  
  // Domotica IoT state
  const [iotLights, setIotLights] = useState(true);
  const [iotShield, setIotShield] = useState(85);
  const [iotCoreFan, setIotCoreFan] = useState(false);

  // Vision state
  const [camFilter, setCamFilter] = useState<'THERMAL' | 'INFRARED' | 'SPECTRUM' | 'NORMAL'>('NORMAL');
  const [scanningBiometrics, setScanningBiometrics] = useState(false);

  // Geo weather state
  const [weatherCity, setWeatherCity] = useState('Sede NIM (Malibú)');
  const [weatherData, setWeatherData] = useState({ temp: 24, hud: 'Despejado', wind: 14 });

  // Math calculator state
  const [mathA, setMathA] = useState(120);
  const [mathB, setMathB] = useState(4);
  const [mathCalculationOutput, setMathCalculationOutput] = useState<string | null>(null);

  // Audio Spectrum Height States for reactivity
  const [spectrum, setSpectrum] = useState<number[]>([12, 34, 18, 54, 30, 72, 45, 20, 10, 31, 22, 60, 15, 45, 12, 30, 48, 12, 64, 25]);

  // References
  const logContainerRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const pendingUtterancesRef = useRef<number>(0);

  // Digital clock loop
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('es-ES', { hour12: false }));
      const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
      setCurrentDate(now.toLocaleDateString('es-ES', options).toUpperCase());
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Global hotkey: Escape key interrupts speech synthesis immediately
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.speechSynthesis.cancel();
        setStatus('STANDBY');
        setOrbState('idle');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch and display real-time host telemetry updates
  useEffect(() => {
    const fetchSystemStats = async () => {
      try {
        const startTime = performance.now();
        const res = await fetch('/api/system-info');
        const latency = Math.round(performance.now() - startTime);
        if (!res.ok) {
          setStats(prev => ({ ...prev, networkStatus: 'DEGRADED' }));
          return;
        }
        const data = await res.json();
        
        const totalGB = parseFloat(data.totalMemory);
        const freeGB = parseFloat(data.freeMemory);
        const usedGB = (totalGB - freeGB).toFixed(1);

        setStats({
          latency,  // REAL — tiempo del request
          cpu: data.cpuUsage,
          memory: `${usedGB} / ${data.totalMemory}`,
          networkStatus: res.ok ? 'NOMINAL' : 'DEGRADED'
        });
      } catch (err) {
        // Ignorar falla de telemetría del servidor viejo
      }
    };

    fetchSystemStats();
    const statsInterval = setInterval(fetchSystemStats, 2000);

    // Spectrum visualizer dynamic motion
    const spectrumInterval = setInterval(() => {
      setSpectrum(prev => prev.map(() => Math.floor(Math.random() * 52) + 12));
    }, 150);

    return () => {
      clearInterval(statsInterval);
      clearInterval(spectrumInterval);
    };
  }, []);

  // Poll de modelos y cuotas del backend Hermes
  useEffect(() => {
    const fetchModelsAndQuota = async () => {
      try {
        // Cargar modelos disponibles y quickModels
        // Modelos se cargan vía WSS en onModelsList, solo solicitarlos
        wssClient.getModels();

        // Cargar métricas reales de cuota
        const quotaRes = await fetch('/api/hermes/quota');
        if (quotaRes.ok) {
          const quota = await quotaRes.json();
          setQuotaData(quota);
          setHasKeys(quota.hasKey || {});

          // Auto-detección: si el modelo activo no tiene key, buscar alternativas
          if (quota.hasKey) {
            const activeKeyOk = quota.activeProvider && quota.hasKey[quota.activeProvider];
            if (!activeKeyOk && !previousQuotaStatus.current?.switched) {
              // Buscar el primer modelo con key configurada
              const allModels = modelsList.length > 0 ? modelsList : (modelsData?.models || []);
              const altModel = allModels.find(
                (m: HermesModel) => quota.hasKey[m.provider]
              );
              if (altModel) {
                try {
                  wssClient.switchModel(altModel.id);
                  setActiveModel(altModel.id);
                  setActiveModelName(altModel.name);
                  addLog('system', `DETECCIÓN COGNITIVA: Conmutando automáticamente a ${altModel.name} (Canal Activo).`);
                } catch (e) {}
              }
              previousQuotaStatus.current = { ...previousQuotaStatus.current, switched: true };
            }
          }
        }
      } catch (err: any) {
        console.warn('Conexión con el servidor NIM momentáneamente inactiva (Reintentando...):', err.message || err);
      }
    };

    fetchModelsAndQuota();
    const interval = setInterval(fetchModelsAndQuota, 5000);
    return () => clearInterval(interval);
  }, []);

  // Automatic scroll layouts
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, activeTab]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages, activeTab]);

  // Inicializar reconocimiento de voz al montar
  useEffect(() => {
    if (SpeechRecognitionAPI) {
      const rec = createSpeechRecognition();
      if (rec) recognitionRef.current = rec;
    } else {
      addLog('system', 'Web Speech API no disponible de forma nativa. Usando conmutador simulado.');
    }

    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
    };
  }, []);

  // Direct Mic toggle button — recrea el recognition cada vez para evitar estado terminal
  const toggleListening = () => {
    if (status === 'LISTENING') {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
      setStatus('STANDBY');
      setOrbState('idle');
      addLog('system', 'Microfono desactivado.');
      return;
    }

    // Feedback visual INMEDIATO — antes de pedir permiso al navegador
    micErrorRef.current = false; // Resetear flag de error
    setStatus('LISTENING');
    setOrbState('listening');
    addLog('system', 'Solicitando acceso al microfono...');

    // Siempre crear un recognition fresco antes de empezar
    const rec = createSpeechRecognition();
    if (!rec) {
      // Fallback simulado si no hay API
      addLog('system', 'Simulacion de canal de audio virtual activada. Escriba en la barra.');
      setTimeout(() => {
        setStatus(prev => prev === 'LISTENING' ? 'STANDBY' : prev);
        setOrbState('idle');
      }, 8000);
      return;
    }
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch (e: any) {
      console.error('Error iniciando reconocimiento:', e);
      addLog('system', `Error de microfono: ${e.message || 'Permiso denegado'}. Verifique permisos del navegador.`);
      setStatus('ERROR');
      setOrbState('idle');
      // Resetear despues de 3s para que el usuario pueda reintentar
      setTimeout(() => {
        setStatus(prev => prev === 'ERROR' ? 'STANDBY' : prev);
      }, 3000);
    }
  };

  // Log Trace generator
  const addLog = (type: LogEntry['type'], message: string) => {
    const newEntry: LogEntry = {
      id: `log-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
    };
    setLogs(prev => [...prev, newEntry]);
  };

  // Conversational history message
  const addChatMessage = (sender: 'user' | 'nim', text: string) => {
    const newMessage: ChatMessage = {
      id: `chat-${Date.now()}-${Math.random()}`,
      sender,
      text,
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      modelUsed: sender === 'nim' ? activeModelName.toUpperCase() : undefined
    };
    setChatMessages(prev => [...prev, newMessage]);
  };

  // F2.2 — Resume de sesión VPS: carga los últimos mensajes en el chat
  const handleResumeSession = (session: SessionInfo, messages: SessionMessage[]) => {
    setChatMessages(sessionMessagesToChat(session, messages));
    setActiveSession({ id: session.id, title: session.title?.trim() || 'Sesión sin título' });
    setActiveTab('chat_history');
    addLog('system', `Sesión VPS reanudada: ${session.title?.trim() || session.id.slice(0, 8)} (${messages.length} msgs)`);
  };

  // Sound synthesis
  const speakText = (text: string) => {
    const cleanTextForSpeech = (rawText: string) => {
      if (!rawText) return "";
      return rawText
        .replace(/```[\s\S]*?```/g, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/__([^_]+)__/g, "$1")
        .replace(/_([^_]+)_/g, "$1")
        .replace(/#+\s+/g, "")
        .replace(/^\s*[-*+]\s+/gm, "")
        .replace(/^\s*\d+\.\s+/gm, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/https?:\/\/[^\s]+/g, "")
        .replace(/---+/g, "")
        .replace(/[`*_~]/g, "")
        .replace(/[{}[\]]/g, "")
        .replace(/\n{2,}/g, ". ")
        .replace(/\n/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
    };

    const cleaned = cleanTextForSpeech(text);
    if (!cleaned) {
      console.log('[TTS] Texto limpio vacío, ignorando');
      return;
    }

    if ((window as any).playCloudTTS) {
      (window as any).playCloudTTS(cleaned);
    } else {
      // Fallback
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.lang = 'es-ES';
      utterance.rate = 1.05; 
      utterance.pitch = 0.95;
      const voices = window.speechSynthesis.getVoices();
      const esVoice = voices.find(v => v.lang.startsWith('es-')) || voices[0];
      if (esVoice) utterance.voice = esVoice;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Core model prompt dispatcher
  const submitPrompt = async (promptToSend: string) => {
    const p = promptToSend.trim();
    if (!p) return;

    // --- OPENCLAW-STYLE SLASH COMMANDS INTERCEPTOR ---
    if (p.startsWith('/')) {
      const parts = p.split(' ');
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1);
      
      addChatMessage('user', p);

      if (cmd === '/clear') {
        setChatMessages([]);
        setLogs([]);
        setStatus('STANDBY');
        return;
      } else if (cmd === '/stop') {
        window.speechSynthesis.cancel();
        setStatus('STANDBY');
        setOrbState('idle');
        addLog('system', '[COMANDO] Generación y síntesis de voz abortadas.');
        return;
      } else if (cmd === '/status') {
        const statusMsg = `NIM_CENTRAL STATUS:\n- Motor: ${activeModelName}\n- Memoria HUD: ${stats.memory}\n- Skills: ${skills.length}\n- Uptime: OK`;
        addLog('system', statusMsg);
        addChatMessage('nim', statusMsg);
        return;
      } else if (cmd === '/test-tauri') {
        const runTest = async () => {
          try {
            const commandToRun = args.join(' ') || 'dir';
            addLog('system', `Ejecutando comando Tauri local: ${commandToRun}`);
            const result = await invoke<string>('nim_terminal', { command: commandToRun });
            addLog('system', `Resultado Tauri:\n${result}`);
            addChatMessage('nim', `Comando nativo ejecutado correctamente.\n\n\`\`\`json\n${result}\n\`\`\``);
          } catch (e: any) {
            addLog('system', `Error en comando Tauri local: ${e}`);
            addChatMessage('nim', `Error al ejecutar comando nativo:\n\n\`\`\`json\n${e}\n\`\`\``);
          }
        };
        runTest();
        return;
      } else {
        addLog('system', `[COMANDO DESCONOCIDO] El comando ${cmd} no está registrado.`);
        addChatMessage('nim', `Lo siento Señor, no reconozco el comando "${cmd}". Pruebe con /clear, /stop o /status.`);
        return;
      }
    }

    setStatus('THINKING');
    setOrbState('thinking');
    
    // Cancelar cualquier speech residual antes de empezar
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    
    // ID para el mensaje en streaming que se actualiza en tiempo real
    const streamingMsgId = `chat-stream-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Agregar placeholder que se irá llenando con las muletillas
    setChatMessages(prev => [...prev, {
      id: streamingMsgId,
      sender: 'nim',
      text: '● Procesando...',
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      modelUsed: 'HERMES',
      streaming: true,
    }]);

    try {
      // Enviar comando a Hermes vía el WebSocket Cifrado E2EE
      await wssClient.sendUserMessage(promptToSend);
      addLog('system', 'Comando enviado a Hermes VPS por túnel cifrado E2EE...');
      
      // Remover el placeholder, la respuesta real llegará por wssClient.onBotMessage
      setChatMessages(prev => prev.filter(m => m.id !== streamingMsgId));

    } catch (err: any) {
      console.error('Error al enviar prompt:', err);
      addLog('system', `[ERROR] No se pudo conectar con Hermes VPS: ${err.message}`);
      setOrbState('idle');
      setStatus('STANDBY');
    }
  };

  // Written submit handler
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    
    const prompt = inputVal;
    
    addLog('user', `Comando consola: "${prompt}"`);
    addChatMessage('user', prompt);
    setInputVal('');
    
    submitPrompt(prompt);
  };

  // Crea un nuevo objeto de reconocimiento de voz desde cero.
  // Necesario porque SpeechRecognition queda en estado terminal tras detenerse
  // y no se puede reusar — hay que recrearlo cada vez.
  const createSpeechRecognition = () => {
    if (!SpeechRecognitionAPI) return null;
    const rec = new SpeechRecognitionAPI();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'es-ES';

    rec.onstart = () => {
      addLog('system', 'Microfono en linea. Analizando entrada de voz en busca de instrucciones...');
      setStatus('LISTENING');
      setOrbState('listening');
    };

    rec.onresult = (event: any) => {
      const resultIndex = event.resultIndex;
      const transcript = event.results[resultIndex][0].transcript.trim();
      
      addLog('user', `Comando recibido via voz: "${transcript}"`);

      if (isWakeWordMode) {
        const lowercaseTranscript = transcript.toLowerCase();
        if (lowercaseTranscript.includes('nim')) {
          const cleanPrompt = transcript.replace(/nim/i, '').trim();
          addChatMessage('user', transcript);
          if (cleanPrompt) {
            submitPrompt(cleanPrompt);
          } else {
            speakText('Si, Senor. Estoy escuchando. En que le puedo asistir?');
            addLog('thought', 'Filtro activador NIM disparado. Esperando parametro de orden.');
            addChatMessage('nim', 'Si, Senor. Estoy escuchando. En que le puedo asistir?');
          }
        } else {
          addLog('thought', `Audio descartado: No contiene la llamada activadora obligatoria "NIM".`);
        }
      } else {
        addChatMessage('user', transcript);
        submitPrompt(transcript);
      }
    };

    rec.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'no-speech') {
        micErrorRef.current = true; // Marcar error para que onend no lo sobrescriba
        const errorMsg = event.error === 'not-allowed' 
          ? 'Permiso de microfono DENEGADO. Conceda acceso al microfono en la configuracion del navegador.' 
          : `Error en la senal del captador vocal: ${event.error}`;
        addLog('system', errorMsg);
        setStatus('ERROR');
        setOrbState('idle');
        // Mantener ERROR visible 4s para que el usuario vea el feedback
        setTimeout(() => {
          micErrorRef.current = false;
          setStatus(prev => prev === 'ERROR' ? 'STANDBY' : prev);
        }, 4000);
      }
    };

    rec.onend = () => {
      console.log('[MIC] onend disparado, status:', status, 'wakeWord:', isWakeWordMode, 'errorFlag:', micErrorRef.current);
      if (micErrorRef.current) {
        // No sobrescribir el estado de error
        return;
      }
      if (isWakeWordMode) {
        try { rec.start(); } catch (e) {
          // Si falla el reinicio en modo wake, recrear
          const newRec = createSpeechRecognition();
          if (newRec) {
            recognitionRef.current = newRec;
            try { newRec.start(); } catch (e2) {}
          }
        }
      } else {
        setStatus('STANDBY');
        setOrbState('idle');
        addLog('system', 'Receptor de audicion desactivado.');
      }
    };

    return rec;
  };

  const toggleWakeWordMode = () => {
    const nextMode = !isWakeWordMode;
    setIsWakeWordMode(nextMode);
    
    if (nextMode) {
      addLog('system', 'FILTRO VOCAL CONTINUO "NIM" OPERATIVO.');
      speakText('Escucha continua armada, Señor. Responderé inmediatamente al escuchar el nombre NIM.');
      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch (e) {}
      }
    } else {
      addLog('system', 'FILTRO VOCAL NIM SUSPENDIDO.');
      speakText('Filtro continuo apagado.');
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
    }
  };

  // Selected skill config object — con defaults seguros mientras carga
  const selectedSkill = skills.length > 0 
    ? (skills.find(s => s.id === selectedSkillId) || skills[0])
    : { id: 'loading', name: 'Cargando...', status: 'Activa', isEnabled: false, description: 'Cargando skills desde Hermes...', callCount: 0 };

  const handleToggleSkillEnabled = (id: string) => {
    setSkills(prev => prev.map(s => {
      if (s.id === id) {
        const nextEnabled = !s.isEnabled;
        const nextStatus = nextEnabled ? 'Activa' : 'Inactiva';
        addLog('system', `Habilidad [${s.name}] reconfigurada: ${nextEnabled ? 'HABILITADA' : 'DESHABILITADA'}`);
        return { ...s, isEnabled: nextEnabled, status: nextStatus };
      }
      return s;
    }));
  };

  const handleUpdateSkillStatus = (id: string, newStatus: Skill['status']) => {
    setSkills(prev => prev.map(s => {
      if (s.id === id) {
        addLog('system', `Habilidad [${s.name}] cambia estado manual: [${newStatus}]`);
        return { ...s, status: newStatus };
      }
      return s;
    }));
  };

  // Triggering INTERACTIVE ACTIONS/PLAYGROUND for each skill to make them fully functional
  const handleExecuteSkillPlayground = async (skillId: string) => {
    setStatus('THINKING');
    
    // Tick use count
    setSkills(prev => prev.map(s => s.id === skillId ? { ...s, callCount: s.callCount + 1 } : s));

    switch (skillId) {
      case 'web_search':
        setPlaySearchLoading(true);
        addLog('action', `[SATÉLITE NIM-CORE] Ejecutando escáner web y búsqueda con grounding en tiempo real para: "${playSearchQuery}"`);
        try {
          const res = await fetch(`/api/live-search?query=${encodeURIComponent(playSearchQuery)}`);
          const data = await res.json();
          setPlaySearchLoading(false);
          setWebSearchResults(data);
          
          if (data.success) {
            addLog('observation', `Búsqueda exitosa. Canales indexados: ${data.categories?.map((c: any) => c.categoryName).join(', ') || 'NIM Central'}.`);
            const summaryText = data.summary || `Señor, he procesado su consulta dándome excelentes resultados.`;
            addLog('response', `NIM: "${summaryText}"`);
            addChatMessage('nim', summaryText);
            speakText(data.vocalSummary || summaryText);
          } else {
            throw new Error(data.error || 'Respuesta insatisfactoria del bus de datos.');
          }
        } catch (err: any) {
          console.error(err);
          setPlaySearchLoading(false);
          addLog('observation', 'Error al sincronizar con el relé del satélite principal. Suministrando simulación de respaldo estructurada.');
          const failPhrase = 'Señor, se ha producido un desfase térmico en los transceptores. He cargado la base de simulación preventiva de noticias filtradas por categorías.';
          addLog('response', `NIM: "${failPhrase}"`);
          addChatMessage('nim', failPhrase);
          speakText(failPhrase);
        }
        break;

      case 'file_sys':
        addLog('action', 'Leyendo telemetría y sistema de archivos del host en la nube de NIM...');
        try {
          const sysRes = await fetch('/api/system-info');
          const sysData = await sysRes.json();
          setServerSysInfo(sysData);
          
          addLog('observation', `Servidor en la nube: Plataforma=${sysData.platform} [${sysData.arch}], CPU Cores=${sysData.cpus}, Memoria Libre=${sysData.freeMemory}/${sysData.totalMemory}, Node.js=${sysData.nodeVersion}`);
          
          const liveOS = detectSystemInfo().os;
          const liveCores = detectSystemInfo().cores;
          
          const filePhrase = `Señor, he completado la auditoría local. He verificado que la estación desde la que me controla está corriendo en un sistema operativo ${liveOS} con ${liveCores} núcleos lógicos. Paralelamente, mi motor agéntico se aloja en un contenedor de la nube basado en ${sysData.platform} (${sysData.arch}) con Node.js ${sysData.nodeVersion}. El sistema goza de excelente salud térmica y estructural.`;
          
          addLog('response', `NIM: "${filePhrase}"`);
          addChatMessage('nim', filePhrase);
          speakText(filePhrase);
        } catch (err: any) {
          console.error(err);
          addLog('observation', 'Error al consultar la telemetría del servidor en tiempo real. Entrando en simulación de contingencia.');
          const failPhrase = 'Señor, he completado la auditoría local del disco de NIM, pero se ha producido un percance de lectura cuántica en el bus del hardware remoto.';
          addLog('response', `NIM: "${failPhrase}"`);
          addChatMessage('nim', failPhrase);
          speakText(failPhrase);
        }
        break;

      case 'home_auto':
        const mode = iotLights ? 'LUCES EN REPOSO AMBIENTE' : 'LUCES ACTIVADAS EN MÁXIMA INTENSIDAD';
        addLog('action', `Enviando comando IoT encriptado de NIM: Ajustar Iluminación: ${iotLights ? 'APAGADO AMBIENTE' : 'ENCENDIDO'}, Escudo: ${iotShield}%, Ventilador: ${iotCoreFan ? 'APAGADO' : 'ENCENDIDO'}`);
        setTimeout(() => {
          addLog('observation', `Hardware IoT ha respondido con éxito. Intensidad eléctrica redirigida. Escudo deflector calibrado al ${iotShield}%.`);
          const iotPhrase = `Protocolos de domótica sincronizados, Señor. La iluminación del laboratorio está en modo ${iotLights ? 'tenue' : 'claro'}, y los escudos de NIM están estabilizados al ${iotShield} por ciento.`;
          addLog('response', `NIM: "${iotPhrase}"`);
          addChatMessage('nim', iotPhrase);
          speakText(iotPhrase);
          setIotLights(!iotLights); // Toggle state cleanly
        }, 1200);
        break;

      case 'vision_ai':
        setScanningBiometrics(true);
        addLog('action', `Disparando reconocimiento óptico de NIM. Filtros de lente: [${camFilter}]. Procesando coincidencia biométrica...`);
        setTimeout(() => {
          setScanningBiometrics(false);
          addLog('observation', 'Rasgos volumétricos de coincidencia al 99.87% con el usuario. Estado de peligro: NOMINAL.');
          const visionPhrase = `Escaneo óptico de NIM terminado, Señor. He verificado su identidad biométrica. Su nivel de acceso de administrador general está aprobado en nuestra base de datos.`;
          addLog('response', `NIM: "${visionPhrase}"`);
          addChatMessage('nim', visionPhrase);
          speakText(visionPhrase);
        }, 2000);
        break;

      case 'weather_api':
        addLog('action', `Sondeando boyas meteorológicas globales de NIM para: ${weatherCity}`);
        try {
          const wRes = await fetch(`/api/live-weather?city=${encodeURIComponent(weatherCity)}`);
          const wData = await wRes.json();
          setWeatherData({ temp: wData.temp, hud: wData.hud, wind: wData.wind });
          addLog('observation', `Datos telemétricos atmosféricos reales recibidos: Temperatura ${wData.temp}°C, Vientos a ${wData.wind} km/h, Condición: ${wData.hud}.`);
          const weatherPhrase = `Reporte del satélite atmosférico NIM listo, Señor. En ${weatherCity} se registra una temperatura real de ${wData.temp} grados centígrados, con cielos caracterizados por ${wData.hud} y vientos soplando a ${wData.wind} kilómetros por hora.`;
          addLog('response', `NIM: "${weatherPhrase}"`);
          addChatMessage('nim', weatherPhrase);
          speakText(weatherPhrase);
        } catch (wErr) {
          console.error(wErr);
          addLog('observation', 'Error de comunicación atmosférica. Utilizando relé analógico local.');
          const failPhrase = 'Señor, no he podido enlazar con la red meteorológica principal. He desplegado la telemetría climática local de respaldo.';
          addLog('response', `NIM: "${failPhrase}"`);
          addChatMessage('nim', failPhrase);
          speakText(failPhrase);
        }
        break;

      case 'math_tool':
        addLog('action', `Invocando el procesador matemático de NIM. Multiplicando vector de matriz A [${mathA}] por la bobina inductora B [${mathB}]`);
        setTimeout(() => {
          const totalPr = mathA * mathB;
          const heatRate = (totalPr / 2.5).toFixed(1);
          setMathCalculationOutput(`VECTOR PROD: ${totalPr} // COILS THERMAL RATE: ${heatRate} KW`);
          addLog('observation', `Simulación computacional concluida. Tasa de flujo térmico calculado en ${heatRate} Kilovatios.`);
          const mathPhrase = `Resultado matemático procesado, Señor. El reactor NIM tiene una proyección de resistencia de ${totalPr} unidades físicas, manteniendo una emisión térmica estable de ${heatRate} kilovatios.`;
          addLog('response', `NIM: "${mathPhrase}"`);
          addChatMessage('nim', mathPhrase);
          speakText(mathPhrase);
        }, 1500);
        break;

      case 'file_organizer':
        addLog('action', 'Ejecutando organizador de archivos físico en el directorio de descargas del host...');
        try {
          const orgRes = await fetch('/api/agent-core/file-organizer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ directory: '' }) // blank uses default homedir Downloads
          });
          const orgData = await orgRes.json();
          if (orgData.success) {
            addLog('observation', orgData.observation);
            const successPhrase = `Señor, he completado la organización física de su carpeta de descargas de forma impecable. Agrupé todos los archivos sueltos en subcarpetas según su formato de extensión para restablecer el orden estructural.`;
            addLog('response', `NIM: "${successPhrase}"`);
            addChatMessage('nim', successPhrase);
            speakText(successPhrase);
          } else {
            throw new Error(orgData.error || 'Respuesta insatisfactoria del bus de datos.');
          }
        } catch (err: any) {
          console.error(err);
          addLog('observation', `Error en los microcontroladores del disco: ${err.message}`);
          const failPhrase = 'Señor, mis disculpas. Se produjo una interferencia al intentar reorganizar los archivos del disco físico remoto.';
          addLog('response', `NIM: "${failPhrase}"`);
          addChatMessage('nim', failPhrase);
          speakText(failPhrase);
        }
        break;
    }
  };

  return (
    <div className="relative w-full min-h-screen bg-[#02070a] grid-lines overflow-x-hidden overflow-y-auto flex flex-col p-2.5 md:p-4 text-[#00f2ff]">
      <div className="scanline"></div>

      {/* HEADER HUD METADATA */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-2.5 border-b border-cyan-900/40 pb-2 gap-2.5 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2">
            {/* Pulsing state orb */}
            <span className="relative flex h-3.5 w-3.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                status === 'ERROR' ? 'bg-red-500' :
                status === 'LISTENING' ? 'bg-amber-400' :
                status === 'THINKING' ? 'bg-cyan-400' :
                status === 'SPEAKING' ? 'bg-emerald-400' : 'bg-cyan-500'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-3.5 w-3.5 border border-black ${
                status === 'ERROR' ? 'bg-red-500' :
                status === 'LISTENING' ? 'bg-amber-500' :
                status === 'THINKING' ? 'bg-cyan-500' :
                status === 'SPEAKING' ? 'bg-emerald-500' : 'bg-cyan-600'
              }`}></span>
            </span>
            <div className="flex flex-col">
              <h1 className="text-sm font-bold tracking-[0.25em] font-mono uppercase glow-text">
                MATRIZ COGNITIVA DIGITAL NIM
              </h1>
              <span className="text-[9px] text-cyan-600 font-mono tracking-widest uppercase">
                SISTEMA OPERATIVO AGÉNTICO // VERSIÓN INTELECTUAL MULTICANAL
              </span>
            </div>
          </div>
          <div className="h-4 w-px bg-cyan-950 hidden sm:block"></div>
          <p className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase flex items-center gap-1.5">
            ESTADO COGNITIVO: 
            <span className={`font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-[9px] ${
              status === 'ERROR' ? 'bg-red-950 border border-red-800 text-red-400' :
              status === 'LISTENING' ? 'bg-amber-950 border border-amber-800 text-amber-400 animate-pulse' :
              status === 'THINKING' ? 'bg-cyan-950 border border-cyan-800 text-cyan-300 animate-pulse' :
              status === 'SPEAKING' ? 'bg-emerald-950 border border-emerald-800 text-emerald-400' : 'bg-cyan-950/40 border border-cyan-900 text-cyan-400'
            }`}>
              {status === 'STANDBY' ? 'REPOSO (STANDBY)' : status}
            </span>
          </p>
        </div>

        {/* Global Controls & Time info */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full lg:w-auto justify-between lg:justify-end">
          {/* Ambient speech mute controller */}
          <div className="flex items-center space-x-2 bg-[#06111c]/80 border border-cyan-950 px-2.5 py-1 rounded">
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-neutral-500" /> : <Volume2 className="w-3.5 h-3.5 text-green-400" />}
            <span className="text-[10px] font-mono text-cyan-500">ALTOPARLANTE:</span>
            <button 
              onClick={() => {
                const nextVal = !isMuted;
                setIsMuted(nextVal);
                if (nextVal) {
                  window.speechSynthesis.cancel();
                }
                addLog('system', `Síntesis de voz de NIM: ${nextVal ? 'DESHABILITADA' : 'HABILITADA'}`);
              }}
              className={`text-[8.5px] px-2 py-0.5 rounded transition uppercase border font-mono font-bold ${
                isMuted ? 'bg-red-950/60 text-red-400 border-red-900/60' : 'bg-green-950/60 text-emerald-400 border-emerald-900/60'
              }`}
            >
              {isMuted ? 'MUTEADO' : 'NIM HABLA'}
            </button>
          </div>

          <div className="flex items-center space-x-3 bg-[#06111c]/80 border border-cyan-950 px-2 line-clamp-1 py-1 rounded">
            <span className="text-[9px] text-cyan-500 font-mono uppercase">CONECTOR:</span>
            <span className="text-[10px] font-mono text-amber-400 uppercase font-bold tracking-wider">
              {activeModelName.toUpperCase()}
            </span>
          </div>

          <div className="text-right">
            <div className="text-sm font-mono text-cyan-200 tracking-wider font-semibold">{currentTime}</div>
            <div className="text-[8px] text-cyan-500 tracking-widest font-mono leading-none">{currentDate}</div>
          </div>
        </div>
      </header>

      {/* PROMINENT MODEL SWITCHER TAB MENU — DINÁMICO DESDE HERMES */}
      <section className="bg-[#05111b] border border-cyan-900/50 p-2.5 rounded-md mb-2 md:mb-2.5 flex flex-col gap-2 shrink-0">
        <div className="flex flex-col md:flex-row items-center justify-between gap-2 border-b border-cyan-950 pb-2">
          <div className="flex items-center justify-between w-full md:w-auto gap-2">
            <div className="flex items-center gap-2">
              <Cpu className="text-amber-400 w-4 h-4 animate-pulse" />
              <div className="flex flex-col">
                <span className="text-[10px] font-mono text-amber-400 font-bold tracking-widest uppercase">MOTOR COGNITIVO DEL EMISOR</span>
                <span className="text-[8.5px] text-cyan-500/80 font-mono">Haga click para conmutar los algoritmos de respuesta instantánea de NIM</span>
              </div>
            </div>

            {/* Premium details controller trigger button */}
            <button
              onClick={() => setShowQuotasModal(true)}
              type="button"
              className="px-3 py-1 border border-cyan-500/40 bg-cyan-950/50 hover:bg-cyan-500/20 text-cyan-300 font-mono text-[9px] uppercase tracking-wider rounded font-bold hover:text-white transition flex items-center gap-1.5"
              title="Abrir centro de control de cuotas, costos, ventanas de contexto y regulaciones de mercado"
            >
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>VER CONSUMO Y REGULACIONES</span>
            </button>
          </div>
          
          {/* 3 Botones Dinámicos + Engranaje de Configuración */}
          <div className="flex items-center gap-1.5 w-full md:w-auto">
            <div className="grid grid-cols-3 gap-1.5 flex-1">
              {quickModels.map((modelId, idx) => {
                const model = modelsList.find(m => m.id === modelId);
                const modelHasKey = model ? (hasKeys[model.provider] ?? false) : true;
                const isActive = activeModel === modelId;
                
                if (!model) {
                  return (
                    <div key={idx} className="px-3 py-2 border border-cyan-950 bg-black/40 rounded font-mono text-center text-[10px] text-cyan-800 flex flex-col justify-center items-center gap-0.5 min-w-[100px]">
                      <span className="text-[8px]">Cargando...</span>
                    </div>
                  );
                }

                const providerColors: Record<string, string> = {
                  deepseek: 'text-cyan-400',
                  gemini: 'text-amber-400',
                  anthropic: 'text-purple-400',
                  openai: 'text-green-400',
                };
                const iconColor = providerColors[model.provider] || 'text-cyan-400';

                return (
                  <button
                    key={modelId}
                    type="button"
                    disabled={!modelHasKey}
                    onClick={async () => {
                      addLog('system', `Solicitando conmutación a ${model.name}...`);
                      try {
                        wssClient.switchModel(model.id);
                        setActiveModel(model.id);
                        setActiveModelName(model.name);
                        addLog('system', `Matriz de NIM redirigida a ${model.name.toUpperCase()}.`);
                        const confirmMsg = `¿Seguro que quiere cambiar a ${model.name}? El switch cognitivo está completo.`;
                        addChatMessage('nim', confirmMsg);
                        speakText(`Motor ${model.name} acoplado. Razonamiento activo.`);
                      } catch (e: any) {
                        addLog('system', `Error al conmutar: ${e.message}`);
                      }
                    }}
                    className={`relative px-3 py-2 border rounded font-mono text-center transition flex flex-col justify-center items-center gap-0.5 text-[10px] uppercase font-bold min-w-[100px] ${
                      !modelHasKey ? 'opacity-40 cursor-not-allowed border-cyan-950/30 bg-black/30 text-cyan-800' :
                      isActive 
                        ? 'border-cyan-400 bg-cyan-400/20 text-white shadow-[0_0_8px_rgba(0,242,255,0.25)]' 
                        : 'border-cyan-950 bg-black/40 text-cyan-600 hover:text-cyan-300'
                    }`}
                    title={!modelHasKey ? `Sin API key configurada para ${model.provider}` : `Cambiar a ${model.name}`}
                  >
                    <div className="flex items-center gap-1">
                      {model.provider === 'deepseek' && <Database className={`w-3 h-3 ${iconColor}`} />}
                      {model.provider === 'gemini' && <Sparkles className={`w-3 h-3 ${iconColor}`} />}
                      {model.provider === 'anthropic' && <Layers className={`w-3 h-3 ${iconColor}`} />}
                      {model.provider === 'openai' && <Grid className={`w-3 h-3 ${iconColor}`} />}
                      <span className="text-[9px] leading-tight">{model.name}</span>
                    </div>
                    {modelHasKey ? (
                      <span className={`text-[7.5px] font-mono font-medium ${isActive ? 'text-green-400' : 'text-cyan-600'}`}>
                        {isActive ? '● ACTIVO' : 'DISPONIBLE'}
                      </span>
                    ) : (
                      <span className="text-[7.5px] text-red-600 font-mono">⚠ SIN KEY</span>
                    )}
                  </button>
                );
              })}
            </div>
            
            {/* Botón de Configuración (Engranaje) */}
            <button
              type="button"
              onClick={() => {
                setTempQuickSelection([...quickModels]);
                setShowModelSettings(true);
              }}
              className="p-2 border border-amber-900/50 bg-amber-950/20 hover:bg-amber-900/30 text-amber-500 hover:text-amber-300 rounded transition"
              title="Configurar modelos rápidos"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Dynamic Model Profile, Strengths, and API key Health status card */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 bg-[#030c14]/90 p-2 rounded border border-cyan-950/60 text-[9.5px] font-mono leading-relaxed">
          <div className="md:col-span-3 border-r border-cyan-950/40 pr-2 flex flex-col justify-between py-0.5">
            <div>
              <div className="text-cyan-400 font-bold uppercase flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-cyan-500" />
                PERFIL COGNITIVO ACTIVO
              </div>
              <div className="text-[11px] text-cyan-100 font-bold uppercase mt-1">
                {activeModelName}
              </div>
            </div>
            <div className="mt-2 md:mt-0 pt-1.5 border-t border-cyan-950/30">
              <span className="text-cyan-600">CANAL SECRETO: </span>
              {(() => {
                const currModel = modelsList.find(m => m.id === activeModel);
                const currProvider = currModel?.provider || '';
                const hasKey = hasKeys[currProvider];
                if (!currProvider) return <span className="text-amber-500/90 font-bold">SIMULATIVO</span>;
                if (hasKey) return <span className="text-green-400 font-bold">CONECTADO</span>;
                return <span className="text-amber-500/90 font-bold">SIMULATIVO</span>;
              })()}
            </div>
          </div>

          <div className="md:col-span-5 border-r border-cyan-950/40 px-2 space-y-1.5 py-0.5">
            <div>
              <span className="text-cyan-500 font-bold uppercase block">PUNTOS FUERTES / CAPACIDAD:</span>
              <p className="text-cyan-200/90 leading-tight text-[9px] mt-0.5">
                {(() => {
                  const currModel = modelsList.find(m => m.id === activeModel);
                  return currModel?.strengths || 'Cargando información ventajosa de relés...';
                })()}
              </p>
            </div>
            <div>
              <span className="text-amber-500 font-bold uppercase block">PUNTOS DÉBILES / RIESGOS:</span>
              <p className="text-amber-200/80 leading-tight text-[9px] mt-0.5">
                {(() => {
                  const currModel = modelsList.find(m => m.id === activeModel);
                  return currModel?.description || 'Cargando limitaciones operacionales...';
                })()}
              </p>
            </div>
          </div>

          <div className="md:col-span-4 pl-2 flex flex-col justify-between space-y-2 md:space-y-0 py-0.5">
            <div>
              <span className="text-cyan-500 font-bold uppercase block">ESTRUCTURA DE RESETEO:</span>
              <span className="text-cyan-300 text-[9px] block leading-tight">
                Recuperación automática por ventana de tráfico del proveedor
              </span>
            </div>

            <div className="bg-cyan-950/20 border border-cyan-900/30 p-1.5 rounded mt-1">
              <div className="flex justify-between items-center text-[9px]">
                <span className="text-cyan-500 font-bold uppercase">PROVEEDOR ACTIVO:</span>
                <span className="text-cyan-100 font-bold">
                  {(() => {
                    const currModel = modelsList.find(m => m.id === activeModel);
                    return (currModel?.provider || 'DESCONOCIDO').toUpperCase();
                  })()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MODAL DE CONFIGURACIÓN DE MODELOS RÁPIDOS */}
      {showModelSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#020b12] border border-amber-500/60 rounded-lg w-full max-w-lg max-h-[80vh] overflow-y-auto flex flex-col shadow-[0_0_25px_rgba(245,158,11,0.15)]">
            <header className="flex items-center justify-between p-4 border-b border-amber-900/40 bg-amber-950/20">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-amber-400" />
                <div>
                  <h2 className="text-sm font-mono font-bold tracking-wider text-amber-200 uppercase">
                    Configurar Modelos Rápidos
                  </h2>
                  <p className="text-[9px] text-amber-500/70 font-mono uppercase">Seleccione exactamente 3 modelos</p>
                </div>
              </div>
              <button onClick={() => setShowModelSettings(false)} className="text-amber-500 hover:text-red-400 transition" type="button">
                <XCircle className="w-5 h-5" />
              </button>
            </header>

            <div className="p-4 space-y-2">
              <div className="text-[10px] text-amber-300 font-mono mb-3 bg-amber-950/10 p-2 rounded border border-amber-900/30">
                Seleccionados: <strong>{tempQuickSelection.length}/3</strong>
              </div>
              {modelsList.map((model) => {
                const isSelected = tempQuickSelection.includes(model.id);
                const modelHasKey = hasKeys[model.provider] ?? false;
                const isConfiguring = configuringModelId === model.id;
                const providerColors: Record<string, string> = {
                  deepseek: 'text-cyan-400', gemini: 'text-amber-400', 
                  anthropic: 'text-purple-400', openai: 'text-green-400',
                };
                return (
                  <div key={model.id}>
                    <div
                      className={`flex items-center justify-between p-2.5 rounded border transition ${
                        isSelected 
                          ? 'border-amber-500/60 bg-amber-500/10' 
                          : 'border-cyan-950/40 bg-black/30 hover:border-cyan-900/60'
                      } ${!modelHasKey ? 'opacity-50 hover:opacity-70' : 'cursor-pointer'}`}
                      onClick={() => {
                        if (!modelHasKey) {
                          // Expand inline API key form instead of toggling selection
                          setConfiguringModelId(isConfiguring ? null : model.id);
                          setConfiguringApiKey('');
                          setConfiguringTestResult(null);
                          return;
                        }
                        if (isSelected) {
                          setTempQuickSelection(prev => prev.filter(id => id !== model.id));
                        } else if (tempQuickSelection.length < 3) {
                          setTempQuickSelection(prev => [...prev, model.id]);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-amber-400' : 'bg-cyan-900'}`}></div>
                        <div>
                          <span className={`text-[11px] font-mono font-bold uppercase ${providerColors[model.provider] || 'text-cyan-300'}`}>
                            {model.name}
                          </span>
                          <span className="text-[8px] text-cyan-600 font-mono block">{model.provider.toUpperCase()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {model.custom && (
                          <button
                            type="button"
                            disabled={customModelDeleting === model.id}
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm(`¿Eliminar modelo "${model.name}"?`)) return;
                              setCustomModelDeleting(model.id);
                              try {
                                const res = await fetch(`/api/hermes/remove-model/${encodeURIComponent(model.id)}`, { method: 'DELETE' });
                                if (res.ok) {
                                  setModelsList(prev => prev.filter(m => m.id !== model.id));
                                  setTempQuickSelection(prev => prev.filter(id => id !== model.id));
                                  addLog('system', `Modelo custom "${model.name}" eliminado.`);
                                } else {
                                  const err = await res.json();
                                  addLog('system', `Error al eliminar: ${err.error || 'Desconocido'}`);
                                }
                              } catch (e: any) {
                                addLog('system', `Error al eliminar modelo: ${e.message}`);
                              } finally {
                                setCustomModelDeleting(null);
                              }
                            }}
                            className="text-red-500 hover:text-red-300 hover:bg-red-950/40 p-0.5 rounded transition"
                            title={`Eliminar ${model.name}`}
                          >
                            {customModelDeleting === model.id ? (
                              <RotateCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                        {!modelHasKey && <span className="text-[7.5px] text-red-500 font-mono">⚠ SIN KEY</span>}
                        {isSelected ? (
                          <CheckCircle2 className="w-4 h-4 text-amber-400" />
                        ) : (
                          <div className="w-4 h-4 border border-cyan-900 rounded"></div>
                        )}
                      </div>
                    </div>

                    {/* Inline API key mini-form for models without a key */}
                    {isConfiguring && !modelHasKey && (
                      <div className="mt-1 p-3 rounded border bg-amber-950/10 border-amber-900/30 space-y-2">
                        <p className="text-[9px] font-mono text-amber-300/80">
                          Configurar API key para <strong>{model.name}</strong> ({model.provider})
                        </p>
                        <input
                          type="password"
                          placeholder={`API Key para ${model.provider}`}
                          value={configuringApiKey}
                          onChange={(e) => {
                            setConfiguringApiKey(e.target.value);
                            setConfiguringTestResult(null);
                          }}
                          className="bg-black/60 border border-cyan-900/40 rounded text-cyan-200 text-xs font-mono px-2 py-1 w-full placeholder:text-cyan-700 focus:border-cyan-500 focus:outline-none"
                        />

                        {/* Test result */}
                        {configuringTestResult && (
                          <div className={`flex items-center gap-1.5 text-[9px] font-mono p-1.5 rounded border ${
                            configuringTestResult.ok
                              ? 'text-green-400 border-green-900/50 bg-green-950/20'
                              : 'text-red-400 border-red-900/50 bg-red-950/20'
                          }`}>
                            {configuringTestResult.ok ? (
                              <CheckCircle2 className="w-3 h-3 text-green-400" />
                            ) : (
                              <XCircle className="w-3 h-3 text-red-400" />
                            )}
                            {configuringTestResult.message}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={!configuringApiKey || configuringTesting}
                            onClick={async () => {
                              setConfiguringTesting(true);
                              setConfiguringTestResult(null);
                              try {
                                const res = await fetch('/api/hermes/test-model', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    provider: model.provider,
                                    modelId: model.id,
                                    apiKey: configuringApiKey,
                                  }),
                                });
                                const data = await res.json();
                                setConfiguringTestResult({
                                  ok: data.success,
                                  message: data.message || (data.success ? 'Conexión exitosa' : 'Falló la conexión'),
                                });
                              } catch (e: any) {
                                setConfiguringTestResult({ ok: false, message: `Error: ${e.message}` });
                              } finally {
                                setConfiguringTesting(false);
                              }
                            }}
                            className={`flex-1 border py-1.5 rounded text-[9px] uppercase font-bold transition flex items-center justify-center gap-1 ${
                              configuringApiKey && !configuringTesting
                                ? 'border-green-700/60 text-green-400 hover:bg-green-950/30'
                                : 'border-gray-800 text-gray-700 cursor-not-allowed'
                            }`}
                          >
                            {configuringTesting ? (
                              <RotateCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Activity className="w-3 h-3" />
                            )}
                            Testear
                          </button>
                          <button
                            type="button"
                            disabled={!configuringApiKey || configuringSaving}
                            onClick={async () => {
                              setConfiguringSaving(true);
                              try {
                                const res = await fetch('/api/hermes/set-key', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    provider: model.provider,
                                    apiKey: configuringApiKey,
                                  }),
                                });
                                const data = await res.json();
                                if (res.ok) {
                                  // Update hasKeys immediately
                                  setHasKeys(prev => ({ ...prev, [model.provider]: true }));
                                  addLog('system', `API key para ${model.provider} configurada exitosamente.`);
                                  // Close the form
                                  setConfiguringModelId(null);
                                  setConfiguringApiKey('');
                                  setConfiguringTestResult(null);
                                } else {
                                  addLog('system', `Error al guardar: ${data.error || 'Desconocido'}`);
                                }
                              } catch (e: any) {
                                addLog('system', `Error al guardar API key: ${e.message}`);
                              } finally {
                                setConfiguringSaving(false);
                              }
                            }}
                            className={`flex-1 border py-1.5 rounded text-[9px] uppercase font-bold transition flex items-center justify-center gap-1 ${
                              configuringApiKey && !configuringSaving
                                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                                : 'border-gray-800 text-gray-700 cursor-not-allowed'
                            }`}
                          >
                            {configuringSaving ? (
                              <RotateCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3 h-3" />
                            )}
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfiguringModelId(null);
                              setConfiguringApiKey('');
                              setConfiguringTestResult(null);
                            }}
                            className="border border-red-900/40 text-red-400 hover:bg-red-950/30 py-1.5 px-3 rounded text-[9px] uppercase font-bold transition"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── FORMULARIO AGREGAR MODELO CUSTOM ── */}
            <div className="px-4 pb-2">
              <div className="border-t border-cyan-900/50 pt-3 mb-3">
                <h3 className="text-[10px] font-mono font-bold tracking-wider text-cyan-400 uppercase flex items-center gap-1.5 mb-3">
                  <Plus className="w-3.5 h-3.5" />
                  AGREGAR MODELO CUSTOM
                </h3>

                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Nombre del modelo (ej: Mi Claude Custom)"
                    value={customModelName}
                    onChange={(e) => setCustomModelName(e.target.value)}
                    className="w-full bg-black/50 border border-cyan-900/60 text-cyan-200 text-[10px] font-mono p-2 rounded placeholder:text-cyan-700 focus:border-cyan-500 focus:outline-none transition"
                  />
                  <input
                    type="text"
                    placeholder="ID del modelo (ej: openrouter/anthropic/claude-sonnet-4)"
                    value={customModelId}
                    onChange={(e) => setCustomModelId(e.target.value)}
                    className="w-full bg-black/50 border border-cyan-900/60 text-cyan-200 text-[10px] font-mono p-2 rounded placeholder:text-cyan-700 focus:border-cyan-500 focus:outline-none transition"
                  />
                  <select
                    value={customModelProvider}
                    onChange={(e) => setCustomModelProvider(e.target.value)}
                    className="w-full bg-black/50 border border-cyan-900/60 text-cyan-200 text-[10px] font-mono p-2 rounded focus:border-cyan-500 focus:outline-none transition"
                  >
                    {['openrouter', 'openai', 'anthropic', 'deepseek', 'gemini', 'xai', 'mistral', 'cohere', 'custom'].map(p => (
                      <option key={p} value={p} className="bg-[#020b12] text-cyan-200">{p.toUpperCase()}</option>
                    ))}
                  </select>
                  <input
                    type="password"
                    placeholder="API Key"
                    value={customModelApiKey}
                    onChange={(e) => setCustomModelApiKey(e.target.value)}
                    className="w-full bg-black/50 border border-cyan-900/60 text-cyan-200 text-[10px] font-mono p-2 rounded placeholder:text-cyan-700 focus:border-cyan-500 focus:outline-none transition"
                  />

                  {/* Test result */}
                  {customModelTestResult && (
                    <div className={`flex items-center gap-1.5 text-[9px] font-mono p-1.5 rounded border ${
                      customModelTestResult.ok
                        ? 'text-green-400 border-green-900/50 bg-green-950/20'
                        : 'text-red-400 border-red-900/50 bg-red-950/20'
                    }`}>
                      {customModelTestResult.ok ? (
                        <CheckCircle2 className="w-3 h-3 text-green-400" />
                      ) : (
                        <XCircle className="w-3 h-3 text-red-400" />
                      )}
                      {customModelTestResult.message}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!customModelProvider || !customModelId || !customModelApiKey || customModelTesting}
                      onClick={async () => {
                        setCustomModelTesting(true);
                        setCustomModelTestResult(null);
                        try {
                          const res = await fetch('/api/hermes/test-model', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ provider: customModelProvider, modelId: customModelId, apiKey: customModelApiKey }),
                          });
                          const data = await res.json();
                          setCustomModelTestResult({ ok: data.success, message: data.message || (data.success ? 'Conexión exitosa' : 'Falló la conexión') });
                        } catch (e: any) {
                          setCustomModelTestResult({ ok: false, message: `Error: ${e.message}` });
                        } finally {
                          setCustomModelTesting(false);
                        }
                      }}
                      className={`flex-1 border py-2 rounded text-[9px] uppercase font-bold transition flex items-center justify-center gap-1 ${
                        customModelProvider && customModelId && customModelApiKey && !customModelTesting
                          ? 'bg-cyan-950/50 hover:bg-cyan-900 border-cyan-700 text-cyan-300'
                          : 'bg-gray-900 border-gray-800 text-gray-700 cursor-not-allowed'
                      }`}
                    >
                      {customModelTesting ? (
                        <RotateCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Activity className="w-3 h-3" />
                      )}
                      Testear Conexión
                    </button>
                    <button
                      type="button"
                      disabled={!customModelName || !customModelId || !customModelProvider || !customModelApiKey || customModelAdding}
                      onClick={async () => {
                        setCustomModelAdding(true);
                        try {
                          const res = await fetch('/api/hermes/add-model', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              name: customModelName,
                              modelId: customModelId,
                              provider: customModelProvider,
                              apiKey: customModelApiKey,
                            }),
                          });
                          const data = await res.json();
                          if (res.ok) {
                            addLog('system', `Modelo "${customModelName}" agregado exitosamente.`);
                            setCustomModelName('');
                            setCustomModelId('');
                            setCustomModelApiKey('');
                            setCustomModelTestResult(null);
                            // Recargar lista de modelos
                            wssClient.getModels();
                          } else {
                            addLog('system', `Error al agregar modelo: ${data.error || 'Desconocido'}`);
                          }
                        } catch (e: any) {
                          addLog('system', `Error al agregar modelo: ${e.message}`);
                        } finally {
                          setCustomModelAdding(false);
                        }
                      }}
                      className={`flex-1 border py-2 rounded text-[9px] uppercase font-bold transition flex items-center justify-center gap-1 ${
                        customModelName && customModelId && customModelProvider && customModelApiKey && !customModelAdding
                          ? 'bg-amber-950/50 hover:bg-amber-900 border-amber-700 text-amber-300'
                          : 'bg-gray-900 border-gray-800 text-gray-700 cursor-not-allowed'
                      }`}
                    >
                      {customModelAdding ? (
                        <RotateCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Plus className="w-3 h-3" />
                      )}
                      Agregar Modelo
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <footer className="p-3 border-t border-amber-900/40 flex gap-2">
              <button
                type="button"
                onClick={() => setShowModelSettings(false)}
                className="flex-1 bg-cyan-950/50 hover:bg-cyan-900 border border-cyan-800 text-cyan-400 py-2 rounded text-[9px] uppercase font-bold transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={tempQuickSelection.length !== 3}
                onClick={async () => {
                  try {
                    wssClient.configQuickModels(tempQuickSelection);
                    setQuickModels(tempQuickSelection);
                    setShowModelSettings(false);
                    addLog('system', 'Configuración de modelos rápidos actualizada.');
                  } catch (e: any) {
                    addLog('system', `Error al guardar configuración: ${e.message}`);
                  }
                }}
                className={`flex-1 border py-2 rounded text-[9px] uppercase font-bold transition flex items-center justify-center gap-1 ${
                  tempQuickSelection.length === 3
                    ? 'bg-amber-950/50 hover:bg-amber-900 border-amber-700 text-amber-300'
                    : 'bg-gray-900 border-gray-800 text-gray-700 cursor-not-allowed'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Guardar
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* THREE PANELS RESPONSIVE WORKSPACE GRID */}
      <div className="grid grid-cols-12 gap-3 mb-3">
        
        {/* PANEL LEFT: VOICE CHAT & THOUGHT LOG CONSOLE */}
        <aside className="col-span-12 lg:col-span-4 xl:col-span-3 flex flex-col gap-3 order-2 lg:order-1">
          <section className="panel flex flex-col p-3 rounded-md">
            {/* Header Tabs with action indicators */}
            <header className="flex border-b border-cyan-950 mb-2 pb-1.5 justify-between items-center shrink-0">
              <div className="flex space-x-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('chat_history')}
                  className={`px-2 py-1 text-[9.5px] font-mono uppercase tracking-wider rounded border transition flex items-center gap-1 ${
                    activeTab === 'chat_history'
                      ? 'bg-cyan-500/10 text-cyan-200 border-cyan-500/50 font-bold glow-text'
                      : 'bg-transparent text-cyan-600 border-transparent hover:text-cyan-300'
                  }`}
                >
                  <MessageSquare className="w-3 h-3" />
                  CHAT
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('thought_engine')}
                  className={`px-2 py-1 text-[9.5px] font-mono uppercase tracking-wider rounded border transition flex items-center gap-1 ${
                    activeTab === 'thought_engine'
                      ? 'bg-cyan-500/10 text-cyan-200 border-cyan-500/50 font-bold glow-text'
                      : 'bg-transparent text-cyan-600 border-transparent hover:text-cyan-300'
                  }`}
                >
                  <Terminal className="w-3 h-3" />
                  PENSAR
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('agentic_core')}
                  className={`px-2 py-1 text-[9.5px] font-mono uppercase tracking-wider rounded border transition flex items-center gap-1 ${
                    activeTab === 'agentic_core'
                      ? 'bg-cyan-500/10 text-cyan-200 border-cyan-500/50 font-bold glow-text'
                      : 'bg-transparent text-cyan-600 border-transparent hover:text-cyan-300'
                  }`}
                >
                  <Cpu className="w-3 h-3" />
                  MÁTRICE
                </button>
                <button
                  type="button"
                  onClick={() => setShowSessions(v => !v)}
                  className={`px-2 py-1 text-[9.5px] font-mono uppercase tracking-wider rounded border transition flex items-center gap-1 ${
                    showSessions
                      ? 'bg-violet-500/10 text-violet-200 border-violet-500/50 font-bold glow-text'
                      : 'bg-transparent text-cyan-600 border-transparent hover:text-violet-300'
                  }`}
                  title="Lista de sesiones VPS (gateway :9119)"
                >
                  <History className="w-3 h-3" />
                  SESIONES
                </button>
                <button
                  type="button"
                  onClick={() => setShowFiles(v => !v)}
                  className={`px-2 py-1 text-[9.5px] font-mono uppercase tracking-wider rounded border transition flex items-center gap-1 ${
                    showFiles
                      ? 'bg-emerald-500/10 text-emerald-200 border-emerald-500/50 font-bold glow-text'
                      : 'bg-transparent text-cyan-600 border-transparent hover:text-emerald-300'
                  }`}
                  title="Explorador de archivos local (commands Tauri nativos)"
                >
                  <FolderOpen className="w-3 h-3" />
                  ARCHIVOS
                </button>
                <button
                  type="button"
                  onClick={() => setShowGit(v => !v)}
                  className={`px-2 py-1 text-[9.5px] font-mono uppercase tracking-wider rounded border transition flex items-center gap-1 ${
                    showGit
                      ? 'bg-amber-500/10 text-amber-200 border-amber-500/50 font-bold glow-text'
                      : 'bg-transparent text-cyan-600 border-transparent hover:text-amber-300'
                  }`}
                  title="Revisión git del repo local (commands Tauri nativos)"
                >
                  <GitBranch className="w-3 h-3" />
                  GIT
                </button>
              </div>
              {/* Fila 2 — Dashboard V2 */}
              <div className="flex space-x-1 mt-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('agentes')}
                  className={`px-2 py-1 text-[9.5px] font-mono uppercase tracking-wider rounded border transition flex items-center gap-1 ${
                    activeTab === 'agentes'
                      ? 'bg-emerald-500/10 text-emerald-200 border-emerald-500/50 font-bold glow-text'
                      : 'bg-transparent text-cyan-600 border-transparent hover:text-emerald-300'
                  }`}
                >
                  <Grid className="w-3 h-3" />
                  AGENTES
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('tareas')}
                  className={`px-2 py-1 text-[9.5px] font-mono uppercase tracking-wider rounded border transition flex items-center gap-1 ${
                    activeTab === 'tareas'
                      ? 'bg-amber-500/10 text-amber-200 border-amber-500/50 font-bold glow-text'
                      : 'bg-transparent text-cyan-600 border-transparent hover:text-amber-300'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  TAREAS
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('clientes')}
                  className={`px-2 py-1 text-[9.5px] font-mono uppercase tracking-wider rounded border transition flex items-center gap-1 ${
                    activeTab === 'clientes'
                      ? 'bg-purple-500/10 text-purple-200 border-purple-500/50 font-bold glow-text'
                      : 'bg-transparent text-cyan-600 border-transparent hover:text-purple-300'
                  }`}
                >
                  <Database className="w-3 h-3" />
                  CLIENTES
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('cron')}
                  className={`px-2 py-1 text-[9.5px] font-mono uppercase tracking-wider rounded border transition flex items-center gap-1 ${
                    activeTab === 'cron'
                      ? 'bg-rose-500/10 text-rose-200 border-rose-500/50 font-bold glow-text'
                      : 'bg-transparent text-cyan-600 border-transparent hover:text-rose-300'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  CRON
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('documentos')}
                  className={`px-2 py-1 text-[9.5px] font-mono uppercase tracking-wider rounded border transition flex items-center gap-1 ${
                    activeTab === 'documentos'
                      ? 'bg-sky-500/10 text-sky-200 border-sky-500/50 font-bold glow-text'
                      : 'bg-transparent text-cyan-600 border-transparent hover:text-sky-300'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  DOCS
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('graficas')}
                  className={`px-2 py-1 text-[9.5px] font-mono uppercase tracking-wider rounded border transition flex items-center gap-1 ${
                    activeTab === 'graficas'
                      ? 'bg-indigo-500/10 text-indigo-200 border-indigo-500/50 font-bold glow-text'
                      : 'bg-transparent text-cyan-600 border-transparent hover:text-indigo-300'
                  }`}
                >
                  <Activity className="w-3 h-3" />
                  GRÁFICAS
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (activeTab === 'chat_history') {
                    setChatMessages([
                      {
                        id: 'reset',
                        sender: 'nim',
                        text: 'Historial conversacional vaciado por orden externa. Memoria purgada.',
                        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                      }
                    ]);
                  } else {
                    setLogs([]);
                  }
                }}
                className="p-1 hover:bg-cyan-950/50 rounded text-cyan-500 transition-colors"
                title="Vaciar contenedor"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </header>

            {/* F2.2 — Indicador de sesión VPS reanudada */}
            {activeSession && activeTab === 'chat_history' && (
              <div className="flex items-center justify-between gap-2 mb-1.5 px-1.5 py-1 rounded border border-violet-500/30 bg-violet-500/5 shrink-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse flex-shrink-0"></span>
                  <span className="text-[8px] text-violet-300 font-bold uppercase tracking-wider flex-shrink-0 font-mono">
                    SESIÓN:
                  </span>
                  <span className="text-[8.5px] text-cyan-200 font-mono font-bold truncate">{activeSession.title}</span>
                  <span className="text-[7.5px] text-cyan-600 font-mono truncate hidden md:inline">{activeSession.id}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSession(null)}
                  className="p-0.5 hover:bg-violet-500/20 rounded text-violet-400 transition-colors flex-shrink-0"
                  title="Cerrar sesión activa"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* TAB CONTENT 1: CHAT COMPONENT */}
            {activeTab === 'chat_history' && (
              <div 
                ref={chatContainerRef}
                className="h-[300px] overflow-y-auto pr-1 space-y-3 custom-scrollbar text-xs"
              >
                {chatMessages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`flex flex-col max-w-[88%] ${
                      msg.sender === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 text-[8.5px] text-cyan-600 font-mono">
                      <span className="uppercase font-bold tracking-wider">
                        {msg.sender === 'user' ? 'SEÑOR' : 'NIM_CENTRAL'}
                      </span>
                      <span>•</span>
                      <span>{msg.timestamp}</span>
                      {msg.modelUsed && (
                        <>
                          <span>•</span>
                          <span className="text-amber-500 text-[8px] font-bold tracking-tight bg-amber-950/40 px-1 border border-amber-950/40 rounded-sm">
                            {msg.modelUsed}
                          </span>
                        </>
                      )}
                    </div>

                    <div className={`p-2.5 rounded-md border text-sm font-sans leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-cyan-500/5 text-cyan-200 border-cyan-800/40 rounded-tr-none'
                        : 'bg-[#091a2b]/80 text-cyan-100 border-cyan-600/30 rounded-tl-none glow-border'
                    }`}
                    dangerouslySetInnerHTML={{ __html: (() => {
                      let html = msg.text
                        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                        .replace(/```([\s\S]*?)```/g, '<pre style="background:#0a1929;padding:6px;border-radius:4px;overflow-x:auto;font-size:11px;margin:4px 0"><code>$1</code></pre>')
                        .replace(/`([^`]+)`/g, '<code style="background:#0a1929;padding:1px 4px;border-radius:3px;font-size:11px">$1</code>')
                        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
                        .replace(/\n/g, '<br/>');
                      return html;
                    })() }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* TAB CONTENT 2: LOG COGNITIVE PROCESS TRACKS */}
            {activeTab === 'thought_engine' && (
              <div 
                ref={logContainerRef}
                className="h-[300px] overflow-y-auto pr-1 space-y-2 custom-scrollbar text-xs font-mono"
              >
                {logs.length === 0 ? (
                  <div className="italic text-cyan-700/60 text-center py-6">
                    Bandeja vacía. Envíe comandos o pruebe las habilidades para ver el razonamiento interno de NIM.
                  </div>
                ) : (
                  logs.map((log) => {
                    let classType = 'system-log';
                    if (log.type === 'thought') classType = 'thought-log';
                    if (log.type === 'action') classType = 'action-log';
                    if (log.type === 'observation') classType = 'observation-log';
                    if (log.type === 'response') classType = 'response-log';
                    if (log.type === 'user') classType = 'user-log';

                    return (
                      <article key={log.id} className={`log-entry ${classType} flex flex-col space-y-0.5 border-l-2 bg-gradient-to-r from-cyan-950/10 to-transparent p-1.5 px-2.5`}>
                        <div className="flex justify-between text-[8px] opacity-45 leading-none mb-0.5">
                          <span className="uppercase font-bold tracking-widest">{log.type}</span>
                          <span>{log.timestamp}</span>
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed text-[11px]">{log.message}</p>
                      </article>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB CONTENT 3: MATRICE — EDITOR DE SOUL DOCS + MCP STATUS */}
            {activeTab === 'agentic_core' && (
              <div className="h-[300px] overflow-y-auto pr-1 space-y-3 custom-scrollbar text-xs">
                
                {/* HUMAN BLOCK */}
                <div className="border border-cyan-950/40 bg-cyan-950/10 p-2 rounded">
                  <div className="flex justify-between items-center mb-1 pb-1 border-b border-cyan-950/30">
                    <span className="font-bold tracking-wider text-cyan-400 text-[9px] uppercase font-mono">
                      HUMAN BLOCK — Cómo Hermes se refiere al Señor
                    </span>
                    <div className="flex gap-1">
                      <button onClick={() => setExpandedBlock('human')} className="p-0.5 hover:bg-cyan-500/20 rounded text-cyan-400" title="Expandir">
                        <Maximize2 className="w-3 h-3" />
                      </button>
                      <button
                      onClick={() => {
                        if (window.confirm('¿Confirmas cambiar cómo Hermes se refiere a ti?')) {
                          setSoulSaving('human');
                          wssClient.updateSoul('human', soulHuman);
                          setSoulSaving(null);
                          addLog('system', 'Matrice Soul: Human Block actualizado vía WSS.');
                        }
                      }}
                      disabled={soulSaving === 'human'}
                      className="text-[8px] bg-cyan-500/10 text-cyan-200 border border-cyan-700/50 hover:bg-cyan-500/20 px-2 py-0.5 rounded uppercase font-mono font-bold disabled:opacity-50"
                    >
                      {soulSaving === 'human' ? 'GUARDANDO...' : 'GUARDAR'}
                    </button>
                  </div>
                  </div>
                  <textarea
                    value={soulHuman}
                    onChange={(e) => setSoulHuman(e.target.value)}
                    className="w-full text-[10px] p-1.5 bg-[#010912] border border-cyan-950 text-cyan-100 rounded focus:border-cyan-500 font-mono focus:outline-none resize-none"
                    rows={6}
                    placeholder="Describe quién eres para Hermes..."
                  />
                </div>

                {/* PERSONA BLOCK */}
                <div className="border border-cyan-950/40 bg-cyan-950/10 p-2 rounded">
                  <div className="flex justify-between items-center mb-1 pb-1 border-b border-cyan-950/30">
                    <span className="font-bold tracking-wider text-cyan-400 text-[9px] uppercase font-mono">
                      PERSONA BLOCK — Directriz de comportamiento del agente
                    </span>
                    <div className="flex gap-1">
                      <button onClick={() => setExpandedBlock('persona')} className="p-0.5 hover:bg-purple-500/20 rounded text-purple-400" title="Expandir">
                        <Maximize2 className="w-3 h-3" />
                      </button>
                      <button
                      onClick={() => {
                        if (window.confirm('¿Confirmas cambiar la directriz de comportamiento del agente?')) {
                          setSoulSaving('persona');
                          wssClient.updateSoul('persona', soulPersona);
                          setSoulSaving(null);
                          addLog('system', 'Matrice Soul: Persona Block actualizado vía WSS.');
                        }
                      }}
                      disabled={soulSaving === 'persona'}
                      className="text-[8px] bg-purple-500/10 text-purple-200 border border-purple-700/50 hover:bg-purple-500/20 px-2 py-0.5 rounded uppercase font-mono font-bold disabled:opacity-50"
                    >
                      {soulSaving === 'persona' ? 'GUARDANDO...' : 'GUARDAR'}
                    </button>
                  </div>
                  </div>
                  <textarea
                    value={soulPersona}
                    onChange={(e) => setSoulPersona(e.target.value)}
                    className="w-full text-[10px] p-1.5 bg-[#010912] border border-cyan-950 text-cyan-100 rounded focus:border-cyan-500 font-mono focus:outline-none resize-none"
                    rows={6}
                    placeholder="Define cómo debe comportarse el agente..."
                  />
                </div>

                {/* TASK BLOCK */}
                <div className="border border-cyan-950/40 bg-cyan-950/10 p-2 rounded">
                  <div className="flex justify-between items-center mb-1 pb-1 border-b border-cyan-950/30">
                    <span className="font-bold tracking-wider text-cyan-400 text-[9px] uppercase font-mono">
                      TASK BLOCK — Misión activa del agente
                    </span>
                    <div className="flex gap-1">
                      <button onClick={() => setExpandedBlock('task')} className="p-0.5 hover:bg-emerald-500/20 rounded text-emerald-400" title="Expandir">
                        <Maximize2 className="w-3 h-3" />
                      </button>
                      <button
                      onClick={() => {
                        if (window.confirm('¿Confirmas cambiar la misión activa del agente?')) {
                          setSoulSaving('task');
                          wssClient.updateSoul('task', soulTask);
                          setSoulSaving(null);
                          addLog('system', 'Matrice Soul: Task Block actualizado vía WSS.');
                        }
                      }}
                      disabled={soulSaving === 'task'}
                      className="text-[8px] bg-emerald-500/10 text-emerald-200 border border-emerald-700/50 hover:bg-emerald-500/20 px-2 py-0.5 rounded uppercase font-mono font-bold disabled:opacity-50"
                    >
                      {soulSaving === 'task' ? 'GUARDANDO...' : 'GUARDAR'}
                    </button>
                  </div>
                  </div>
                  <textarea
                    value={soulTask}
                    onChange={(e) => setSoulTask(e.target.value)}
                    className="w-full text-[10px] p-1.5 bg-[#010912] border border-cyan-950 text-cyan-100 rounded focus:border-cyan-500 font-mono focus:outline-none resize-none"
                    rows={6}
                    placeholder="Define la misión activa del agente..."
                  />
                </div>

                {/* INTEGRACIONES CONECTADAS */}
                <div className="border border-cyan-950/40 bg-cyan-950/10 p-2 rounded">
                  <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-cyan-950/30">
                    <Server className="w-3 h-3 text-cyan-400" />
                    <span className="font-bold tracking-wider text-cyan-400 text-[9px] uppercase font-mono">
                      INTEGRACIONES — {mcpServers.filter((s: any) => s.connected).length}/{mcpServers.length} activas
                    </span>
                  </div>
                  {mcpServers.length === 0 ? (
                    <div className="text-[9px] text-cyan-600/60 italic text-center py-3 font-mono">
                      Escaneando integraciones...
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar">
                      {mcpServers.map((srv: any, idx: number) => (
                        <div key={idx} className={`bg-[#010912] p-1.5 rounded border flex items-center justify-between ${srv.connected ? 'border-cyan-950/50' : 'border-cyan-950/20 opacity-60'}`}>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${srv.connected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-gray-600'}`} />
                            <div className="min-w-0">
                              <span className="text-cyan-200 font-bold text-[9px] block font-mono truncate">{srv.name}</span>
                              <span className="text-cyan-600 text-[7px] block font-mono truncate">{srv.detail || srv.type}</span>
                            </div>
                          </div>
                          <span className={`px-1.5 py-0.5 rounded text-[7px] font-bold uppercase font-mono border flex-shrink-0 ml-1 ${srv.connected ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-gray-500/10 text-gray-400 border-gray-500/30'}`}>
                            {srv.connected ? 'ON' : 'OFF'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* ═══ DASHBOARD V2 — NUEVOS PANELES ═══ */}

            {/* TAB: AGENTES — Visualización de agentes NIM */}
            {activeTab === 'agentes' && (
              <div className="h-[300px] overflow-y-auto pr-1 space-y-2 custom-scrollbar text-xs">
                <AgentesPanel />
              </div>
            )}

            {/* TAB: TAREAS — Gestión de tareas y procesos */}
            {activeTab === 'tareas' && (
              <div className="h-[300px] overflow-y-auto pr-1 space-y-2 custom-scrollbar text-xs">
                <TareasPanel />
              </div>
            )}

            {/* TAB: CLIENTES — Pipeline de prospección */}
            {activeTab === 'clientes' && (
              <div className="h-[300px] overflow-y-auto pr-1 space-y-2 custom-scrollbar text-xs">
                <ClientesPanel />
              </div>
            )}

            {/* TAB: CRON — Cron jobs */}
            {activeTab === 'cron' && (
              <div className="h-[300px] overflow-y-auto pr-1 space-y-2 custom-scrollbar text-xs">
                <CronPanel />
              </div>
            )}

            {/* TAB: DOCUMENTOS — Lector de documentos */}
            {activeTab === 'documentos' && (
              <div className="h-[300px] overflow-y-auto pr-1 space-y-2 custom-scrollbar text-xs">
                <DocumentosPanel />
              </div>
            )}

            {/* TAB: GRÁFICAS — Métricas y rendimiento */}
            {activeTab === 'graficas' && (
              <div className="h-[300px] overflow-y-auto pr-1 space-y-2 custom-scrollbar text-xs">
                <GraficasPanel />
              </div>
            )}

            <footer className="mt-2 text-[9px] text-cyan-600/70 font-mono flex items-center gap-1 shrink-0 border-t border-cyan-950/40 pt-2">
              <Activity className="w-3 h-3 text-cyan-500" />
              <span>Memoria activa del núcleo distribuida.</span>
            </footer>
          </section>

          {/* F2.2 — PANEL SESIONES VPS (gateway :9119) */}
          {showSessions && (
            <section className="panel p-3 rounded-md flex flex-col gap-2 max-h-[340px] overflow-hidden">
              <SessionList activeSessionId={activeSession?.id ?? null} onResume={handleResumeSession} />
            </section>
          )}

          {/* F2.3 — PANEL ARCHIVOS (explorador local vía Tauri) */}
          {showFiles && (
            <section className="panel p-3 rounded-md flex flex-col gap-2 max-h-[340px] overflow-hidden">
              <FileBrowser />
            </section>
          )}

          {/* F2.4 — PANEL GIT REVIEW (repo local vía Tauri) */}
          {showGit && (
            <section className="panel p-3 rounded-md flex flex-col gap-2 max-h-[340px] overflow-hidden">
              <GitReviewPane />
            </section>
          )}

          {/* TELEMETRY SUB-PANEL */}
          <section className="panel p-3 rounded-md shrink-0">
            <div className="flex items-center gap-2 mb-2 border-b border-cyan-950/60 pb-1.5">
              <Cpu className="text-cyan-400 w-3.5 h-3.5" />
              <h2 className="text-[10px] font-bold tracking-widest uppercase font-mono">TELEMETRÍA EN DIRECTO</h2>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="flex flex-col space-y-1">
                <div className="flex justify-between text-[9px]">
                  <span className="text-cyan-500">Latencia</span>
                  <span className="text-[#00f2ff] font-bold">{stats.latency}ms</span>
                </div>
                <div className="w-full bg-cyan-950/80 h-1 rounded-full overflow-hidden">
                  <div 
                    className="bg-cyan-400 h-full transition-all duration-300 animate-pulse" 
                    style={{ width: `${Math.min(100, (stats.latency / 60) * 100)}%` }}
                  ></div>
                </div>
              </div>

              <div className="flex flex-col space-y-1">
                <div className="flex justify-between text-[9px]">
                  <span className="text-cyan-500">Carga CPU</span>
                  <span className="text-[#00f2ff] font-bold">{stats.cpu}%</span>
                </div>
                <div className="w-full bg-cyan-950/80 h-1 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${stats.cpu > 70 ? 'bg-red-400' : 'bg-cyan-400'}`} 
                    style={{ width: `${stats.cpu}%` }}
                  ></div>
                </div>
              </div>

              <div className="flex flex-col">
                <span className="text-[8px] text-cyan-500/60 uppercase">Estado Red</span>
                <span className={`text-[10px] font-bold uppercase flex items-center gap-1.5 ${
                  stats.networkStatus === 'NOMINAL' ? 'text-green-400' : 
                  stats.networkStatus === 'DEGRADED' ? 'text-amber-400' : 'text-red-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    stats.networkStatus === 'NOMINAL' ? 'bg-green-500 animate-pulse' : 
                    stats.networkStatus === 'DEGRADED' ? 'bg-amber-500' : 'bg-red-500'
                  }`}></span>
                  {stats.networkStatus === 'NOMINAL' ? 'NOMINAL' : 
                   stats.networkStatus === 'DEGRADED' ? 'DEGRADADA' : 'SIN CONEXIÓN'}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-[8px] text-cyan-500/60 uppercase">Canales Memoria</span>
                <span className="text-cyan-200 text-[10px] truncate font-bold">{stats.memory}</span>
              </div>
            </div>
          </section>
        </aside>

        {/* PANEL CENTER: CORE NIM HUD, ACTIVE VOICE MICROPHONE & REACTS */}
        <main className="col-span-12 lg:col-span-4 xl:col-span-6 flex flex-col items-center justify-between relative p-4 order-1 lg:order-2 border border-cyan-950/40 bg-[#030d17]/40 rounded-xl min-h-[460px]">
          
          {/* Diagnostic status tag */}
          <div className="border border-cyan-900/60 bg-cyan-950/20 px-3 py-1 rounded-md flex items-center gap-2 font-mono text-[9px] tracking-widest uppercase mb-2 md:mb-2.5 selection:bg-cyan-900">
            <span className="text-cyan-500">ESTADO CORE:</span>
            {status === 'STANDBY' && (
              <span className="text-cyan-400 flex items-center gap-1 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                NIM EN RESERVA (STANDBY)
              </span>
            )}
            {status === 'LISTENING' && (
              <span className="text-amber-400 flex items-center gap-1 font-bold animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                ESCUCHANDO...
              </span>
            )}
            {status === 'THINKING' && (
              <span className="text-cyan-300 flex items-center gap-1 font-bold">
                <RotateCw className="w-3 h-3 animate-spin text-cyan-300" />
                PROCESANDO ORDEN
              </span>
            )}
            {status === 'SPEAKING' && (
              <span className="text-emerald-400 flex items-center gap-1 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                HABLANDO...
              </span>
            )}
            {status === 'ERROR' && (
              <span className="text-red-400 flex items-center gap-1 font-bold">
                <AlertTriangle className="w-3 h-3 animate-bounce" />
                ESTADO ALERTA
              </span>
            )}
          </div>

          {/* Glowing Arc Reactor HUD */}
          <div className="relative flex flex-col items-center justify-center p-1.5 md:p-2">
            <div className={`arc-core ${status.toLowerCase()}`}>
              <div className="ring ring-1"></div>
              <div className="ring ring-2"></div>
              <div className="ring ring-3"></div>
              <div 
                className="inner-core flex items-center justify-center cursor-pointer relative group" 
                onClick={() => {
                  speakText('Mis receptores cuánticos están operando perfectamente, Señor. Listo para servirle.');
                  addLog('system', 'Comprobación de altavoz de NIM manual en el núcleo de reactor.');
                }}
                title="Haga click para verificar audio de NIM"
              >
                <div className="absolute inset-0 bg-cyan-500/10 rounded-full opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white animate-pulse" />
                </div>
              </div>
            </div>

            {/* Reaction Title Descriptor */}
            <div className="mt-2 text-center space-y-1">
              <span className={`text-[10px] font-mono tracking-[0.35em] uppercase transition-all duration-200 block ${
                status === 'LISTENING' ? 'text-amber-400 font-bold glow-text-gold' :
                status === 'THINKING' ? 'text-cyan-300 font-bold animate-pulse' :
                status === 'SPEAKING' ? 'text-emerald-400 font-bold' :
                status === 'ERROR' ? 'text-red-400 font-bold' : 'text-cyan-400/80'
              }`}>
                {status === 'STANDBY' && 'NÚCLEO DE ASISTENCIA NIM'}
                {status === 'LISTENING' && 'CAPTANDO INTENSIDAD VOCAL'}
                {status === 'THINKING' && 'RESOLVIENDO DIRECTRICES DE CONCEPTO'}
                {status === 'SPEAKING' && 'EMITIENDO ONDA ACÚSTICA ORAL'}
                {status === 'ERROR' && 'NIM REQUIERE ACCIÓN DIAGNÓSTICA'}
              </span>

              {/* Responsive Frequency waves block */}
              <div className="flex items-end justify-center space-x-1 h-5 pt-0.5 opacity-80 max-w-[280px] mx-auto overflow-hidden">
                {spectrum.map((val, idx) => (
                  <div 
                    key={idx} 
                    className={`w-1 rounded-t transition-all duration-200 ${
                      status === 'ERROR' ? 'bg-red-500' :
                      status === 'LISTENING' ? 'bg-amber-400' :
                      status === 'THINKING' ? 'bg-cyan-400 animate-pulse' :
                      status === 'SPEAKING' ? 'bg-emerald-400' : 'bg-cyan-500/30'
                    }`} 
                    style={{ height: `${val / 2.2}px` }}
                  ></div>
                ))}
              </div>
            </div>
          </div>

          {/* LIVE AGENTIC REACT EXECUTION MONITOR OVERLAY */}
          {activeToolCall && (
            <section className="w-full bg-[#051421]/95 border border-amber-600/30 p-2.5 rounded-xl text-left shadow-[0_0_15px_rgba(245,158,11,0.1)] transition-all duration-300">
              <header className="flex justify-between items-center mb-1.5 border-b border-cyan-950 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${activeToolCall.status === 'executing' ? 'bg-amber-400' : 'bg-green-400'}`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${activeToolCall.status === 'executing' ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                  </span>
                  <span className="text-[9px] font-mono text-amber-400 font-bold uppercase tracking-widest">
                    RE-ACT BUCLE ACTIVO
                  </span>
                </div>
                <button 
                  onClick={() => setActiveToolCall(null)}
                  className="text-[8px] text-cyan-600 hover:text-white font-mono uppercase bg-black/40 px-1 border border-cyan-950 rounded"
                >
                  Ocultar
                </button>
              </header>

              <div className="text-[10px] font-mono space-y-1.5">
                <div>
                  <span className="text-cyan-500">ACCION:</span>{" "}
                  <span className="bg-amber-950/40 text-amber-300 font-bold p-0.5 rounded border border-amber-900/40 text-[9.5px]">
                    {activeToolCall.toolName.toUpperCase()}
                  </span>
                  <span className="text-[8.5px] text-neutral-500 ml-1.5">
                    Est: {activeToolCall.status.toUpperCase()}
                  </span>
                </div>

                <div className="bg-black/50 p-1.5 rounded border border-cyan-950 text-[9px] leading-relaxed max-h-[85px] overflow-y-auto custom-scrollbar">
                  <p className="text-[#00f2ff] font-bold text-[8px] tracking-widest uppercase mb-0.5">PARAMETROS EMITIDOS:</p>
                  <pre className="text-cyan-200 font-mono whitespace-pre-wrap">
                    {JSON.stringify(activeToolCall.parameters, null, 2)}
                  </pre>
                </div>

                {activeToolCall.observation && (
                  <div className="bg-emerald-950/20 p-1.5 rounded border border-emerald-900/30 text-[9px] leading-relaxed">
                    <p className="text-green-400 font-bold text-[8px] tracking-widest uppercase mb-0.5">OBSERVACION RETORNADA (CUERPO):</p>
                    <p className="text-green-100">{activeToolCall.observation}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* HUGE GLOWING MICROPHONE WORKSTATION (USER REQUESTED MIC BUTTON) */}
          <section className="w-full bg-[#04101a]/90 border border-cyan-805/30 p-2.5 md:p-3 rounded-xl flex flex-col items-center justify-center text-center shadow-[0_0_12px_rgba(0,242,255,0.05)] mt-1">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#00f2ff] mb-1 font-bold flex items-center gap-1.5 animate-pulse">
              <Mic className="w-3.5 h-3.5 text-cyan-400" />
              SISTEMA DE CONTROL DE VOZ NIM
            </span>
            <p className="text-[9px] text-cyan-500/75 font-mono mb-2">
              Haga click abajo para activar el micrófono y dictar comandos por voz directamente a NIM
            </p>

            <div className="relative flex items-center justify-center mb-2">
              {/* Dynamic pinging waves depending on status value */}
              {status === 'LISTENING' && (
                <div className="absolute w-16 h-16 rounded-full bg-amber-500/20 animate-ping"></div>
              )}
              {status === 'SPEAKING' && (
                <div className="absolute w-16 h-16 rounded-full bg-emerald-500/20 animate-ping"></div>
              )}
              {status === 'THINKING' && (
                <div className="absolute w-16 h-16 rounded-full bg-cyan-500/20 animate-pulse"></div>
              )}

              <button
                type="button"
                onClick={toggleListening}
                className={`w-12 h-12 rounded-full border-4 flex items-center justify-center cursor-pointer transition-all duration-300 ${
                  status === 'LISTENING' 
                    ? 'border-amber-400 bg-amber-500/20 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.5)] scale-110 animate-pulse' 
                    : status === 'SPEAKING' 
                    ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300 scale-105' 
                    : 'border-cyan-500 bg-[#061524] text-cyan-400 hover:border-[#00f2ff] hover:text-[#00f2ff] hover:shadow-[0_0_12px_rgba(0,242,255,0.25)] hover:scale-105'
                }`}
                title={status === 'LISTENING' ? 'Detener captura de voz' : 'Iniciar captura de voz'}
              >
                {status === 'LISTENING' ? (
                  <MicOff className="w-5 h-5" />
                ) : (
                  <Mic className="w-5 h-5" />
                )}
              </button>
            </div>

            <div className="text-[10px] font-mono uppercase font-bold text-center tracking-wide mt-1">
              {status === 'LISTENING' ? (
                <span className="text-amber-400 animate-pulse">● CAPTANDO SU VOZ... HABLE AHORA</span>
              ) : status === 'SPEAKING' ? (
                <span className="text-[#00ffe1]">● NIM ESTÁ RESPONDIENDO...</span>
              ) : (
                <span className="text-cyan-500">MICRÓFONO RECEPTOR LISTO</span>
              )}
            </div>

            {/* Continuous Wake Word Activation Switcher */}
            <div className="text-xs font-mono flex flex-col items-center gap-1 w-full bg-black/45 border border-cyan-950/80 p-2 rounded-md mt-2">
              <div className="flex justify-between items-center w-full">
                <span className="text-[9px] text-cyan-500 tracking-wider font-bold">FILTRO DE COINCIDENCIA CONTINUO "NIM":</span>
                <button
                  type="button"
                  onClick={toggleWakeWordMode}
                  className={`text-[8.5px] py-0.5 px-1.5 rounded border uppercase transition duration-200 ${
                    isWakeWordMode 
                      ? 'bg-amber-950/70 text-amber-400 border-amber-500/50 glow-text-gold font-bold' 
                      : 'bg-cyan-950/20 text-cyan-600 border-cyan-950'
                  }`}
                >
                  {isWakeWordMode ? 'ESCUCHANDO' : 'DESACTIVADO'}
                </button>
              </div>
              <p className="text-[9.5px] text-cyan-500/50 text-left w-full leading-tight">
                {isWakeWordMode 
                  ? 'Matriz continua activa. Pronuncie la palabra clave "NIM" seguida de su comando vocal para activar el robot.'
                  : 'Filtro continuo inactivo. Use el botón grande superior del micrófono o redacte abajo.'
                }
              </p>
            </div>
          </section>
        </main>

        {/* PANEL RIGHT: SKILLS DIRECT MANIPULATION WORKBOARD (PLAYGROUND CRUCIAL FOR MAKING SKILLS FUNCTIONAL) */}
        <aside className="col-span-12 lg:col-span-4 xl:col-span-3 flex flex-col gap-3 order-3">
          
          {/* SKILLS SETTINGS & PLAYGROUND DIRECT INTERACTION */}
          <section className="panel p-3 rounded-md flex flex-col justify-between">
            <div className="flex flex-col h-full overflow-hidden">
              <header className="flex items-center justify-between mb-1.5 border-b border-cyan-950 pb-1.5 shrink-0">
                <div className="flex items-center gap-2">
                  <Layers className="text-[#00f2ff] w-4 h-4" />
                  <h2 className="text-[10px] font-bold tracking-widest uppercase font-mono">
                    NEXO HABILIDADES (SKILLS)
                  </h2>
                </div>
                <div className="flex p-0.5 rounded border border-cyan-950 bg-black/45">
                  <span className="text-[8.5px] font-mono px-1 text-cyan-400 uppercase font-bold">
                    CONNECTED: {skills.filter(s => s.isEnabled).length}
                  </span>
                </div>
              </header>

              {/* Grid of skills list switcher — scrollable */}
              <div className="grid grid-cols-2 gap-1 text-xs font-mono mb-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-0.5">
                {skills.map((skill) => {
                  const isSelect = skill.id === selectedSkillId;
                  return (
                    <button
                      key={skill.id}
                      onClick={() => setSelectedSkillId(skill.id)}
                      className={`border p-1 rounded text-left transition relative flex flex-col justify-between gap-0.5 h-[44px] ${
                        isSelect 
                          ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_8px_rgba(0,242,255,0.1)] font-bold' 
                          : 'border-cyan-950 bg-[#040e17]/50 hover:bg-[#071726]'
                      }`}
                    >
                      <div className="flex justify-between items-start w-full gap-1">
                        <span className={`text-[9.5px] truncate ${isSelect ? 'text-white' : 'text-cyan-400/80'}`}>
                          {skill.name}
                        </span>
                        
                        {/* Status light lamp */}
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          !skill.isEnabled ? 'bg-neutral-600' :
                          skill.status === 'Activa' ? 'bg-green-400 animate-pulse' :
                          skill.status === 'Inactiva' ? 'bg-neutral-400' : 'bg-red-500 animate-bounce'
                        }`}></span>
                      </div>

                      <div className="flex items-end justify-between w-full leading-none">
                        <div className="flex gap-1 items-center">
                          {skill.environment && (
                            <span className={`text-[7px] leading-none px-1 py-0.5 rounded font-bold ${
                              skill.environment === 'PC' ? 'bg-blue-900 text-blue-300 border border-blue-700/50' :
                              'bg-purple-900 text-purple-300 border border-purple-700/50'
                            }`}>
                              {skill.environment}
                            </span>
                          )}
                          <span className={`text-[7.5px] leading-none px-1 py-0.5 rounded ${
                            !skill.isEnabled ? 'bg-neutral-950 text-neutral-500' :
                            skill.status === 'Activa' ? 'bg-emerald-950/60 text-green-400 border border-emerald-900/60' :
                            skill.status === 'Inactiva' ? 'bg-neutral-900 text-neutral-400' : 'bg-red-950/60 text-red-400'
                          }`}>
                            {skill.isEnabled ? skill.status.toUpperCase() : 'OFFLINE'}
                          </span>
                        </div>
                        <span className="text-[7px] text-cyan-500/50">{skill.callCount} Ticks</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* ACTIVE SELECTED SKILL WORKSTATION INSPECTOR & THE CRUCIAL REAL-TIME PLAYGROUND INTEGRATION */}
              <div className="bg-[#05111c]/90 border border-cyan-950 p-2.5 rounded text-xs font-mono h-[300px] overflow-y-auto custom-scrollbar flex flex-col justify-between mb-1">
                <div className="space-y-2 pb-2">
                  <div className="flex justify-between items-center border-b border-cyan-950/60 pb-1.5">
                    <h3 className="text-amber-400 font-bold uppercase tracking-wider text-[9.5px] flex items-center gap-1">
                      <Grid className="w-3.5 h-3.5" />
                       NODO: {selectedSkill.name}
                    </h3>
                    <div className="flex items-center gap-1 select-none">
                      <span className="text-[8px] text-cyan-600 uppercase">ENLACE:</span>
                      <button
                        type="button"
                        onClick={() => handleToggleSkillEnabled(selectedSkill.id)}
                        className="p-0.5"
                      >
                        {selectedSkill.isEnabled ? (
                          <ToggleRight className="w-5 h-5 text-green-400" />
                        ) : (
                          <ToggleLeft className="w-5 h-5 text-neutral-600" />
                        )}
                      </button>
                    </div>
                  </div>

                  <p className="text-cyan-200 text-[10.5px] leading-snug">
                    {selectedSkill.description}
                  </p>
                </div>

                {/* THE SYSTEM PLAYGROUND WORKOUT LAB: ACTUALLY EXECUTES REAL COGNITIVE ACTIONS AND REPORTS SOUND */}
                <div className="border-t border-cyan-900/40 pt-2 bg-gradient-to-t from-black/25 to-transparent rounded-lg p-2 mt-2">
                  <header className="flex justify-between items-center mb-2">
                    <span className="text-[9px] text-amber-400 font-bold uppercase tracking-wider">LABORATORIO DE PRUEBAS DE NIM</span>
                    <span className="text-[8px] text-green-400 animate-pulse uppercase">Modo Activo</span>
                  </header>

                  {/* Dynamic widgets depending on which skill ID is selected */}
                  {selectedSkill.id === 'web_search' && (
                    <div className="space-y-2">
                      <div className="space-y-1.5">
                        <input 
                          type="text" 
                          value={playSearchQuery}
                          onChange={(e) => setPlaySearchQuery(e.target.value)}
                          className="w-full bg-[#030c14] border border-cyan-950 rounded px-1.5 py-1 text-[10px] text-cyan-100 outline-none focus:border-cyan-400"
                          placeholder="Buscar término en la red..."
                        />
                        <button
                          type="button"
                          onClick={() => handleExecuteSkillPlayground('web_search')}
                          disabled={!selectedSkill.isEnabled || playSearchLoading}
                          className="w-full bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-800 text-cyan-200 hover:text-white px-2 py-1 text-[10px] rounded uppercase font-bold transition flex items-center justify-center gap-1 disabled:opacity-40"
                        >
                          <Globe className="w-3.5 h-3.5 animate-spin-slow" />
                          {playSearchLoading ? 'BUSCANDO ADQUISICIÓN...' : 'BUSCAR EN LA WEB'}
                        </button>
                      </div>

                      {webSearchResults && (
                        <div className="mt-2 text-[9.5px] border-t border-cyan-950/80 pt-2 space-y-2 font-mono">
                          <div className="flex justify-between items-center text-[8.5px] text-amber-400 font-bold uppercase tracking-wider">
                            <span>📰 DESPACHOS DE PRENSA EN TIEMPO REAL:</span>
                            <button 
                              type="button"
                              onClick={() => setWebSearchResults(null)}
                              className="text-red-400 hover:text-red-300 underline font-bold"
                            >
                              [X CLEAR]
                            </button>
                          </div>

                          <div className="bg-[#030d17] border border-cyan-950 p-2 rounded leading-snug text-cyan-200 italic">
                            <span className="text-amber-500 font-bold not-italic block text-[8px] tracking-widest uppercase mb-0.5">SÍNTESIS DE NIM:</span>
                            "{webSearchResults.summary}"
                          </div>

                          {/* Render Categories dynamically */}
                          <div className="space-y-1.5">
                            {webSearchResults.categories?.map((cat: any, cIdx: number) => (
                              <div key={cIdx} className="bg-cyan-950/10 border border-cyan-950/40 rounded p-1.5">
                                <h4 className="text-cyan-400 font-bold uppercase text-[8.5px] tracking-wide border-b border-cyan-900/20 pb-0.5 mb-1.5 flex items-center gap-1">
                                  <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse"></span>
                                  {cat.categoryName}
                                </h4>
                                <ul className="space-y-1 text-[9px] text-slate-300 list-none pl-0 leading-snug">
                                  {cat.findings?.map((item: string, iIdx: number) => {
                                    // Make tags like [CNN] or [Reuters] bold and highlighted
                                    const parts = item.split(']');
                                    if (parts.length > 1 && parts[0].startsWith('[')) {
                                      const tag = parts[0].substring(1);
                                      const text = parts.slice(1).join(']');
                                      return (
                                        <li key={iIdx} className="flex gap-1.5 items-start">
                                          <span className="text-[7px] text-[#00f2ff] font-bold bg-cyan-950/70 border border-cyan-900/30 px-1 py-0.2 rounded leading-none mt-0.5 tracking-wider uppercase font-mono">{tag}</span>
                                          <span className="flex-1">{text.trim()}</span>
                                        </li>
                                      );
                                    }
                                    return (
                                      <li key={iIdx} className="flex gap-1 items-start">
                                        <span className="text-[#00f2ff]">▪</span>
                                        <span className="flex-1">{item}</span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedSkill.id === 'file_sys' && (
                    <div className="space-y-2">
                      <div className="text-[9.5px] text-cyan-400/80 leading-snug space-y-1.5 font-mono bg-[#030c14] border border-cyan-950/70 p-2 rounded">
                        <div className="border-b border-cyan-900/30 pb-1.5 mb-1.5">
                          <p className="text-amber-500 font-bold text-[8px] uppercase tracking-wider mb-1">💻 ESTACIÓN DEL SEÑOR (CLIENTE):</p>
                          <p className="truncate">■ S.O: <span className="text-[#00f2ff] font-bold">{detectSystemInfo().os}</span></p>
                          <p className="truncate">■ Navegador: <span className="text-cyan-200">{detectSystemInfo().browser}</span></p>
                          <p className="truncate">■ Procesador: <span className="text-cyan-200">{detectSystemInfo().cores} Núcleos Lógicos</span></p>
                          <p className="truncate">■ RAM Estimada: <span className="text-cyan-200">{detectSystemInfo().memory} GB</span></p>
                        </div>
                        <div>
                          <p className="text-amber-500 font-bold text-[8px] uppercase tracking-wider mb-1">☁️ ENTORNO REMOTO (SERVIDOR CLOUD):</p>
                          {serverSysInfo ? (
                            <div className="space-y-0.5">
                              <p className="truncate">■ Host S.O: <span className="text-green-400 font-bold">{serverSysInfo.platform} [{serverSysInfo.arch}]</span></p>
                              <p className="truncate">■ CPU Cores: <span className="text-cyan-200">{serverSysInfo.cpus} vCPU</span></p>
                              <p className="truncate">■ RAM Libre / Total: <span className="text-cyan-200">{serverSysInfo.freeMemory} / {serverSysInfo.totalMemory}</span></p>
                              <p className="truncate">■ Node.js Versión: <span className="text-cyan-200">{serverSysInfo.nodeVersion}</span></p>
                            </div>
                          ) : (
                            <p className="text-neutral-500 italic text-[8px] leading-relaxed">Sincronice el nodo agéntico para leer la arquitectura de la nube...</p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleExecuteSkillPlayground('file_sys')}
                        disabled={!selectedSkill.isEnabled}
                        className="w-full bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-800 text-cyan-200 hover:text-white px-2 py-1 text-[10px] rounded uppercase font-bold transition flex items-center justify-center gap-1 disabled:opacity-40"
                      >
                        <Server className="w-3.5 h-3.5" />
                        AUDITAR ENTORNO Y ARCHIVOS
                      </button>
                    </div>
                  )}

                  {selectedSkill.id === 'home_auto' && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-1.5 text-[9px] font-mono mb-1">
                        <button 
                          onClick={() => setIotLights(!iotLights)}
                          className={`p-1 border rounded text-center truncate ${iotLights ? 'bg-emerald-950 border-emerald-800 text-green-300' : 'bg-red-950 border-red-900 text-red-300'}`}
                        >
                          Iluminación: {iotLights ? 'LUZ MÁXIMA' : 'LUZ TENUE'}
                        </button>
                        <button 
                          onClick={() => setIotCoreFan(!iotCoreFan)}
                          className={`p-1 border rounded text-center truncate ${iotCoreFan ? 'bg-emerald-950 border-emerald-800 text-green-300' : 'bg-neutral-900 border-cyan-950 text-cyan-500'}`}
                        >
                          Ventilador: {iotCoreFan ? 'ENCENDIDO' : 'APAGADO'}
                        </button>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between text-[8px] font-mono text-cyan-500">
                          <span>POTENCIA DEL ESCUDO ESCALO:</span>
                          <span>{iotShield}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          value={iotShield}
                          onChange={(e) => setIotShield(Number(e.target.value))}
                          className="w-full bg-cyan-950 accent-cyan-400 cursor-pointer h-1.5 rounded-full"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleExecuteSkillPlayground('home_auto')}
                        disabled={!selectedSkill.isEnabled}
                        className="w-full bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-800 text-cyan-100 px-2 py-1 text-[10px] rounded uppercase font-bold transition flex items-center justify-center gap-1 disabled:opacity-40"
                      >
                        <Settings className="w-3.5 h-3.5 animate-spin-slow" />
                        SOPORTAR CAMBIO EN EL LABORATORIO
                      </button>
                    </div>
                  )}

                  {selectedSkill.id === 'vision_ai' && (
                    <div className="space-y-2">
                      {/* Visual camera feed display block */}
                      <div className={`border border-cyan-950 h-16 rounded bg-black relative overflow-hidden flex flex-col justify-between p-1 select-none ${
                        camFilter === 'THERMAL' ? 'bg-red-950/40 text-red-400 border-red-900' :
                        camFilter === 'INFRARED' ? 'bg-green-950/40 text-green-400 border-green-900' :
                        camFilter === 'SPECTRUM' ? 'bg-purple-950/40 text-purple-400 border-purple-900' : 'bg-cyan-950/40 text-cyan-400'
                      }`}>
                        {scanningBiometrics && <div className="absolute top-0 left-0 w-full bg-red-500 h-0.5 animate-bounce"></div>}
                        <div className="flex justify-between text-[8px]">
                          <span>FILTRO: {camFilter}</span>
                          <span className="text-red-500 animate-pulse">● CAM_02b</span>
                        </div>
                        <div className="text-[9px] text-center uppercase tracking-widest font-bold">
                          {scanningBiometrics ? 'ANALIZANDO RETINA BIOMÉTRICA...' : 'VISTA ÓPTICA DISPONIBLE'}
                        </div>
                        <div className="flex justify-end gap-1 text-[7px]">
                          <button onClick={() => setCamFilter('NORMAL')} className="bg-black/80 px-1 border border-cyan-900 hover:text-white rounded">NORM</button>
                          <button onClick={() => setCamFilter('THERMAL')} className="bg-black/80 px-1 border border-red-900 hover:text-white rounded">TERMIC</button>
                          <button onClick={() => setCamFilter('INFRARED')} className="bg-black/80 px-1 border border-green-900 hover:text-white rounded">INFRARR</button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleExecuteSkillPlayground('vision_ai')}
                        disabled={!selectedSkill.isEnabled || scanningBiometrics}
                        className="w-full bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-800 text-cyan-100 px-2 py-1 text-[10px] rounded uppercase font-bold transition flex items-center justify-center gap-1 disabled:opacity-40"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        INICIAR ESCANEO DE COINCIDENCIAS
                      </button>
                    </div>
                  )}

                  {selectedSkill.id === 'weather_api' && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center gap-2">
                        <select 
                          value={weatherCity}
                          onChange={(e) => setWeatherCity(e.target.value)}
                          className="bg-[#030c14] border border-cyan-950 select-none text-[10px] text-cyan-200 outline-none rounded p-1 flex-1 cursor-pointer"
                        >
                          <option value="Sede NIM (Malibú)">Sede NIM (Malibú)</option>
                          <option value="Torre Stark (N.Y.)">Torre Stark (N.Y.)</option>
                          <option value="Estación Estelar NIM">Estación Estelar NIM</option>
                        </select>
                      </div>
                      <div className="text-[10px] font-mono grid grid-cols-3 gap-1 bg-[#010910] text-[#00f2ff]/60 border border-cyan-950 rounded p-1.5">
                        <div className="flex flex-col text-center">
                          <span>TEMPER</span>
                          <span className="text-white font-bold">{weatherData.temp}°C</span>
                        </div>
                        <div className="flex flex-col text-center border-x border-cyan-950">
                          <span>ESTADO</span>
                          <span className="text-amber-400 font-bold truncate leading-snug">{weatherData.hud}</span>
                        </div>
                        <div className="flex flex-col text-center">
                          <span>VIENTO</span>
                          <span className="text-white font-bold">{weatherData.wind} KT</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleExecuteSkillPlayground('weather_api')}
                        disabled={!selectedSkill.isEnabled}
                        className="w-full bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-800 text-cyan-200 hover:text-white px-2 py-1 text-[10px] rounded uppercase font-bold transition flex items-center justify-center gap-1 disabled:opacity-40"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        REDIRECCIÓN TELEMÉTRICA AMBIENTAL
                      </button>
                    </div>
                  )}

                  {selectedSkill.id === 'math_tool' && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="flex flex-col">
                          <label className="text-cyan-600 font-bold text-[8px] uppercase">Giro Reactor A:</label>
                          <input 
                            type="number" 
                            value={mathA}
                            onChange={(e) => setMathA(Number(e.target.value))}
                            className="bg-[#030c14] border border-cyan-950 p-1 rounded text-white"
                          />
                        </div>
                        <div className="flex flex-col">
                          <label className="text-cyan-600 font-bold text-[8px] uppercase">Bobinas B (Tesla):</label>
                          <input 
                            type="number" 
                            value={mathB}
                            onChange={(e) => setMathB(Number(e.target.value))}
                            className="bg-[#030c14] border border-cyan-950 p-1 rounded text-white"
                          />
                        </div>
                      </div>
                      {mathCalculationOutput && (
                        <div className="text-[8.5px] bg-[#020b12] border border-cyan-950 rounded p-1 leading-snug text-amber-500 font-mono truncate">
                          {mathCalculationOutput}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleExecuteSkillPlayground('math_tool')}
                        disabled={!selectedSkill.isEnabled}
                        className="w-full bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-800 text-cyan-200 hover:text-white px-2 py-1 text-[10px] rounded uppercase font-bold transition flex items-center justify-center gap-1 disabled:opacity-40"
                      >
                        <Cpu className="w-3.5 h-3.5" />
                        CORRELAR VECTOR FÍSICO
                      </button>
                    </div>
                  )}

                  {selectedSkill.id === 'self_improve' && (
                    <div className="space-y-2">
                      <div className="text-[9px] bg-[#020b12] border border-cyan-950 p-2 rounded leading-snug space-y-1 text-cyan-400">
                        <p className="text-amber-500 font-bold uppercase text-[8px] tracking-wider mb-1">PROGRAMACIÓN DE SUBMÓDULOS DE NIM:</p>
                        <p>■ Núcleo: <span className="text-white">Matriz agéntica ReAct</span></p>
                        <p>■ Estado de Compilador: <span className="text-emerald-400 font-bold animate-pulse">ONLINE [ESBUILD]</span></p>
                        <p className="text-[8px] text-cyan-600 italic">NIM puede auto-programarse. Pídale por Consola "NIM, crea una habilidad para conectarte con Spotify" para ver la metaprogramación autónoma.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          addLog('action', 'Ejecutando diagnóstico en caliente del compilador autómata de NIM...');
                          setTimeout(() => {
                            addLog('observation', 'Compilador OK: Listo para sintetizar clases TypeScript y esquemas JSON.');
                            speakText('Mi automejora en caliente está verificada y lista para compilar destrezas de software, Señor.');
                          }, 1000);
                        }}
                        disabled={!selectedSkill.isEnabled}
                        className="w-full bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-800 text-cyan-200 hover:text-white px-2 py-1 text-[10px] rounded uppercase font-bold transition flex items-center justify-center gap-1 disabled:opacity-40"
                      >
                        <Sparkles className="w-3.5 h-3.5 animate-spin-slow" />
                        TEST DE COMPILACIÓN NÚCLEO
                      </button>
                    </div>
                  )}

                  {selectedSkill.id === 'orchestrator' && (
                    <div className="space-y-2">
                      <div className="text-[9px] bg-[#020b12] border border-cyan-950 p-2 rounded leading-snug space-y-1 text-cyan-400">
                        <p className="text-amber-500 font-bold uppercase text-[8px] tracking-wider mb-1">TERMINAL DE ORQUESTACIÓN AGÉNTICA:</p>
                        <p>■ Estado: <span className="text-green-400 font-bold">MUTI-STEP READY</span></p>
                        <p>■ Pipeline: <span className="text-white">Bucle ReAct cerrado automodelado</span></p>
                        <p className="text-[8px] text-cyan-600 italic">Soporta la emisión y persistencia de llamadas de herramientas locales con control de hardware en tiempo real.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          addLog('action', 'Simulando ejecución multi-step en el orquestador NIM...');
                          setTimeout(() => {
                            addLog('observation', '[PASO 1] web_search exitosa. [PASO 2] math_tool exitosa. [PASO 3] home_auto completada.');
                            speakText('Orquestación multifase simulada con éxito, Señor.');
                          }, 1000);
                        }}
                        disabled={!selectedSkill.isEnabled}
                        className="w-full bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-800 text-cyan-200 hover:text-white px-2 py-1 text-[10px] rounded uppercase font-bold transition flex items-center justify-center gap-1 disabled:opacity-40"
                      >
                        <Terminal className="w-3.5 h-3.5" />
                        EJECUTAR PIPELINE SIMULADO
                      </button>
                    </div>
                )}
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {/* MANUAL HUD COMMAND INPUT FOOTER */}
      <footer className="panel p-1.5 shrink-0 flex flex-col md:flex-row items-center gap-1.5">
        <form onSubmit={handleFormSubmit} className="flex-1 w-full flex items-center bg-black/45 px-2.5 rounded-md">
          <label htmlFor="commandLine" className="text-[10px] font-bold text-amber-500 tracking-wider shrink-0 uppercase font-mono mr-2">
            CONSOLA NIM COMANDOS &gt;
          </label>
          <input
            id="commandLine"
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            className="flex-grow bg-transparent border-0 outline-none text-cyan-100 text-xs md:text-sm font-mono tracking-wide placeholder-cyan-950/50 py-1.5 md:py-2 selection:bg-cyan-700"
            placeholder="Escriba aquí (ej. 'NIM, haz una búsqueda de sistemas locales' o 'haz un informe climático')..."
          />
          <button
            type="submit"
            className="p-1.5 hover:bg-cyan-900/40 rounded text-cyan-400 hover:text-[#00f2ff] transition"
            title="Enviar comando"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        <div className="flex items-center space-x-2 shrink-0 select-none bg-black/20 p-2.5 border border-cyan-950/60 rounded">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span className="text-[9px] font-mono uppercase tracking-widest text-emerald-400 leading-none">
            ENLACE NIM ESTABLE
          </span>
        </div>
      </footer>

      {/* MONITOREO DE CUOTAS Y REGULACIONES POPUP MODAL — DATOS REALES */}
      {showQuotasModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in" id="portalQuotas">
          <div className="bg-[#020b12] border border-cyan-500/60 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col shadow-[0_0_25px_rgba(0,190,255,0.2)]">
            
            {/* Header */}
            <header className="flex items-center justify-between p-4 border-b border-cyan-900/55 bg-cyan-950/20">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-cyan-400 animate-pulse" />
                <div>
                  <h2 className="text-sm font-mono font-bold tracking-wider text-cyan-200 uppercase">
                    Centro de Control de Cuotas, Consumo y Regulaciones
                  </h2>
                  <p className="text-[9px] text-cyan-500 font-mono uppercase">
                    Portal de Telemetría Cognitiva Multicanal de NIM
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowQuotasModal(false)}
                className="text-cyan-500 hover:text-red-400 transition"
                title="Cerrar panel"
                type="button"
                id="closeQuotasBtn"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </header>

            {/* Content body */}
            <div className="p-4 space-y-4 text-xs font-mono text-cyan-100 flex-1">
              {/* Introduction / Metacritical guidance banner */}
              <div className="bg-amber-950/10 border border-amber-900/50 p-3 rounded text-[10px] sm:text-[11px] leading-relaxed relative overflow-hidden flex flex-col sm:flex-row gap-2.5 items-start sm:items-center">
                <div className="bg-amber-900/30 text-amber-400 font-bold p-1 rounded font-mono uppercase text-[9px] border border-amber-800 shrink-0">
                  Directiva Proactiva
                </div>
                <p className="text-cyan-300">
                  <strong>Señor:</strong> Este centro de mando muestra el modelo activo, el balance de DeepSeek y las API keys detectadas por el backend. Modelos sin clave aparecen deshabilitados.
                </p>
              </div>

              {/* Active Model Card */}
              <div className="bg-cyan-950/5 border border-cyan-400/60 p-3 rounded">
                <div className="flex justify-between items-center border-b border-cyan-950 pb-1.5 mb-2">
                  <span className="text-[11px] font-bold text-cyan-300 uppercase">Modelo Cognitivo Activo</span>
                  <span className="text-[8px] font-bold uppercase px-1 rounded bg-cyan-500/20 text-cyan-300">ACTIVO</span>
                </div>
                <div className="space-y-1 text-[9.5px]">
                  <div><span className="text-cyan-500 font-bold uppercase">Modelo:</span> <span className="text-cyan-100 font-mono">{activeModelName}</span></div>
                  <div><span className="text-cyan-500 font-bold uppercase">ID Técnico:</span> <span className="text-cyan-100 font-mono text-[9px]">{activeModel}</span></div>
                  <div><span className="text-cyan-500 font-bold uppercase">Proveedor:</span> <span className="text-cyan-100">{
                    (() => { const m = modelsList.find(x => x.id === activeModel); return (m?.provider || 'DESCONOCIDO').toUpperCase(); })()
                  }</span></div>
                  <div><span className="text-cyan-500 font-bold uppercase">Fortalezas:</span> <span className="text-cyan-100">{
                    (() => { const m = modelsList.find(x => x.id === activeModel); return m?.strengths || '—'; })()
                  }</span></div>
                  <div><span className="text-cyan-500 font-bold uppercase">Descripción:</span> <span className="text-cyan-100">{
                    (() => { const m = modelsList.find(x => x.id === activeModel); return m?.description || '—'; })()
                  }</span></div>
                </div>
              </div>

              {/* API Keys Status Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {['deepseek', 'gemini', 'anthropic', 'openai'].map((prov) => {
                  const keyOk = hasKeys[prov] ?? false;
                  const providerColors: Record<string, { border: string; bg: string; text: string; label: string }> = {
                    deepseek: { border: 'border-cyan-500/40', bg: 'bg-cyan-950/10', text: 'text-cyan-300', label: 'DEEPSEEK API' },
                    gemini: { border: 'border-amber-500/40', bg: 'bg-amber-950/10', text: 'text-amber-300', label: 'GEMINI AI STUDIO' },
                    anthropic: { border: 'border-purple-500/40', bg: 'bg-purple-950/10', text: 'text-purple-300', label: 'ANTHROPIC CONSOLE' },
                    openai: { border: 'border-green-500/40', bg: 'bg-green-950/10', text: 'text-green-300', label: 'OPENAI PLATFORM' },
                  };
                  const colors = providerColors[prov];
                  return (
                    <div key={prov} className={`border ${colors.border} ${colors.bg} p-3 rounded flex flex-col justify-between ${!keyOk ? 'opacity-50' : ''}`}>
                      <div>
                        <span className="text-[9px] font-bold uppercase block mb-1" style={{ color: colors.text.split('text-')[1]?.replace('-300', '-400') }}>
                          {colors.label}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {keyOk ? (
                            <><CheckCircle2 className="w-4 h-4 text-green-400" /><span className="text-green-400 font-bold text-[10px]">CONFIGURADA</span></>
                          ) : (
                            <><XCircle className="w-4 h-4 text-red-500" /><span className="text-red-500 font-bold text-[10px]">SIN KEY</span></>
                          )}
                        </div>
                      </div>
                      {prov === 'deepseek' && quotaData?.deepseekBalance && (
                        <div className="mt-2 pt-1.5 border-t border-cyan-950/40 text-[8.5px]">
                          <span className="text-cyan-500 block">Saldo DeepSeek:</span>
                          {quotaData.deepseekBalance.balance_infos?.map((info: any, idx: number) => (
                            <span key={idx} className="text-emerald-300 font-bold">${parseFloat(info.total_balance).toFixed(2)} {info.currency}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Quick Models Info */}
              <div className="bg-[#030d17] border border-cyan-950 p-3 rounded">
                <h3 className="text-cyan-300 font-bold uppercase text-[11px] flex items-center gap-1.5 border-b border-cyan-950 pb-1.5 mb-2">
                  <Grid className="w-3.5 h-3.5 text-amber-400" />
                  Modelos en Acceso Rápido (Quick Models)
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {quickModels.map((modelId) => {
                    const model = modelsList.find(m => m.id === modelId);
                    return (
                      <div key={modelId} className="bg-black/40 border border-cyan-950/40 p-2 rounded text-[9px]">
                        <span className="text-cyan-300 font-bold block">{model?.name || modelId}</span>
                        <span className="text-cyan-600 block text-[7.5px]">{model?.provider?.toUpperCase() || '—'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Advanced controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="bg-[#030d17] border border-cyan-950 p-3 rounded">
                  <h3 className="text-cyan-300 font-bold lowercase tracking-wide text-[11px] uppercase flex items-center gap-1.5 border-b border-cyan-950 pb-1.5 mb-2">
                    <Settings className="w-3.5 h-3.5 text-amber-400" />
                    Acceso Rápido a Configuración
                  </h3>
                  <p className="text-[9px] text-cyan-400 mb-3 leading-relaxed">
                    Use el engranaje junto a los botones de modelo para elegir qué 3 modelos aparecen en la barra de acceso rápido.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuotasModal(false);
                      setTimeout(() => {
                        setTempQuickSelection([...quickModels]);
                        setShowModelSettings(true);
                      }, 150);
                    }}
                    className="w-full bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-300 hover:text-white py-1 rounded text-[9px] uppercase font-bold transition flex items-center justify-center gap-1"
                  >
                    <Settings className="w-3 h-3 text-amber-400" />
                    ABRIR CONFIGURACIÓN DE MODELOS
                  </button>
                </div>

                <div className="bg-[#030d17] border border-cyan-950 p-3 rounded flex flex-col justify-between">
                  <div>
                    <h3 className="text-cyan-300 font-bold lowercase tracking-wide text-[11px] uppercase flex items-center gap-1.5 border-b border-cyan-950 pb-1.5 mb-2">
                      <Activity className="w-3.5 h-3.5 text-green-400" />
                      Estado del Backend Hermes
                    </h3>
                    <p className="text-[9px] text-cyan-400 mb-3 leading-relaxed">
                      El endpoint /api/hermes/quota proporciona métricas en tiempo real del backend.
                    </p>
                  </div>
                  <div className="space-y-1 text-[9px]">
                    <div className="flex justify-between">
                      <span className="text-cyan-500">Modelo activo:</span>
                      <span className="text-cyan-100">{quotaData?.activeModel || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-cyan-500">Proveedor:</span>
                      <span className="text-cyan-100">{quotaData?.activeProvider || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-cyan-500">DeepSeek Balance:</span>
                      <span className="text-emerald-400">{quotaData?.deepseekBalance ? '✓ Disponible' : 'No consultado'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-cyan-500">Keys detectadas:</span>
                      <span className="text-cyan-100">{Object.values(hasKeys).filter(Boolean).length}/{Object.keys(hasKeys).length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <footer className="p-3 border-t border-cyan-900/50 bg-[#01090f] text-center text-[8.5px] text-cyan-600 font-mono">
              PORTAL DE GESTIÓN CORPORATIVA REGULATORIA NIM // HERMES BACKEND TELEMETRY 2026
            </footer>
          </div>
        </div>
      )}

      {/* EXPAND MODAL — Editor de soul docs a pantalla semi-completa */}
      {expandedBlock && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4" onClick={() => setExpandedBlock(null)}>
          <div className="bg-[#020b12] border border-cyan-500/40 rounded-lg w-full max-w-4xl max-h-[85vh] flex flex-col shadow-[0_0_35px_rgba(0,242,255,0.1)]" onClick={e => e.stopPropagation()}>
            <header className="flex items-center justify-between p-4 border-b border-cyan-900/40 bg-cyan-950/20">
              <h2 className="text-sm font-mono font-bold tracking-wider text-cyan-200 uppercase">
                {expandedBlock === 'human' ? 'Human Block — Cómo Hermes se refiere al Señor' :
                 expandedBlock === 'persona' ? 'Persona Block — Directriz de comportamiento' :
                 'Task Block — Misión activa del agente'}
              </h2>
              <button onClick={() => setExpandedBlock(null)} className="text-cyan-500 hover:text-red-400 transition">
                <XCircle className="w-5 h-5" />
              </button>
            </header>
            <div className="p-4 flex-1 overflow-hidden">
              <textarea
                value={expandedBlock === 'human' ? soulHuman : expandedBlock === 'persona' ? soulPersona : soulTask}
                onChange={(e) => {
                  if (expandedBlock === 'human') setSoulHuman(e.target.value);
                  else if (expandedBlock === 'persona') setSoulPersona(e.target.value);
                  else setSoulTask(e.target.value);
                }}
                className="w-full h-full min-h-[400px] text-xs p-4 bg-[#010912] border border-cyan-950 text-cyan-100 rounded focus:border-cyan-500 font-mono focus:outline-none resize-none"
                placeholder="Escribe aquí..."
              />
            </div>
            <footer className="flex justify-end gap-2 p-4 border-t border-cyan-900/40">
              <button onClick={() => setExpandedBlock(null)} className="px-4 py-2 text-xs bg-cyan-950/50 border border-cyan-800 text-cyan-300 rounded hover:bg-cyan-900 font-mono uppercase">
                Cerrar
              </button>
              <button onClick={() => {
                if (window.confirm('¿Confirmas guardar los cambios?')) {
                  setSoulSaving(expandedBlock);
                  wssClient.updateSoul(expandedBlock as any, expandedBlock === 'human' ? soulHuman : expandedBlock === 'persona' ? soulPersona : soulTask);
                  setSoulSaving(null);
                  setExpandedBlock(null);
                }
              }} className="px-4 py-2 text-xs bg-cyan-500/20 border border-cyan-400 text-cyan-200 rounded hover:bg-cyan-500/30 font-mono uppercase font-bold">
                Guardar
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
