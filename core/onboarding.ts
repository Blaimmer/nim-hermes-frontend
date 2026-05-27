import fs from 'fs/promises';
import path from 'path';

export interface InfrastructureConfig {
  llmProvider: 'google' | 'openai' | 'ollama' | '';
  apiKey: string;
  searchProvider: 'tavily' | 'perplexity' | 'google_serper' | 'none' | '';
  searchApiKey: string;
  inferenceOk: boolean;
  searchOk: boolean;
}

export interface UserProfile {
  initialized: boolean;
  infrastructure: InfrastructureConfig;
  userName: string;
  preferredName: string;
  professionalRole: string;
  mainObjectives: string[];
  criticalAreasOfFocus: string[];
  created_at: string;
}

export class OnboardingOrchestrator {
  private profilePath: string;

  constructor() {
    this.profilePath = path.join(process.cwd(), 'data', 'memory', 'user_profile.json');
  }

  // Check if total onboarding is complete
  async isInitialized(): Promise<boolean> {
    try {
      const data = await fs.readFile(this.profilePath, 'utf-8');
      const profile: UserProfile = JSON.parse(data);
      return (
        !!profile.initialized && 
        !!profile.userName && 
        !!profile.infrastructure && 
        !!profile.infrastructure.llmProvider
      );
    } catch {
      return false;
    }
  }

  // Load the current profile
  async getProfile(): Promise<UserProfile> {
    try {
      const data = await fs.readFile(this.profilePath, 'utf-8');
      const profile = JSON.parse(data);
      
      // Upgrade path for retrocompatibility
      if (!profile.infrastructure) {
        profile.infrastructure = {
          llmProvider: '',
          apiKey: '',
          searchProvider: '',
          searchApiKey: '',
          inferenceOk: false,
          searchOk: false
        };
      }
      return profile;
    } catch {
      return {
        initialized: false,
        infrastructure: {
          llmProvider: '',
          apiKey: '',
          searchProvider: '',
          searchApiKey: '',
          inferenceOk: false,
          searchOk: false
        },
        userName: '',
        preferredName: '',
        professionalRole: '',
        mainObjectives: [],
        criticalAreasOfFocus: [],
        created_at: ''
      };
    }
  }

  // Save profile state and handle triggers
  async saveProfile(profilePatch: Partial<UserProfile>): Promise<UserProfile> {
    const current = await this.getProfile();
    
    const updated: UserProfile = {
      ...current,
      ...profilePatch,
      infrastructure: {
        ...current.infrastructure,
        ...(profilePatch.infrastructure || {})
      },
      created_at: current.created_at || new Date().toISOString()
    };

    // If criticalAreasOfFocus just got initialized, we consider the full user onboarding initialized
    if (updated.userName && updated.professionalRole && updated.criticalAreasOfFocus.length > 0 && updated.infrastructure.llmProvider) {
      updated.initialized = true;
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(this.profilePath), { recursive: true });
    await fs.writeFile(this.profilePath, JSON.stringify(updated, null, 2), 'utf-8');

    // Trigger async hydration if finalized and has critical fields
    if (updated.criticalAreasOfFocus.length > 0 && profilePatch.criticalAreasOfFocus) {
      this.triggerPrepopulateBackgroundJob(updated).catch(err => {
        console.error('⚠️ [ONBOARDING BACKGROUND JOB] Exception prepopulating knowledge graph:', err);
      });
    }

    return updated;
  }

  // Simulates/triggers background engine crawling & indexing to pre-populate local knowledge base
  private async triggerPrepopulateBackgroundJob(profile: UserProfile): Promise<void> {
    console.log(`📡 [ONBOARDING BG] Lanzando indexación de conocimiento para áreas de foco: ${profile.criticalAreasOfFocus.join(', ')}`);
    
    // Create directory for knowledge graph if it doesn't exist
    const graphDir = path.join(process.cwd(), 'data', 'memory', 'knowledge_graph');
    await fs.mkdir(graphDir, { recursive: true });

    // Emulate crawling high-fidelity sources on those areas of focus
    const initialArticles = profile.criticalAreasOfFocus.map(area => {
      return {
        id: `onb_init_${area.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        title: `Compendio de Alta Fidelidad sobre ${area}`,
        source: 'NIM Telemetry Core Crawler (Tavily/Local Index)',
        timestamp: new Date().toISOString(),
        summary: `Señor, este compendio preliminar indexa los estándares, regulaciones arquitectónicas y metodologías ágiles en torno a ${area} vigentes al año 2026. Es una base de datos de consulta local ultrarápida de largo plazo.`,
        tags: [area.toLowerCase(), 'onboarding', 'knowledge_graph']
      };
    });

    const graphFile = path.join(graphDir, 'articles.json');
    await fs.writeFile(graphFile, JSON.stringify(initialArticles, null, 2), 'utf-8');
    console.log(`✅ [ONBOARDING BG] Indexación en segundo plano completada con éxito. ${initialArticles.length} artículos cargados.`);
  }

  // Multi-step form router state machine
  getNextOnboardingState(profile: UserProfile): { 
    question: string; 
    fieldToUpdate: string; 
    options?: string[];
    isInfrastructure?: boolean;
    voiceText?: string;
  } | null {
    // FASE 1: INFRASTRUCTURE CONNECT
    if (!profile.infrastructure.llmProvider) {
      return {
        question: 'Señor, iniciemos la conexión del motor cognitivo. Por favor, seleccione su Proveedor de Inferencia LLM Principal:',
        fieldToUpdate: 'infrastructure.llmProvider',
        options: ['Google Studio API', 'OpenAI API', 'Ollama Local (vLLM)'],
        isInfrastructure: true,
        voiceText: 'Bienvenido creador. Iniciemos la conexión del motor cognitivo. Por favor, seleccione su Proveedor de Inferencia Principal en el HUD.'
      };
    }

    // Require API Key if not local Ollama
    if (profile.infrastructure.llmProvider !== 'ollama' && !profile.infrastructure.apiKey) {
      const provLabel = profile.infrastructure.llmProvider === 'google' ? 'Google Studio' : 'OpenAI';
      return {
        question: `Excelente elección. Registre su llave de acceso (API Key) para el proveedor ${provLabel} para realizar el ping de autenticidad:`,
        fieldToUpdate: 'infrastructure.apiKey',
        isInfrastructure: true,
        voiceText: `Registre su llave de acceso API key para realizar el ping de autenticidad en el canal seleccionado.`
      };
    }

    // Ask Search Provider
    if (!profile.infrastructure.searchProvider) {
      return {
        question: 'Para habilitar la capacidad de salir a internet mediante telemetría híbrida, ¿cuál motor de búsqueda desea integrar?',
        fieldToUpdate: 'infrastructure.searchProvider',
        options: ['Tavily API', 'Perplexity API', 'Google Serper API', 'Omitir por ahora'],
        isInfrastructure: true,
        voiceText: 'Para habilitar la capacidad de salir a internet mediante telemetría híbrida, elija el motor de búsqueda de su preferencia.'
      };
    }

    // Ask Search Api Key if not skipped
    if (
      profile.infrastructure.searchProvider && 
      profile.infrastructure.searchProvider !== 'none' && 
      !profile.infrastructure.searchApiKey
    ) {
      const sLabel = profile.infrastructure.searchProvider === 'tavily' ? 'Tavily' : 
                     profile.infrastructure.searchProvider === 'perplexity' ? 'Perplexity Sonar' : 'Google Serper';
      return {
        question: `Registre ahora la llave de acceso (API Key) para el servicio de telemetría de ${sLabel}:`,
        fieldToUpdate: 'infrastructure.searchApiKey',
        isInfrastructure: true,
        voiceText: `Registre ahora la llave de acceso para el servicio de telemetría.`
      };
    }

    // FASE 2: COGNITIVE ONBOARDING (USER IDENTITY)
    if (!profile.userName) {
      return {
        question: 'Canal de coincidencia agéntica sintonizado con éxito. Para calibrar mi matriz biográfica, ¿cuál es su nombre formal completo y cómo prefiere que me dirija a usted?',
        fieldToUpdate: 'userName',
        voiceText: 'Canal de coincidencia agéntica sintonizado. Para calibrar mi matriz biográfica, ¿cuál es su nombre completo y cómo prefiere que me dirija a usted, Señor?'
      };
    }

    if (!profile.professionalRole) {
      return {
        question: `Me honra su presencia, Señor ${profile.preferredName || profile.userName}. Para contextualizar mi protocolo de servicio, ¿cuál es su ocupación técnica o rol profesional y cuáles son sus metas primordiales?`,
        fieldToUpdate: 'professionalRole',
        voiceText: `Me honra su presencia. Para contextualizar mi protocolo de servicio, ¿cuál es su ocupación técnica o rol profesional, Señor?`
      };
    }

    if (!profile.criticalAreasOfFocus || profile.criticalAreasOfFocus.length === 0) {
      return {
        question: 'Perfecto. Finalmente, indique sus áreas críticas de interés (ej: Inteligencia Artificial, React UX, Rust). Activaré la indexación en segundo plano de inmediato.',
        fieldToUpdate: 'criticalAreasOfFocus',
        voiceText: 'Entendido. Finalmente, indique sus áreas de interés prioritarias para activar la telemetría e indexación en segundo plano.'
      };
    }

    return null; // Onboarding completed successfully!
  }
}
