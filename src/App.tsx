import React, { useState, useEffect, useRef } from 'react';
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
  Hash
} from 'lucide-react';
import { Provider, SystemStatus, LogEntry, ChatMessage, Skill, Stats } from './types';

// Web Speech API for browser vocal compatibility
const SpeechRecognitionAPI = 
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export default function App() {
  // General State
  const [provider, setProvider] = useState<Provider>('gemini');
  const [status, setStatus] = useState<SystemStatus>('STANDBY');

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
  const [activeTab, setActiveTab] = useState<'thought_engine' | 'chat_history' | 'agentic_core'>('chat_history');

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

  const fetchCoreStatus = async () => {
    try {
      const res = await fetch('/api/agent-core/status');
      if (res.ok) {
        const data = await res.json();
        setCoreStatus(data);
        if (data.workingMemory) {
          setWmHuman(data.workingMemory.humanBlock);
          setWmPersona(data.workingMemory.personaBlock);
          setWmTask(data.workingMemory.taskBlock);
        }
        if (data.skills) {
          setSkills(prev => {
            const merged = [...prev];
            data.skills.forEach((bs: any) => {
              if (!merged.some(s => s.id === bs.id)) {
                merged.push({
                  id: bs.id,
                  name: bs.name.toUpperCase(),
                  status: 'Activa',
                  isEnabled: true,
                  description: bs.description,
                  callCount: 0
                });
              }
            });
            return merged;
          });
        }
      }
      // Async fetch second panel
      await fetchOnboardingAndMCP();
    } catch (err) {
      console.error('Failed to load agent-core status:', err);
    }
  };

  useEffect(() => {
    fetchCoreStatus();
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
  const previousQuotaStatus = useRef<any>(null);
  const autoSelectedProviderRef = useRef<boolean>(false);

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


  // Connected Skills State
  const [skills, setSkills] = useState<Skill[]>([
    { 
      id: 'web_search', 
      name: 'BÚSQUEDA WEB', 
      status: 'Activa', 
      isEnabled: true, 
      description: 'Exploración de datos e indexación global en tiempo real a través de las antenas satelitales cuánticas de NIM.', 
      callCount: 14 
    },
    { 
      id: 'file_sys', 
      name: 'SISTEMA LOCAL', 
      status: 'Activa', 
      isEnabled: true, 
      description: 'Acceso seguro al directorio real de la aplicación, análisis de código fuente y conteo de líneas de software.', 
      callCount: 8 
    },
    { 
      id: 'home_auto', 
      name: 'DOMÓTICA IoT', 
      status: 'Activa', 
      isEnabled: true, 
      description: 'Control de la red eléctrica, iluminación, ventiladores y el blindaje deflector del laboratorio operativo.', 
      callCount: 4 
    },
    { 
      id: 'vision_ai', 
      name: 'SISTEMA VISUAL', 
      status: 'Activa', 
      isEnabled: true, 
      description: 'Análisis biométrico facial de intrusos y control espectral de cámaras ópticas de seguridad.', 
      callCount: 22 
    },
    { 
      id: 'weather_api', 
      name: 'GEO-TIEMPO', 
      status: 'Activa', 
      isEnabled: true, 
      description: 'Consulta barométrica, humedad y telemetría atmosférica local administrada por satélites NIM.', 
      callCount: 5 
    },
    { 
      id: 'math_tool', 
      name: 'CÁLCULO ALGO', 
      status: 'Activa', 
      isEnabled: true, 
      description: 'Evaluaciones físicas vectoriales, trayectorias térmicas de reactor y simulación de flujos cuánticos.', 
      callCount: 12 
    },
    { 
      id: 'self_improve', 
      name: 'AUTOMEJORA', 
      status: 'Activa', 
      isEnabled: true, 
      description: 'Matriz cognitiva agéntica auto-mejorable que programa, compila y añade nuevas habilidades de software en caliente.', 
      callCount: 3 
    },
    { 
      id: 'orchestrator', 
      name: 'ORQUESTADOR', 
      status: 'Activa', 
      isEnabled: true, 
      description: 'Terminal emuladora del bucle cerrado ReAct (Claude Code/Antigravity) para secuenciar múltiples llamadas agénticas.', 
      callCount: 7 
    },
  ]);

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
        const res = await fetch('/api/system-info');
        if (!res.ok) return;
        const data = await res.json();
        
        const totalGB = parseFloat(data.totalMemory);
        const freeGB = parseFloat(data.freeMemory);
        const usedGB = (totalGB - freeGB).toFixed(2);

        setStats({
          latency: Math.floor(Math.random() * 6) + 9, // Local response latency
          cpu: data.cpuUsage,
          memory: `${usedGB} / ${data.totalMemory}`,
          networkStatus: 'NOMINAL'
        });
      } catch (err) {
        console.warn('System telemetry fetch failed:', err);
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

  // Poll of API rate limit state and restoration warnings
  useEffect(() => {
    const fetchQuotaStatus = async () => {
      try {
        const res = await fetch('/api/quota-status');
        if (!res.ok) return;
        const data = await res.json();
        setQuotaData(data);

        // Auto-detect and switch to the active API key on startup
        if (data && !autoSelectedProviderRef.current) {
          autoSelectedProviderRef.current = true;
          if (!data.gemini?.hasKey) {
            if (data.deepseek?.hasKey) {
              setProvider('deepseek');
              addLog('system', 'DETECCIÓN COGNITIVA: No se halló clave de Gemini. Conmutando automáticamente a DeepSeek (Canal Activo).');
            } else if (data.anthropic?.hasKey) {
              setProvider('anthropic');
              addLog('system', 'DETECCIÓN COGNITIVA: No se halló clave de Gemini. Conmutando automáticamente a Claude-3.5 (Canal Activo).');
            }
          }
        }

        // Detect if any provider recovered from suspension
        if (previousQuotaStatus.current) {
          const providers: Array<'gemini' | 'anthropic' | 'deepseek'> = ['gemini', 'anthropic', 'deepseek'];
          providers.forEach((prov) => {
            const prevSuspended = previousQuotaStatus.current[prov]?.suspendedUntil;
            const currentSuspended = data[prov]?.suspendedUntil;
            
            if (prevSuspended && !currentSuspended) {
              const msg = `RESTAURACIÓN COGNITIVA: El motor ${prov.toUpperCase()} se ha enfriado por completo y recuperó su funcionalidad óptima.`;
              addLog('system', msg);
              speakText(`Señor, le informo de que el motor ${prov.toUpperCase()} vuelve a estar completamente en línea y preparado para sus instrucciones.`);
              addChatMessage('nim', `Señor, le informo de que mi motor ${prov.toUpperCase()} ha restablecido sus relés cuánticos y ya se encuentra totalmente funcional.`);
            }
          });
        }
        previousQuotaStatus.current = data;
      } catch (err: any) {
        // Log gently as a warning since this runs on a continuous background interval
        // and can easily fail momentarily during normal development server rebuilds/restarts.
        console.warn('Conexión con el servidor NIM momentáneamente inactiva (Reintentando...):', err.message || err);
      }
    };

    fetchQuotaStatus();
    const interval = setInterval(fetchQuotaStatus, 3000);
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
      return;
    }

    // Siempre crear un recognition fresco antes de empezar
    const rec = createSpeechRecognition();
    if (!rec) {
      // Fallback simulado si no hay API
      setStatus('LISTENING');
      setOrbState('listening');
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
    } catch (e) {
      console.error('Error iniciando reconocimiento:', e);
      setStatus('STANDBY');
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
      modelUsed: sender === 'nim' ? provider.toUpperCase() : undefined
    };
    setChatMessages(prev => [...prev, newMessage]);
  };

  // Sound synthesis with reactive Energy Orb and custom muting integrations
  const speakText = (text: string) => {
    if (isMuted || ttsMuted || !('speechSynthesis' in window)) {
      setStatus('STANDBY');
      setOrbState('idle');
      return;
    }

    // Stop fast repeated speaking of identical segments
    if (lastSpokenRef?.current === text) return;
    if (lastSpokenRef) {
      lastSpokenRef.current = text;
    }

    const cleanTextForSpeech = (rawText: string) => {
      if (!rawText) return "";
      return rawText
        .replace(/```[\s\S]*?```/g, "")        // Remove code blocks entirely
        .replace(/\*\*([^*]+)\*\*/g, "$1")      // Remove bold formatting, speak the word
        .replace(/\*([^*]+)\*/g, "$1")          // Remove italics formatting
        .replace(/__([^_]+)__/g, "$1")          // Remove bold underscores
        .replace(/_([^_]+)_/g, "$1")            // Remove italic underscores
        .replace(/#+\s+/g, "")                  // Remove headers
        .replace(/^\s*[-*+]\s+/gm, "")          // Remove list bullets
        .replace(/^\s*\d+\.\s+/gm, "")          // Remove list numbers
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Remove markdown links, keep text
        .replace(/https?:\/\/[^\s]+/g, "")      // Remove raw URLs
        .replace(/---+/g, "")                   // Remove horizontal rules
        .replace(/[`*_~]/g, "")                 // Remove backticks, stray asterisks, underscores, tildes
        .replace(/[{}[\]]/g, "")                // Remove JSON braces and brackets
        .replace(/\n{2,}/g, ". ")               // Collapse multiple newlines into pauses
        .replace(/\n/g, " ")                    // Collapse single newlines
        .replace(/\s{2,}/g, " ")                // Collapse whitespace
        .trim();
    };

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanTextForSpeech(text));
    utterance.lang = 'es-ES';
    
    const voices = window.speechSynthesis.getVoices();
    const esVoice = voices.find(v => v.lang.startsWith('es-') && v.name.toLowerCase().includes('google')) || 
                    voices.find(v => v.lang.startsWith('es-')) || 
                    voices[0];
    
    if (esVoice) {
      utterance.voice = esVoice;
    }

    utterance.rate = 1.05; 
    utterance.pitch = 0.95; // Custom deep rich tone

    utterance.onstart = () => {
      setStatus('SPEAKING');
      setOrbState('speaking');
    };

    utterance.onend = () => {
      setStatus('STANDBY');
      setOrbState('idle');
    };

    utterance.onerror = () => {
      setStatus('STANDBY');
      setOrbState('idle');
    };

    speechUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
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
        const statusMsg = `NIM_CENTRAL STATUS:\n- Motor: ${provider}\n- Memoria HUD: ${stats.memory}\n- Skills: ${skills.length}\n- Uptime: OK`;
        addLog('system', statusMsg);
        addChatMessage('nim', statusMsg);
        return;
      } else {
        addLog('system', `[COMANDO DESCONOCIDO] El comando ${cmd} no está registrado.`);
        addChatMessage('nim', `Lo siento Señor, no reconozco el comando "${cmd}". Pruebe con /clear, /stop o /status.`);
        return;
      }
    }

    setStatus('THINKING');
    
    const activeSkillsList = skills
      .filter(s => s.isEnabled && s.status === 'Activa')
      .map(s => s.name);

    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptToSend,
          provider: provider,
          activeSkills: activeSkillsList,
          clientSystemInfo: detectSystemInfo(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP Error Status: ${response.status}`);
      }

      const data = await response.json();
      
      // Update Call Counts dynamically
      if (data.action) {
        const lowerAct = data.action.toLowerCase();
        setSkills(prev => prev.map(s => {
          if (lowerAct.includes(s.name.toLowerCase()) || lowerAct.includes(s.id.toLowerCase())) {
            return { ...s, callCount: s.callCount + 1 };
          }
          return s;
        }));
      }

      if (data.thought) {
        addLog('thought', `[PENSAMIENTO DE ${provider.toUpperCase()}] ${data.thought}`);
      }
      if (data.action) {
        addLog('action', `[ACCIÓN DILIGENTE] ${data.action}`);
      }
      if (data.observation) {
        addLog('observation', `[OBSERVACIÓN SENSOR] ${data.observation}`);
      }

      // SERVER-SIDE TOOL EXECUTION: Tools are executed by the server in the agentic loop.
      // The server returns the real observation and response after completing all steps.
      // We only update local UI state for IoT/vision widgets if the observation mentions them.
      if (data.observation && data.observation !== 'Ejecutado de forma directa sin herramientas adicionales.') {
        addLog('observation', `[OBSERVACIÓN REAL DEL SERVIDOR] ${data.observation}`);
      }

      // Always display the real response from the server
      if (data.response) {
        addLog('response', `NIM: "${data.response}"`);
        addChatMessage('nim', data.response);
        speakText(data.response);
      } else {
        setStatus('STANDBY');
      }

    } catch (e: any) {
      console.error(e);
      addLog('system', `Pérdida temporal de enlace cuántico NIM: ${e.message}`);
      setStatus('ERROR');
      
      const errMsg = 'Señor, experimenté una interrupción de microcanales con el núcleo de Google AI. Por favor verifique mi clave API registrada o reinicie el canal de red simulado.';
      addLog('response', `NIM: ${errMsg}`);
      addChatMessage('nim', errMsg);
      speakText(errMsg);
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
        addLog('system', `Error en la senal del captador vocal: ${event.error}`);
        setStatus('ERROR');
      }
    };

    rec.onend = () => {
      if (isWakeWordMode && status !== 'ERROR') {
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

  // Selected skill config object
  const selectedSkill = skills.find(s => s.id === selectedSkillId) || skills[0];

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
              {provider.toUpperCase()} ENGINE
            </span>
          </div>

          <div className="text-right">
            <div className="text-sm font-mono text-cyan-200 tracking-wider font-semibold">{currentTime}</div>
            <div className="text-[8px] text-cyan-500 tracking-widest font-mono leading-none">{currentDate}</div>
          </div>
        </div>
      </header>

      {/* PROMINENT MODEL SWITCHER TAB MENU (USER REQUESTED FEATURE) */}
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

            {/* Premium details controller trigger button (User request) */}
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
          
          <div className="grid grid-cols-3 gap-1.5 w-full md:w-auto">
            <button
              type="button"
              onClick={() => {
                setProvider('gemini');
                addLog('system', 'Matriz de NIM redirigida a GEMINI 3.5 FLASH.');
                speakText('Motor central de Gemini cargado. Equilibrado para análisis interactivo veloz.');
              }}
              className={`relative px-3 py-2 border rounded font-mono text-center transition flex flex-col justify-center items-center gap-0.5 text-[10px] uppercase font-bold min-w-[100px] ${
                provider === 'gemini' 
                  ? 'border-cyan-400 bg-cyan-400/20 text-white shadow-[0_0_8px_rgba(0,242,255,0.25)]' 
                  : 'border-cyan-950 bg-black/40 text-cyan-600 hover:text-cyan-300'
              }`}
            >
              <div className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                Gemini 3.5
              </div>
              {quotaData?.gemini ? (
                quotaData.gemini.suspendedUntil ? (
                  <span className="text-[7.5px] text-red-500 font-mono animate-pulse font-bold">⚠️ SUSP. {Math.ceil(quotaData.gemini.recoversInMs/1000)}s</span>
                ) : (
                  <span className="text-[7.5px] text-green-400 font-mono font-medium">{quotaData.gemini.requestsThisMinute}/15 RPM</span>
                )
              ) : (
                <span className="text-[7.5px] text-cyan-600 font-mono">Cargando...</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setProvider('deepseek');
                addLog('system', 'Matriz de NIM redirigida a DEEPSEEK MATHEMATICAL ENGINE.');
                speakText('Matriz lógica DeepSeek acoplada. Razonamiento minucioso activo.');
              }}
              className={`relative px-3 py-2 border rounded font-mono text-center transition flex flex-col justify-center items-center gap-0.5 text-[10px] uppercase font-bold min-w-[100px] ${
                provider === 'deepseek' 
                  ? 'border-cyan-400 bg-cyan-400/20 text-white shadow-[0_0_8px_rgba(0,242,255,0.25)]' 
                  : 'border-cyan-950 bg-black/40 text-cyan-600 hover:text-cyan-300'
              }`}
            >
              <div className="flex items-center gap-1">
                <Database className="w-3 h-3 text-cyan-400" />
                DeepSeek Logic
              </div>
              {quotaData?.deepseek ? (
                quotaData.deepseek.suspendedUntil ? (
                  <span className="text-[7.5px] text-red-500 font-mono animate-pulse font-bold">⚠️ SUSP. {Math.ceil(quotaData.deepseek.recoversInMs/1000)}s</span>
                ) : (
                  <span className="text-[7.5px] text-green-400 font-mono font-medium">{quotaData.deepseek.requestsThisMinute}/60 RPM</span>
                )
              ) : (
                <span className="text-[7.5px] text-cyan-600 font-mono">Cargando...</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setProvider('anthropic');
                addLog('system', 'Matriz de NIM redirigida a CLAUDE DEEP CONTEXT.');
                speakText('Estructura conceptual Claude seleccionada. Comprensión semántica robusta.');
              }}
              className={`relative px-3 py-2 border rounded font-mono text-center transition flex flex-col justify-center items-center gap-0.5 text-[10px] uppercase font-bold min-w-[100px] ${
                provider === 'anthropic' 
                  ? 'border-cyan-400 bg-cyan-400/20 text-white shadow-[0_0_8px_rgba(0,242,255,0.25)]' 
                  : 'border-cyan-950 bg-black/40 text-cyan-600 hover:text-cyan-300'
              }`}
            >
              <div className="flex items-center gap-1">
                <Layers className="w-3 h-3 text-purple-400" />
                Claude 3.5
              </div>
              {quotaData?.anthropic ? (
                quotaData.anthropic.suspendedUntil ? (
                  <span className="text-[7.5px] text-red-500 font-mono animate-pulse font-bold">⚠️ SUSP. {Math.ceil(quotaData.anthropic.recoversInMs/1000)}s</span>
                ) : (
                  <span className="text-[7.5px] text-purple-400 font-mono font-medium">{quotaData.anthropic.requestsThisMinute}/50 RPM</span>
                )
              ) : (
                <span className="text-[7.5px] text-cyan-600 font-mono">Cargando...</span>
              )}
            </button>
          </div>
        </div>

        {/* Dynamic Model Profile, Strengths, Weaknesses, and API key Health status card */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 bg-[#030c14]/90 p-2 rounded border border-cyan-950/60 text-[9.5px] font-mono leading-relaxed">
          <div className="md:col-span-3 border-r border-cyan-950/40 pr-2 flex flex-col justify-between py-0.5">
            <div>
              <div className="text-cyan-400 font-bold uppercase flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-cyan-500" />
                PERFIL COGNITIVO ACTIVO
              </div>
              <div className="text-[11px] text-cyan-100 font-bold uppercase mt-1">
                {quotaData?.[provider]?.model || `${provider.toUpperCase()} ENGINE`}
              </div>
            </div>
            <div className="mt-2 md:mt-0 pt-1.5 border-t border-cyan-950/30">
              <span className="text-cyan-600">CANAL SECRETO: </span>
              {provider === 'anthropic' && !quotaData?.[provider]?.hasKey ? (
                <span className="text-cyan-400 font-bold">DELEGACIÓN INTELIGENTE</span>
              ) : quotaData?.[provider]?.hasKey ? (
                <span className="text-green-400 font-bold">CONECTADO</span>
              ) : (
                <span className="text-amber-500/90 font-bold">SIMULATIVO</span>
              )}
            </div>
          </div>

          <div className="md:col-span-5 border-r border-cyan-950/40 px-2 space-y-1.5 py-0.5">
            <div>
              <span className="text-cyan-500 font-bold uppercase block">PUNTOS FUERTES / CAPACIDAD:</span>
              <p className="text-cyan-200/90 leading-tight text-[9px] mt-0.5">
                {quotaData?.[provider]?.strengths || 'Cargando información ventajosa de relés...'}
              </p>
            </div>
            <div>
              <span className="text-amber-500 font-bold uppercase block">PUNTOS DÉBILES / RIESGOS:</span>
              <p className="text-amber-200/80 leading-tight text-[9px] mt-0.5">
                {quotaData?.[provider]?.weaknesses || 'Cargando limitaciones operacionales...'}
              </p>
            </div>
          </div>

          <div className="md:col-span-4 pl-2 flex flex-col justify-between space-y-2 md:space-y-0 py-0.5">
            <div>
              <span className="text-cyan-500 font-bold uppercase block">ESTRUCTURA DE RESETEO:</span>
              <span className="text-cyan-300 text-[9px] block leading-tight">
                {quotaData?.[provider]?.restoreWindow || 'Consultando directiva con el bus...'}
              </span>
            </div>

            <div className="bg-cyan-950/20 border border-cyan-900/30 p-1.5 rounded mt-1">
              {quotaData?.[provider]?.suspendedUntil ? (
                <div className="text-center text-red-500 font-bold flex flex-col items-center justify-center animate-pulse">
                  <div className="flex items-center gap-1 uppercase text-[9px]">
                    <AlertTriangle className="w-3 h-3 text-red-500 animate-bounce" />
                    CUOTA TEMPORAL EXCEDIDA (429)
                  </div>
                  <span className="text-[8px] text-cyan-300 mt-0.5 font-bold">RESTABLECIENDO EN {Math.ceil(quotaData[provider].recoversInMs/1000)}s</span>
                </div>
              ) : quotaData?.[provider]?.requestsThisMinute >= 12 && provider === 'gemini' ? (
                <div className="text-center text-amber-400 font-bold animate-pulse">
                  ⚠️ ADVERTENCIA: PRÓXIMO AL LÍMITE
                  <span className="text-[8px] text-cyan-300 block mt-0.5 font-bold">Consolas al 85% de capacidad min.</span>
                </div>
              ) : (
                <div className="flex justify-between items-center text-[9px]">
                  <span className="text-cyan-500 font-bold uppercase">CARGA ACTIVA DEL BLOQUE:</span>
                  <span className="text-cyan-100 font-bold">
                    {quotaData?.[provider]?.requestsThisMinute || 0} / {quotaData?.[provider]?.maxRequestsPerMinute || 15} MIN
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

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

            {/* TAB CONTENT 3: AGENTIC CORE MIDDLEWARE AND HYBRID MEMORY COCKPIT */}
            {activeTab === 'agentic_core' && (
              <div className="h-[300px] overflow-y-auto pr-1 space-y-3.5 custom-scrollbar text-xs">
                
                {/* 1. Working Memory Buffer Cards (Human, Persona, Task Blocks) */}
                <div className="border border-cyan-950/40 bg-cyan-950/10 p-2 rounded">
                  <div className="flex justify-between items-center mb-1 pb-1 border-b border-cyan-950/30">
                    <span className="font-bold tracking-wider text-cyan-400 text-[9px] uppercase font-mono">BÚFER MEMORIA TRABAJO (LETTA)</span>
                    <button
                      onClick={async () => {
                        setWmUpdating(true);
                        try {
                          const r = await fetch('/api/agent-core/working-memory', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ humanBlock: wmHuman, personaBlock: wmPersona, taskBlock: wmTask })
                          });
                          if (r.ok) {
                            await fetchCoreStatus();
                          }
                        } catch (err) {
                          console.error(err);
                        } finally {
                          setWmUpdating(false);
                        }
                      }}
                      className="text-[8px] bg-cyan-500/10 text-cyan-200 border border-cyan-700/50 hover:bg-cyan-500/20 px-2 py-0.5 rounded uppercase font-mono font-bold"
                      disabled={wmUpdating}
                    >
                      {wmUpdating ? 'SINCRONIZANDO...' : 'GUARDAR BLOQUES'}
                    </button>
                  </div>

                  <div className="space-y-1.5 mt-2">
                    <div>
                      <label className="text-[8px] text-cyan-600 block uppercase font-mono mb-0.5">HUMAN BLOCK (Preferencias del Señor)</label>
                      <textarea
                        value={wmHuman}
                        onChange={(e) => setWmHuman(e.target.value)}
                        className="w-full text-[10px] p-1 bg-[#010912] border border-cyan-950 text-cyan-100 rounded focus:border-cyan-500 font-mono focus:outline-none"
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="text-[8px] text-cyan-600 block uppercase font-mono mb-0.5">PERSONA BLOCK (Directrices NIM)</label>
                      <textarea
                        value={wmPersona}
                        onChange={(e) => setWmPersona(e.target.value)}
                        className="w-full text-[10px] p-1 bg-[#010912] border border-cyan-950 text-cyan-100 rounded focus:border-cyan-500 font-mono focus:outline-none"
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="text-[8px] text-cyan-600 block uppercase font-mono mb-0.5">TASK BLOCK (Meta Activa del Motor)</label>
                      <textarea
                        value={wmTask}
                        onChange={(e) => setWmTask(e.target.value)}
                        className="w-full text-[10px] p-1 bg-[#010912] border border-cyan-950 text-cyan-100 rounded focus:border-cyan-500 font-mono focus:outline-none"
                        rows={2}
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Sleeptime Consolidation Panel */}
                <div className="border border-cyan-950/40 bg-cyan-950/10 p-2 rounded">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold tracking-wider text-cyan-400 text-[9px] uppercase font-mono">CONSOLIDADOR HÍBRIDO</span>
                    <button
                      onClick={async () => {
                        setSleeptimeLoading(true);
                        try {
                          const r = await fetch('/api/agent-core/consolidation', { method: 'POST' });
                          if (r.ok) {
                            const resData = await r.json();
                            await fetchCoreStatus();
                          }
                        } catch (err) {
                          console.error(err);
                        } finally {
                          setSleeptimeLoading(false);
                        }
                      }}
                      className="text-[8px] bg-purple-500/10 text-purple-200 border border-purple-700/50 hover:bg-purple-500/20 px-2 py-0.5 rounded uppercase font-mono font-bold flex items-center gap-1 cursor-pointer"
                      disabled={sleeptimeLoading}
                    >
                      <Sparkles className="w-2.5 h-2.5 text-purple-400" />
                      {sleeptimeLoading ? 'CONSOLIDANDO...' : 'SLEEPTIME'}
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 mt-2 bg-[#010912]/50 p-1.5 rounded text-center">
                    <div>
                      <div className="text-[12px] text-[#00f2ff] font-bold font-mono">{coreStatus?.ltmSize || 0}</div>
                      <div className="text-[7.5px] uppercase text-cyan-600 font-mono">MEMORIAS</div>
                    </div>
                    <div>
                      <div className="text-[12px] text-purple-400 font-bold font-mono">{coreStatus?.graphNodesCount || 0}</div>
                      <div className="text-[7.5px] uppercase text-cyan-600 font-mono font-bold">NÚCLEOS</div>
                    </div>
                    <div>
                      <div className="text-[12px] text-emerald-400 font-bold font-mono">{coreStatus?.graphEdgesCount || 0}</div>
                      <div className="text-[7.5px] uppercase text-cyan-600 font-mono">ENLACES</div>
                    </div>
                  </div>
                </div>

                {/* 3. Auto-Evolución de Skills (Self-Programming Node) */}
                <div className="border border-cyan-950/40 bg-cyan-950/10 p-2 rounded space-y-1.5">
                  <div className="flex justify-between items-center mb-1 pb-1 border-b border-cyan-950/30">
                    <span className="font-bold tracking-wider text-cyan-400 text-[9px] uppercase font-mono font-bold">NIM AUTO-EVOLUCIÓN (AUTO-SKILLS)</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className="text-[7.5px] text-cyan-600 block uppercase font-mono">ID MODULAR</label>
                      <input
                        value={evolveSkillId}
                        onChange={(e) => setEvolveSkillId(e.target.value)}
                        className="w-full text-[10px] p-0.5 bg-[#010912] border border-cyan-950 text-cyan-100 rounded font-mono focus:outline-none"
                        placeholder="data_indexer"
                      />
                    </div>
                    <div>
                      <label className="text-[7.5px] text-cyan-600 block uppercase font-mono">ETIQUETA SKILL</label>
                      <input
                        value={evolveSkillName}
                        onChange={(e) => setEvolveSkillName(e.target.value)}
                        className="w-full text-[10px] p-0.5 bg-[#010912] border border-cyan-950 text-cyan-100 rounded font-mono focus:outline-none"
                        placeholder="Indexador de Red"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[7.5px] text-cyan-600 block uppercase font-mono">DESCRIPCIÓN DE CAPACIDADES</label>
                    <textarea
                      value={evolveSkillDesc}
                      onChange={(e) => setEvolveSkillDesc(e.target.value)}
                      className="w-full text-[10px] p-1 bg-[#010912] border border-cyan-950 text-cyan-100 rounded focus:outline-none"
                      rows={1.5}
                      placeholder="Estadísticas de disco y red..."
                    />
                  </div>

                  <button
                    onClick={async () => {
                      setEvolveLoading(true);
                      try {
                        const r = await fetch('/api/agent-core/skills/evolve', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: evolveSkillId, name: evolveSkillName, description: evolveSkillDesc })
                        });
                        if (r.ok) {
                          await fetchCoreStatus();
                          
                          // Map output visually to the list of general skills
                          setSkills(prev => [
                            ...prev,
                            { id: evolveSkillId, name: evolveSkillName.toUpperCase(), status: 'Activa', isEnabled: true, description: evolveSkillDesc, callCount: 1 }
                          ]);
                        }
                      } catch (err) {
                        console.error(err);
                      } finally {
                        setEvolveLoading(false);
                      }
                    }}
                    className="w-full font-bold text-[8.5px] text-center bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 border border-emerald-700/50 py-1 rounded uppercase font-mono cursor-pointer"
                    disabled={evolveLoading}
                  >
                    {evolveLoading ? 'DISEÑANDO Y COMPILANDO...' : 'SINTETIZAR NUEVA HABILIDAD'}
                  </button>
                </div>

                {/* 4. Terminal de Comando Segura */}
                <div className="border border-cyan-950/40 bg-cyan-950/10 p-2 rounded space-y-1.5">
                  <span className="font-bold tracking-wider text-cyan-400 text-[9px] uppercase font-mono flex items-center gap-1">
                    <Terminal className="w-2.5 h-2.5 text-cyan-500" />
                    CONSOLA INTEGRADA (SYSTEM DEPS)
                  </span>
                  <div className="flex gap-1.5">
                    <input
                      value={consoleCommand}
                      onChange={(e) => setConsoleCommand(e.target.value)}
                      className="flex-1 text-[10px] p-1 bg-[#010912] border border-cyan-950 text-cyan-100 rounded font-mono focus:outline-none"
                      placeholder="npm run lint"
                    />
                    <button
                      onClick={async () => {
                        setConsoleLoading(true);
                        try {
                          const r = await fetch('/api/agent-core/console-run', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ command: consoleCommand })
                          });
                          if (r.ok) {
                            const res = await r.json();
                            setConsoleResult(res);
                          }
                        } catch (err) {
                          console.error(err);
                        } finally {
                          setConsoleLoading(false);
                        }
                      }}
                      className="bg-cyan-500/10 text-cyan-200 border border-cyan-700/50 text-[8.5px] px-2 py-1 rounded hover:bg-cyan-500/20 uppercase font-mono font-bold cursor-pointer"
                      disabled={consoleLoading}
                    >
                      {consoleLoading ? 'EJECUTANDO...' : 'RUN'}
                    </button>
                  </div>
                </div>

                {/* 5. COGNITIVE ONBOARDING EXPEDIENT (DYNAMIC & VOICE-FIRST ORB EXPERIENCE) */}
                <div className="border border-cyan-800/40 bg-gradient-to-b from-cyan-950/10 to-cyan-950/20 p-3 rounded-lg space-y-3 shadow-[0_5px_15px_rgba(0,0,0,0.4)]">
                  <div className="flex justify-between items-center pb-1.5 border-b border-cyan-950/40">
                    <span className="font-bold tracking-wider text-cyan-400 text-[9px] uppercase font-mono flex items-center gap-1">
                      <Cpu className="w-2.5 h-2.5 text-cyan-400" />
                      ONBOARDING MULTIMODAL DIRECTO (HUD VOICE CORE)
                    </span>
                    <div className="flex items-center gap-1.5">
                      {/* Audio Synthesizer toggle switch */}
                      <button
                        onClick={() => {
                          const muted = !ttsMuted;
                          setTtsMuted(muted);
                          if (muted) {
                            window.speechSynthesis.cancel();
                            setOrbState('idle');
                          } else {
                            if (onboardingData?.nextFormState) {
                              const t = onboardingData.nextFormState.voiceText || onboardingData.nextFormState.question;
                              speakText(t);
                            }
                          }
                        }}
                        className={`p-1 rounded cursor-pointer transition-all border ${
                          ttsMuted 
                            ? 'bg-rose-950/20 text-rose-450 border-rose-900/40' 
                            : 'bg-emerald-950/20 text-emerald-400 border-emerald-900/40 animate-pulse'
                        }`}
                        title={ttsMuted ? "Voz silenciada. Presione para activar." : "Voz activa. Presione para mútear."}
                      >
                        {ttsMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                      </button>
                      
                      <span className={`text-[8px] px-2 py-0.5 rounded uppercase font-mono font-bold ${
                        onboardingData?.initialized 
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse'
                      }`}>
                        {onboardingData?.initialized ? 'ESTABLE' : 'pendiente'}
                      </span>
                    </div>
                  </div>

                  {/* HIGH FIDELITY REACTIVE ENERGY ORB GRAPHICS */}
                  <div 
                    onClick={() => {
                      if (orbState === 'speaking') {
                        window.speechSynthesis.cancel();
                        setStatus('STANDBY');
                        setOrbState('idle');
                        addLog('system', '[ORB INTERRUPT] El Creador interrumpió el canal de voz de NIM de forma física.');
                      }
                    }}
                    title={orbState === 'speaking' ? 'Interrumpir voz de NIM (hacer que se calle)' : 'Telemetría de la IA'}
                    className="flex flex-col items-center justify-center p-4 bg-[#000d1a]/85 border border-cyan-950/60 rounded-lg relative overflow-hidden my-1 shadow-inner cursor-pointer"
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,18,36,0.95)_0%,transparent_100%)] pointer-events-none" />
                    
                    {/* Glowing outer rings and spiral spikes */}
                    <div className="relative w-20 h-20 flex items-center justify-center z-10">
                      {/* Outer Aura layer 1 */}
                      <div className={`absolute inset-0 rounded-full blur-2xl transition-all duration-700 ${
                        orbState === 'speaking' ? 'bg-cyan-400/40 scale-125 animate-pulse' :
                        orbState === 'thinking' ? 'bg-amber-400/35 scale-130' :
                        orbState === 'listening' ? 'bg-fuchsia-500/40 scale-145' :
                        'bg-cyan-500/15 scale-100 animate-pulse'
                      }`} />

                      {/* Medium Aura layer 2 */}
                      <div className={`absolute w-14 h-14 rounded-full blur-md transition-all duration-500 ${
                        orbState === 'speaking' ? 'bg-emerald-400/40 scale-110 animate-ping' :
                        orbState === 'thinking' ? 'bg-amber-500/45 scale-105 animate-pulse' :
                        orbState === 'listening' ? 'bg-purple-500/50 scale-120 animate-pulse' :
                        'bg-cyan-400/25 scale-95'
                      }`} />

                      {/* Spikes / Waves simulation */}
                      <div className={`absolute w-16 h-16 border border-cyan-500/25 rounded-full transition-all duration-1000 ${
                        orbState === 'speaking' ? 'animate-[spin_2s_linear_infinite] scale-115 border-t-emerald-400' :
                        orbState === 'thinking' ? 'animate-[spin_1s_linear_infinite] scale-120 border-r-amber-400' :
                        orbState === 'listening' ? 'animate-ping scale-125 border-l-purple-400' :
                        'animate-[spin_7s_linear_infinite]'
                      }`} />

                      {/* Dense Core Orb */}
                      <div className={`w-10 h-10 rounded-full border shadow-[0_0_20px_rgba(34,211,238,0.7)] transition-all duration-500 flex items-center justify-center ${
                        orbState === 'speaking' ? 'bg-gradient-to-tr from-emerald-600 to-[#00f2ff] border-emerald-250 scale-110' :
                        orbState === 'thinking' ? 'bg-gradient-to-tr from-amber-600 to-[#ff9900] border-amber-300' :
                        orbState === 'listening' ? 'bg-gradient-to-tr from-purple-700 to-[#ee82ee] border-purple-300 scale-105' :
                        'bg-gradient-to-tr from-cyan-600 to-[#00bfff] border-cyan-300 hover:scale-105'
                      }`}>
                        {/* Interactive pulsating frequency core */}
                        <div className={`w-3.5 h-3.5 bg-white rounded-full opacity-90 ${
                          orbState === 'speaking' ? 'animate-ping scale-110' :
                          orbState === 'thinking' ? 'animate-pulse' :
                          orbState === 'listening' ? 'animate-ping duration-300 shadow-[0_0_10px_white]' :
                          'animate-pulse shadow-[0_0_5px_white]'
                        }`} />
                      </div>
                    </div>
                    
                    {/* Mode tag indicator bar */}
                    <span className="text-[7.5px] uppercase font-mono tracking-widest text-cyan-400/90 mt-3 font-bold flex items-center gap-1.5 z-10 bg-[#00050c]/80 px-2 py-0.5 rounded border border-cyan-950/40 shadow-sm">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        orbState === 'speaking' ? 'bg-emerald-400 animate-ping' :
                        orbState === 'thinking' ? 'bg-amber-400 animate-spin' :
                        orbState === 'listening' ? 'bg-purple-400 animate-pulse' :
                        'bg-cyan-400'
                      }`} />
                      TELEMETRÍA ORB: {orbState.toUpperCase()}
                    </span>
                  </div>

                  {/* System status feedback line */}
                  {systemStatusMessage && (
                    <div className="text-[8.5px] font-mono p-1 bg-[#010912] border border-cyan-900/40 rounded text-cyan-300 flex items-center gap-1 bg-cyan-950/10 animate-pulse">
                      <Info className="w-3 h-3 text-[#00f2ff] shrink-0" />
                      <span className="truncate uppercase tracking-wider">{systemStatusMessage}</span>
                    </div>
                  )}

                  {onboardingData?.nextFormState ? (
                    <div className="bg-[#010912] p-3 rounded-lg border border-cyan-950 text-cyan-100 font-mono space-y-2.5">
                      <div className="flex gap-1.5 items-start">
                        <span className="text-[10px] text-cyan-500 font-bold font-mono">📟 [NIM CORE]</span>
                        <p className="text-[10.5px] text-cyan-200 leading-relaxed text-wrap flex-1">
                          {onboardingData.nextFormState.question}
                        </p>
                      </div>
                      
                      {/* OPTIONS RENDERING (Dynamic choices Grid requested) */}
                      {onboardingData.nextFormState.options ? (
                        <div className="grid grid-cols-2 gap-1.5 pt-1">
                          {onboardingData.nextFormState.options.map((option) => (
                            <button
                              key={option}
                              onClick={async () => {
                                setOnboardingLoading(true);
                                setOrbState('thinking');
                                try {
                                  const r = await fetch('/api/agent-core/onboarding/response', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      field: onboardingData.nextFormState?.fieldToUpdate,
                                      value: option
                                    })
                                  });
                                  if (r.ok) {
                                    const res = await r.json();
                                    setOnboardingData(res);
                                    if (res.message) {
                                      setSystemStatusMessage(res.message);
                                    }
                                    setOnboardingInput('');
                                    await fetchCoreStatus();
                                  }
                                } catch (err) {
                                  console.error(err);
                                } finally {
                                  setOnboardingLoading(false);
                                  setOrbState('idle');
                                }
                              }}
                              className="p-2 bg-[#00050c]/80 border border-cyan-950 hover:border-[#00f2ff]/60 hover:bg-cyan-950/20 text-[#00f2ff] text-[9px] rounded font-bold uppercase tracking-wider text-left transition-all cursor-pointer flex justify-between items-center"
                            >
                              <span>{option}</span>
                              <ChevronRight className="w-3 h-3 text-cyan-500 shrink-0" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        /* TEXT COMPONENT LAYOUT with embedded Voice-to-Text */
                        <div className="flex gap-1.5 items-center pt-1.5">
                          <input
                            type="text"
                            value={onboardingInput}
                            onChange={(e) => setOnboardingInput(e.target.value)}
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter' && onboardingInput.trim() && !onboardingLoading) {
                                setOnboardingLoading(true);
                                setOrbState('thinking');
                                try {
                                  const r = await fetch('/api/agent-core/onboarding/response', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      field: onboardingData.nextFormState?.fieldToUpdate,
                                      value: onboardingInput
                                    })
                                  });
                                  if (r.ok) {
                                    const res = await r.json();
                                    setOnboardingData(res);
                                    if (res.message) {
                                      setSystemStatusMessage(res.message);
                                    }
                                    setOnboardingInput('');
                                    await fetchCoreStatus();
                                  }
                                } catch (err) {
                                  console.error(err);
                                } finally {
                                  setOnboardingLoading(false);
                                  setOrbState('idle');
                                }
                              }
                            }}
                            className="flex-1 text-[10.5px] p-2 bg-[#00050a] border border-cyan-950/80 rounded-md text-cyan-100 focus:outline-none focus:border-cyan-500 font-mono focus:shadow-[0_0_10px_rgba(6,182,212,0.15)]"
                            placeholder={
                              onboardingData.nextFormState.fieldToUpdate === 'criticalAreasOfFocus'
                                ? 'Esquemas clave: Web3, React UX, Rust backend...'
                                : onboardingData.nextFormState.fieldToUpdate?.includes('apiKey')
                                ? 'Introduzca API key (ej. sk-proj-... o dummy_key)...'
                                : 'Inserte respuesta...'
                            }
                            disabled={onboardingLoading}
                          />

                          {/* Interactive speech-to-text voice recognition activator */}
                          <button
                            type="button"
                            onClick={() => {
                              const SpeechClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                              if (!SpeechClass) {
                                setSystemStatusMessage("✕ WebSpeechRecognition no es compatible con el navegador.");
                                return;
                              }
                              const rec = new SpeechClass();
                              rec.lang = 'es-ES';
                              rec.continuous = false;
                              rec.onstart = () => {
                                setOrbState('listening');
                                setSystemStatusMessage("📟 [ESCUCHANDO...] Hable por su micrófono...");
                              };
                              rec.onresult = (e: any) => {
                                const transcript = e.results[0][0].transcript;
                                setOnboardingInput(transcript);
                                setSystemStatusMessage(`🗣 DETECTADO: "${transcript}"`);
                                setOrbState('idle');
                              };
                              rec.onerror = (e: any) => {
                                setOrbState('idle');
                                console.error('Speech recognition error: ', e);
                              };
                              rec.onend = () => {
                                setOrbState('idle');
                              };
                              rec.start();
                            }}
                            className="p-2 rounded border border-purple-800/40 bg-[#0c001a] text-[#da70d6] hover:bg-purple-950/40 hover:text-purple-300 transition-all flex items-center justify-center cursor-pointer shrink-0"
                            title="Comando por voz"
                            disabled={onboardingLoading}
                          >
                            <Mic className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={async () => {
                              if (!onboardingInput.trim()) return;
                              setOnboardingLoading(true);
                              setOrbState('thinking');
                              try {
                                const r = await fetch('/api/agent-core/onboarding/response', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      field: onboardingData.nextFormState?.fieldToUpdate,
                                      value: onboardingInput
                                    })
                                });
                                if (r.ok) {
                                  const res = await r.json();
                                  setOnboardingData(res);
                                  if (res.message) {
                                    setSystemStatusMessage(res.message);
                                  }
                                  setOnboardingInput('');
                                  await fetchCoreStatus();
                                }
                              } catch (err) {
                                console.error(err);
                              } finally {
                                setOnboardingLoading(false);
                                setOrbState('idle');
                              }
                            }}
                            className="bg-cyan-500/10 text-cyan-200 border border-cyan-700/50 text-[9px] px-3 py-2 rounded hover:bg-cyan-500/20 uppercase font-bold cursor-pointer font-mono shrink-0"
                            disabled={onboardingLoading}
                          >
                            {onboardingLoading ? 'SYNC...' : 'ENVIAR'}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* COMPLETED PROFILE GRAPHICS AND BIOGRAPHY DATA CARDS */
                    <div className="bg-[#000810]/40 p-2.5 rounded-lg border border-cyan-950 text-[10px] space-y-2 font-mono">
                      <div className="flex justify-between items-center bg-[#010912]/80 p-1 px-2 border border-cyan-950/30 rounded">
                        <span className="text-cyan-600 text-[8.5px]">LLM CREDENCIALES INFRA:</span>
                        <span className="text-[#00f2ff] font-bold text-[8.5px] uppercase">
                          ⚡ {onboardingData?.profile?.infrastructure?.llmProvider ? `${onboardingData.profile.infrastructure.llmProvider} [STABLE]` : 'ollama bypass'}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-cyan-600">SEÑOR COMPILADO:</span>
                        <span className="text-cyan-200 font-bold">{onboardingData?.profile?.userName || 'No Configurado'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-cyan-600">ROL DESIGNADO:</span>
                        <span className="text-cyan-300">{onboardingData?.profile?.professionalRole || 'No Configurado'}</span>
                      </div>
                      <div className="flex justify-between flex-wrap gap-1">
                        <span className="text-cyan-600 block">ESPECIALIZACIÓN PROACTIVA VITAL:</span>
                        <span className="text-emerald-450 font-bold text-wrap w-full mt-0.5 bg-[#010a14]/60 p-1 px-1.5 rounded border border-cyan-950/30">
                          {onboardingData?.profile?.criticalAreasOfFocus?.join(', ') || 'Inicializando indexado de reserva...'}
                        </span>
                      </div>

                      <button
                        onClick={async () => {
                          setOnboardingLoading(true);
                          setOrbState('thinking');
                          setSystemStatusMessage("Eliminando configuración biográfica...");
                          try {
                            const r = await fetch('/api/agent-core/onboarding/response', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ field: 'reset', value: '' })
                            });
                            if (r.ok) {
                              const res = await r.json();
                              setOnboardingData(res);
                              setSystemStatusMessage(res.message || "Canal biográfico desinstalado.");
                              await fetchCoreStatus();
                            }
                          } catch (err) {
                            console.error(err);
                          } finally {
                            setOnboardingLoading(false);
                            setOrbState('idle');
                          }
                        }}
                        className="w-full mt-2.5 text-[8.5px] bg-red-900/10 text-red-300 hover:bg-red-900/20 border border-red-950/50 py-1.5 rounded-md uppercase text-center font-bold font-mono cursor-pointer tracking-wider transition-all"
                      >
                        RE-INICIAR EXPEDIENTE BIOGRÁFICO & INFRAESTRUCTURA
                      </button>
                    </div>
                  )}
                </div>

                {/* 6. TELEMETRY SEARCH ROUTER AND MULTI-SOURCE SIMULATOR */}
                <div className="border border-cyan-950/40 bg-cyan-950/10 p-2 rounded space-y-2">
                  <div className="flex justify-between items-center mb-1 pb-1 border-b border-cyan-950/30">
                    <span className="font-bold tracking-wider text-cyan-400 text-[9px] uppercase font-mono flex items-center gap-1">
                      <Activity className="w-2.5 h-2.5 text-cyan-400" />
                      SIMULADOR DE TELEMETRÍA (RUTAS COGNITIVAS)
                    </span>
                  </div>

                  <div className="space-y-1.5 font-mono text-[9px]">
                    <div className="flex gap-1">
                      <input
                        value={telemetryQuery}
                        onChange={(e) => setTelemetryQuery(e.target.value)}
                        className="flex-1 text-[10px] p-0.5 bg-[#010912] border border-cyan-950 text-cyan-100 rounded focus:outline-none"
                        placeholder="especificación mcp..."
                      />
                      <select
                        value={telemetryScope}
                        onChange={(e) => setTelemetryScope(e.target.value)}
                        className="bg-[#010912] border border-cyan-950 text-cyan-200 p-0.5 rounded text-[8.5px] font-mono focus:outline-none"
                      >
                        <option value="programming_code_markdown">PROGRAMMING (TAVILY)</option>
                        <option value="general_facts">GENERAL FACTS (GOOGLE)</option>
                        <option value="unreleased_news_trends">NEWS SENSORS (PERPLEXITY)</option>
                      </select>
                      <button
                        onClick={async () => {
                          setTelemetryLoading(true);
                          setTelemetryResult(null);
                          try {
                            const r = await fetch('/api/agent-core/telemetry/search', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ query: telemetryQuery, scope: telemetryScope })
                            });
                            if (r.ok) {
                              const d = await r.json();
                              setTelemetryResult(d);
                            }
                          } catch (err) {
                            console.error(err);
                          } finally {
                            setTelemetryLoading(false);
                          }
                        }}
                        className="bg-cyan-500/10 text-cyan-200 border border-cyan-700/50 hover:bg-cyan-500/20 px-2 py-0.5 rounded text-[8.5px] font-bold cursor-pointer"
                        disabled={telemetryLoading}
                      >
                        {telemetryLoading ? 'RUTANDO...' : 'ENRUTAR'}
                      </button>
                    </div>

                    {telemetryResult && (
                      <div className="bg-[#000810] border border-cyan-950 rounded p-1.5 text-[8.5px] space-y-1 text-cyan-100 max-h-[140px] overflow-auto select-text">
                        <div className="flex justify-between border-b border-cyan-950/40 pb-0.5 mb-1">
                          <span className="text-cyan-500 uppercase font-bold">CANAL ELECTO:</span>
                          <span className="text-emerald-400 font-bold uppercase select-all font-mono">
                            {telemetryResult.providerUsed}
                          </span>
                        </div>
                        {telemetryResult.results?.map((res: any, idx: number) => (
                          <div key={idx} className="space-y-1">
                            <span className="text-cyan-600 font-bold block">[{res.source}] {res.title}</span>
                            <pre className="text-cyan-200/90 whitespace-pre-wrap font-mono select-text block overflow-x-auto bg-[#010912]/40 p-1 rounded-sm border border-cyan-950/30">
                              {res.content}
                            </pre>
                            {res.url && <a href={res.url} target="_blank" rel="noreferrer" className="text-cyan-500 hover:underline block text-[7.5px]" referrerPolicy="no-referrer">{res.url}</a>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 7. AUTONOMOUS MCP SERVER DISCOVERY AND CO-PILOT */}
                <div className="border border-cyan-950/40 bg-cyan-950/10 p-2 rounded space-y-2">
                  <div className="flex justify-between items-center mb-1 pb-1 border-b border-cyan-950/30">
                    <span className="font-bold tracking-wider text-cyan-400 text-[9px] uppercase font-mono flex items-center gap-1">
                      <Terminal className="w-2.5 h-2.5 text-cyan-400" />
                      CO-PILOTO DE ADQUISICIÓN AUTÓNOMA MCP
                    </span>
                    <button
                      onClick={() => setShowMcpDetail(!showMcpDetail)}
                      className={`text-[8.5px] border px-2 py-0.5 rounded font-mono uppercase font-bold flex items-center gap-1 transition-all cursor-pointer ${
                        showMcpDetail 
                          ? 'bg-cyan-500/20 text-cyan-100 border-cyan-500/70' 
                          : 'bg-cyan-500/5 text-cyan-400 border-cyan-950/60 hover:bg-cyan-500/10'
                      }`}
                    >
                      {showMcpDetail ? '✕ CERRAR CONFIG' : '⚙ SOPORTE & CONFIG'}
                    </button>
                  </div>

                  <div className="space-y-1.5 font-mono text-[9px]">
                    {showMcpDetail && (
                      <div className="bg-[#000a14] border border-cyan-800/40 rounded p-2.5 my-2 space-y-2.5 text-[8.5px] font-mono leading-relaxed select-text animate-fadeIn">
                        {/* Native support sub-section */}
                        <div>
                          <div className="text-cyan-400 font-bold border-b border-cyan-950/40 pb-0.5 mb-1.5 uppercase tracking-wider text-[8px]">
                            ⚡ MCP SOPORTADOS DE FORMA NATIVA (DETERMINISTAS)
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-[8px] text-cyan-350">
                            {mcpData?.discovery_keywords && Object.entries(mcpData.discovery_keywords).map(([keyword, pkg]: any) => (
                              <div key={keyword} className="bg-[#010912] p-1 rounded border border-cyan-950/50 flex flex-col">
                                <span className="font-bold text-[#00f2ff]">{keyword.toUpperCase()}</span>
                                <span className="text-[7.5px] text-cyan-600 truncate">{pkg}</span>
                              </div>
                            ))}
                            <div className="bg-[#010912] p-1 rounded border border-cyan-950/50 flex flex-col justify-center">
                              <span className="font-bold text-cyan-400 italic">REPOSITORIO GLOBAL</span>
                              <span className="text-[7.5px] text-cyan-700">Auto-descargador NPM</span>
                            </div>
                          </div>
                        </div>

                        {/* Connected MCP servers sub-section */}
                        <div>
                          <div className="text-cyan-400 font-bold border-b border-cyan-950/40 pb-0.5 mb-1.5 uppercase tracking-wider text-[8px]">
                            🔗 CANALES DE CONEXIÓN ACTIVOS
                          </div>
                          <div className="space-y-1">
                            {mcpData?.active_servers && mcpData.active_servers.map((srv: any, idx: number) => (
                              <div key={idx} className="bg-[#010912] p-1.5 rounded border border-cyan-950/50 flex items-center justify-between">
                                <div>
                                  <span className="text-cyan-200 font-bold block">{srv.name || srv.id}</span>
                                  <span className="text-cyan-600 text-[7px] block">Transporte: {srv.transport} | Cmd: {srv.command || 'None'}</span>
                                </div>
                                <span className={`px-1.5 py-0.5 rounded text-[7px] font-bold uppercase border ${
                                  srv.status === 'connected' 
                                    ? 'bg-emerald-500/10 text-emerald-450 border-emerald-550/30' 
                                    : 'bg-rose-500/10 text-rose-450 border-rose-550/30 animate-pulse'
                                }`}>
                                  {srv.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Configuration JSON sub-section */}
                        <div>
                          <div className="text-cyan-400 font-bold border-b border-cyan-950/40 pb-0.5 mb-1.5 uppercase tracking-wider text-[8px]">
                            📂 CONFIGURACIÓN MCP REGISTRADA (mcp_settings.json)
                          </div>
                          <pre className="p-1.5 bg-[#00050c] text-cyan-200 border border-cyan-950 rounded text-[7.5px] font-mono overflow-auto max-h-[120px] select-all custom-scrollbar">
                            {JSON.stringify(mcpData, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-1 mb-1">
                      {mcpData?.active_servers?.map((srv: any, idx: number) => (
                        <div key={idx} className="bg-[#000810]/60 p-1 border border-cyan-950/50 rounded flex flex-col justify-between">
                          <span className="text-cyan-200 text-[8px] font-bold block truncate">{srv.name}</span>
                          <span className={`text-[7px] uppercase block font-bold ${
                            srv.status === 'connected' ? 'text-emerald-400' : 'text-rose-400 animate-pulse'
                          }`}>
                            ⚡ {srv.status}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-1">
                      <input
                        value={mcpKeyword}
                        onChange={(e) => setMcpKeyword(e.target.value)}
                        className="flex-1 text-[10px] p-0.5 bg-[#010912] border border-cyan-950 text-cyan-100 rounded focus:outline-none"
                        placeholder="ej: Slack, Notion, Postgres..."
                      />
                      <button
                        onClick={async () => {
                          setMcpInstallLoading(true);
                          setMcpInstallOutput(null);
                          try {
                            const r = await fetch('/api/agent-core/mcp/install', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ toolKeyword: mcpKeyword })
                            });
                            if (r.ok) {
                              const d = await r.json();
                              setMcpInstallOutput(d);
                              // Reload configuration list
                              await fetchCoreStatus();
                            }
                          } catch (err) {
                            console.error(err);
                          } finally {
                            setMcpInstallLoading(false);
                          }
                        }}
                        className="bg-emerald-500/10 text-emerald-200 border border-emerald-700/50 hover:bg-emerald-500/20 px-2 py-0.5 rounded text-[8.5px] font-bold cursor-pointer"
                        disabled={mcpInstallLoading}
                      >
                        {mcpInstallLoading ? 'CRAWLING...' : 'CONECTAR'}
                      </button>
                    </div>

                    {mcpInstallOutput && (
                      <div className="bg-[#000810] border border-cyan-950 rounded p-1.5 text-[8.5px] space-y-1 text-cyan-100">
                        <div className="flex justify-between">
                          <span className="text-cyan-500">ESTADO ADQUISICIÓN:</span>
                          <span className={mcpInstallOutput.success ? 'text-emerald-400' : 'text-rose-400'}>
                            {mcpInstallOutput.success ? 'CONEXIÓN INSTALADA CON ÉXITO' : 'ERROR DE CONEXIÓN'}
                          </span>
                        </div>
                        <p className="text-cyan-300/85 leading-relaxed text-wrap">{mcpInstallOutput.message}</p>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}

            <footer className="mt-2 text-[9px] text-cyan-600/70 font-mono flex items-center gap-1 shrink-0 border-t border-cyan-950/40 pt-2">
              <Activity className="w-3 h-3 text-cyan-500" />
              <span>Memoria activa del núcleo distribuida.</span>
            </footer>
          </section>

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
                <span className="text-green-400 text-[10px] font-bold uppercase flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                  NOMINAL SECURE
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

              {/* Grid of skills list switcher */}
              <div className="grid grid-cols-2 gap-1 text-xs font-mono mb-2 shrink-0">
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
                        <span className={`text-[7.5px] leading-none px-1 py-0.5 rounded ${
                          !skill.isEnabled ? 'bg-neutral-950 text-neutral-500' :
                          skill.status === 'Activa' ? 'bg-emerald-950/60 text-green-400 border border-emerald-900/60' :
                          skill.status === 'Inactiva' ? 'bg-neutral-900 text-neutral-400' : 'bg-red-950/60 text-red-400'
                        }`}>
                          {skill.isEnabled ? skill.status.toUpperCase() : 'OFFLINE'}
                        </span>
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

      {/* MONITOREO DE CUOTAS Y REGULACIONES POPUP MODAL */}
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
                <p className="text-cyan-300 animate-pulse">
                  <strong>Señor:</strong> Este centro de mando detalla el consumo medido por tokens del backend y las normativas legales de cada empresa. He modulado mis algoritmos regulatorios para alertarle proactivamente antes de agotar los créditos o superar la congestión de los servidores. El reset del ledger borrará las estadísticas de sesión pero mantendrá la cuota dinámica minuto a minuto de la API.
                </p>
              </div>

              {/* Providers specification cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {['gemini', 'anthropic', 'deepseek'].map((prov) => {
                  const data = quotaData?.[prov] || {
                    model: prov === 'gemini' ? 'gemini-3.5-flash' : (prov === 'anthropic' ? 'claude-3-5-sonnet-latest' : 'deepseek-chat'),
                    developer: prov === 'gemini' ? 'Google AI Studio' : (prov === 'anthropic' ? 'Anthropic' : 'DeepSeek Inc.'),
                    website: prov === 'gemini' ? 'https://aistudio.google.com' : (prov === 'anthropic' ? 'https://anthropic.com' : 'https://deepseek.com'),
                    strengths: 'Cargando...',
                    weaknesses: 'Cargando...',
                    restoreWindow: '1 minuto por ventana',
                    contextLimit: prov === 'gemini' ? 1000000 : (prov === 'anthropic' ? 200000 : 128000),
                    inputPrice: prov === 'gemini' ? 0.075 : (prov === 'anthropic' ? 3.00 : 0.14),
                    outputPrice: prov === 'gemini' ? 0.30 : (prov === 'anthropic' ? 15.00 : 1.10),
                    stats: { promptTokens: 0, completionTokens: 0, costUSD: 0, requestCount: 0 }
                  };

                  const stats = data.stats || { promptTokens: 0, completionTokens: 0, costUSD: 0, requestCount: 0 };
                  const percentUsed = Math.min(100, Math.round(((stats.promptTokens + stats.completionTokens) / data.contextLimit) * 100));

                  return (
                    <div 
                      key={prov}
                      className={`border p-3 rounded bg-black/50 flex flex-col justify-between ${
                        provider === prov 
                          ? 'border-cyan-400/80 shadow-[0_0_8px_rgba(0,190,255,0.15)] bg-cyan-950/5' 
                          : 'border-cyan-950'
                      }`}
                    >
                      <div>
                        {/* Header card state */}
                        <div className="flex justify-between items-center border-b border-cyan-950 pb-1.5 mb-2">
                          <span className="text-[11px] font-bold text-cyan-300 uppercase block">{prov} channels</span>
                          <span className={`text-[8px] font-bold uppercase px-1 rounded ${
                            provider === prov ? 'bg-cyan-500/20 text-cyan-300' : 'bg-neutral-900 text-neutral-500'
                          }`}>
                            {provider === prov ? 'ACTIVO' : 'DISPONIBLE'}
                          </span>
                        </div>

                        {/* Model specifications */}
                        <div className="space-y-1 text-[9.5px]">
                          <div><span className="text-cyan-500 font-bold uppercase">Proveedor:</span> <span className="text-cyan-100">{data.developer}</span></div>
                          <div><span className="text-cyan-500 font-bold uppercase">Modelo Core:</span> <span className="text-cyan-100 font-mono text-[9px]">{data.model}</span></div>
                          <div><span className="text-cyan-500 font-bold uppercase">Contexto máx:</span> <span className="text-cyan-100 font-mono">{data.contextLimit?.toLocaleString()} tks</span></div>
                          <div className="mt-1">
                            <span className="text-cyan-500 font-bold uppercase block text-[8px] tracking-wide">Normas de Privacidad:</span>
                            <span className="text-cyan-400 text-[8.5px] leading-snug">
                              {prov === 'gemini' 
                                ? 'Los datos de la API comercial no se entrenan. Cumple ISO 27001, RGPD completo.' 
                                : prov === 'anthropic' 
                                  ? 'Cero retención de logs por defecto. Privacidad SOC2 Tipo II empresarial.'
                                  : 'Cumplimiento normativo eficiente. El tráfico no es almacenado localmente.'}
                            </span>
                          </div>
                          
                          {/* Prices per 1M tokens */}
                          <div className="mt-2 text-cyan-300 font-mono">
                            <span className="text-cyan-500 font-bold uppercase block text-[8px] tracking-wide">Tarifas por Millón de Tokens:</span>
                            <div className="flex justify-between text-[8.5px]">
                              <span>Entrada: <strong>${data.inputPrice} USD</strong></span>
                              <span>Salida: <strong>${data.outputPrice} USD</strong></span>
                            </div>
                          </div>

                          {/* Dynamic Active Balances from API or Console details */}
                          {prov === 'deepseek' && (
                            <div className="mt-2.5 text-cyan-300 font-mono border-t border-cyan-950/40 pt-1.5 bg-cyan-950/10 p-1.5 rounded border border-cyan-900/35">
                              <span className="text-emerald-400 font-bold uppercase block text-[7.5px] tracking-widest mb-0.5">Saldo Oficial Prepago (DeepSeek API):</span>
                              {data.balance && data.balance.is_available ? (
                                <div className="space-y-0.5">
                                  {data.balance.balance_infos?.map((info: any, idx: number) => (
                                    <div key={idx} className="flex justify-between text-[8px] leading-snug text-emerald-100">
                                      <span>Balance ({info.currency}):</span>
                                      <span className="font-bold text-emerald-300 font-mono">${parseFloat(info.total_balance).toFixed(2)}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-[8px] text-cyan-500/80 leading-normal">
                                  {data.hasKey 
                                    ? 'Leyendo cuenta de DeepSeek o sin saldo activo...' 
                                    : 'Sin clave. Añada DEEPSEEK_API_KEY en Ajustes (Secrets) para ver saldo real.'}
                                </div>
                              )}
                            </div>
                          )}

                          {prov === 'anthropic' && (
                            <div className="mt-2.5 text-cyan-300 font-mono border-t border-cyan-950/40 pt-1.5 bg-amber-950/10 p-1.5 rounded border border-amber-900/15">
                              <span className="text-amber-400/80 font-bold uppercase block text-[7.5px] tracking-widest mb-0.5">Saldo Prepago (Anthropic Console):</span>
                              <div className="text-[8px] text-amber-500/80 leading-normal">
                                Anthropic no expone balance vía API. Compruebe saldo en su panel oficial de <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-amber-300 underline hover:text-white font-bold">console.anthropic.com</a>
                              </div>
                            </div>
                          )}

                          {prov === 'gemini' && (
                            <div className="mt-2.5 text-cyan-300 font-mono border-t border-cyan-950/40 pt-1.5 bg-cyan-950/10 p-1.5 rounded border border-cyan-900/15">
                              <span className="text-cyan-400/80 font-bold uppercase block text-[7.5px] tracking-widest mb-0.5">Facturación (Google AI Studio):</span>
                              <div className="text-[8px] text-cyan-400/70 leading-normal">
                                Gratuito con límite de 15 RPM. Versión Premium se liquida mediante Vertex AI en <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline hover:text-white font-bold">Google Cloud Console</a>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Cumulative usage telemetry widget */}
                      <div className="mt-3.5 pt-2.5 border-t border-cyan-950/60 text-[9.5px]">
                        <span className="text-amber-500 font-bold uppercase block text-[8px] tracking-widest mb-1.5">Consumo Histórico de Sesión:</span>
                        <div className="space-y-1 select-none">
                          <div className="flex justify-between">
                            <span className="text-cyan-500">Llamadas (Reqs):</span>
                            <span className="text-cyan-100 font-bold">{stats.requestCount}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-cyan-500">Tokens Entrada:</span>
                            <span className="text-cyan-150">{stats.promptTokens?.toLocaleString() || 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-cyan-500">Tokens Salida:</span>
                            <span className="text-cyan-150">{stats.completionTokens?.toLocaleString() || 0}</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-cyan-300 font-semibold pt-0.5 border-t border-cyan-950/30">
                            <span>Inversión Realizada:</span>
                            <span className="text-emerald-400">${stats.costUSD?.toFixed(6) || "0.000000"} USD</span>
                          </div>
                        </div>

                        {/* Progress bar to max context window */}
                        <div className="mt-3">
                          <div className="flex justify-between text-[8px] text-cyan-400/70 mb-0.5 font-mono">
                            <span>VENTANA DE CONTEXTO USADA:</span>
                            <span>{percentUsed}%</span>
                          </div>
                          <div className="w-full bg-cyan-950/40 rounded-full h-1 overflow-hidden border border-cyan-900/40">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                percentUsed > 80 ? 'bg-red-500 animate-pulse' : percentUsed > 50 ? 'bg-amber-500' : 'bg-cyan-500'
                              }`}
                              style={{ width: `${percentUsed}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Web official Link button */}
                        <a 
                          href={data.website} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="mt-3.5 w-full block text-center bg-cyan-950/55 hover:bg-cyan-900/60 border border-cyan-800/40 py-1 rounded text-[8px] uppercase tracking-wider text-cyan-300 hover:text-white transition flex items-center justify-center gap-1 font-bold"
                        >
                          <Globe className="w-3 h-3 text-cyan-400" />
                          <span>Sitio Oficial Regulaciones</span>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Advanced controls - test transactions & resetting ledger */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="bg-[#030d17] border border-cyan-950 p-3 rounded">
                  <h3 className="text-cyan-300 font-bold lowercase tracking-wide text-[11px] uppercase flex items-center gap-1.5 border-b border-cyan-950 pb-1.5 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Simulador Interno de Cómputo NIM
                  </h3>
                  <p className="text-[9px] text-cyan-400 mb-3 leading-relaxed">
                    Si está operando NIM en modo simulado/diagnóstico local sin claves configuradas en Google AI Studio, puede presionar el siguiente conector para simular la transmisión aleatoria de tokens y ver la reactividad de los gráficos y barras de cuotas en tiempo real.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const randomInput = Math.floor(Math.random() * 800) + 150;
                        const randomOutput = Math.floor(Math.random() * 1200) + 300;
                        
                        // Increment internally
                        fetch('/api/agent', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ 
                            prompt: `SIMULAR TRANSMISIÓN DE CRÉDITOS: ${randomInput} input / ${randomOutput} output`, 
                            provider: provider 
                          })
                        }).then(() => {
                          addLog('system', `SIMULACIÓN INYECTADA: Conectada a la telemetría de ${provider.toUpperCase()}. Se estima un consumo de ${randomInput + randomOutput} tokens.`);
                        });
                      }}
                      className="flex-1 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800 text-cyan-300 hover:text-white py-1 rounded text-[9px] uppercase font-bold transition flex items-center justify-center gap-1"
                    >
                      <RotateCw className="w-3 h-3 text-cyan-400" />
                      SIMULAR PROCESO ({provider.toUpperCase()})
                    </button>
                  </div>
                </div>

                <div className="bg-[#030d17] border border-cyan-950 p-3 rounded flex flex-col justify-between">
                  <div>
                    <h3 className="text-cyan-300 font-bold lowercase tracking-wide text-[11px] uppercase flex items-center gap-1.5 border-b border-cyan-950 pb-1.5 mb-2">
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      Restablecer Historial de Sesión
                    </h3>
                    <p className="text-[9px] text-cyan-400 mb-3 leading-relaxed">
                      El vaciado del balance de consumo limpiará el historial de tokens invertido y restablecerá el contador a cero dólares. No afecta el límite minute-by-minute de los proveedores.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (window.confirm('¿Está seguro de que desea restablecer el balance de tokens y costos a cero en el servidor?')) {
                        try {
                          const res = await fetch('/api/reset-quota', { method: 'POST' });
                          if (res.ok) {
                            addLog('system', 'Ledger de consumo restablecido a cero por orden del Señor.');
                            speakText('Estadísticas borradas, Señor. El balance cognitivo vuelve a estar libre.');
                          }
                        } catch (err) {
                          console.error('Error resetting ledger:', err);
                        }
                      }
                    }}
                    className="w-full bg-red-950/40 hover:bg-red-950 border border-red-900 text-red-400 py-1 rounded text-[9px] uppercase font-bold transition flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3 h-3 text-red-500" />
                    LIMPIAR LEDGER DE COSTOS
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <footer className="p-3 border-t border-cyan-900/50 bg-[#01090f] text-center text-[8.5px] text-cyan-600 font-mono">
              PORTAL DE GESTIÓN CORPORATIVA REGULATORIA NIM // VERSIÓN INTELECTUAL DE TELEMETRÍA DE RED DE MERCADO 2026
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
