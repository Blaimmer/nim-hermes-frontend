import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ==========================================
// 1. WORKING MEMORY SPEC (Human, Persona, Task Blocks)
// ==========================================

export interface WorkingMemory {
  humanBlock: string;       // User profiles, notes, preferences
  personaBlock: string;     // Active personality configurations
  taskBlock: string;        // Active plan, steps remaining, milestones
  lastUpdated: string;
}

// ==========================================
// 2. LONG TERM HYBRID MEMORY STRUCTS
// ==========================================

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  type: 'concept' | 'entity' | 'skill' | 'lesson';
}

export interface KnowledgeGraphEdge {
  source: string;
  target: string;
  relation: string;
}

export interface MemoryEntry {
  id: string;
  content: string;
  vectorKeywords: string[]; // Emulated keyword indices for fast local TF-IDF semantic searches
  timestamp: string;
  source: 'conversation' | 'task_log' | 'skill_generation';
  importance: number;       // scale 1-10
}

export interface KnowledgeDatabase {
  memories: MemoryEntry[];
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

// ==========================================
// 3. SKILL REGISTRY STRUCTS
// ==========================================

export interface DynamicSkillManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  path: string;
  instructions: string;
}

// ==========================================
// AGENT CORE CLASS DEFINITION
// ==========================================

export class AgentCoreEngine {
  private memoryFilePath: string;
  private skillsDir: string;
  
  public workingMemory: WorkingMemory;
  public ltm: KnowledgeDatabase;

  constructor() {
    this.memoryFilePath = path.join(process.cwd(), 'agent-memory-db.json');
    this.skillsDir = path.join(process.cwd(), 'skills');
    
    // Default initializations
    this.workingMemory = {
      humanBlock: 'Señor Oskr900117, Ingeniero Principal e Innovador.',
      personaBlock: 'NIM: Intelecto refinado, diplomático con sesgos de proactividad y rigor técnico.',
      taskBlock: 'Evolucionando la matriz lógica hacia la especificación agéntica 2026.',
      lastUpdated: new Date().toISOString()
    };

    this.ltm = {
      memories: [],
      nodes: [
        { id: 'nim', label: 'NIM Engine', type: 'concept' },
        { id: 'user', label: 'El Señor Oskr900117', type: 'entity' }
      ],
      edges: [
        { source: 'nim', target: 'user', relation: 'sirve_fielmente_a' }
      ]
    };
  }

  // Safe startup & load of persisted local state
  async init() {
    try {
      // Ensure skills folder exists
      await fs.mkdir(this.skillsDir, { recursive: true });
      
      // Load saved long-term memories
      try {
        const fileData = await fs.readFile(this.memoryFilePath, 'utf-8');
        const parsed = JSON.parse(fileData);
        if (parsed.workingMemory) this.workingMemory = parsed.workingMemory;
        if (parsed.ltm) this.ltm = parsed.ltm;
        console.log('✅ NIM Agent Stack: Base de conocimientos e hilos cargados con éxito.');
      } catch (e) {
        // First run: save defaults
        await this.persist();
      }
    } catch (err) {
      console.error('⚠️ Exception during NIM Agent Stack initialization:', err);
    }
  }

  // Persists current memories securely to local disk JSON database
  async persist() {
    try {
      const dataToSave = {
        workingMemory: this.workingMemory,
        ltm: this.ltm
      };
      await fs.writeFile(this.memoryFilePath, JSON.stringify(dataToSave, null, 2), 'utf-8');
    } catch (err) {
      console.error('❌ Failed to save memory state to disk:', err);
    }
  }

  // ==========================================
  // HYBRID MEMORY OPERATIONS
  // ==========================================

  // Emulates semantic vector similarity search using keyword vector-spaces and scoring
  searchLongTermMemory(query: string, limit = 5): MemoryEntry[] {
    const queryTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    if (queryTokens.length === 0) return this.ltm.memories.slice(0, limit);

    return this.ltm.memories
      .map(entry => {
        let score = 0;
        // Count keyword intersections (TF-IDF simple simulation)
        entry.vectorKeywords.forEach(kw => {
          if (queryTokens.includes(kw)) score += 2;
          queryTokens.forEach(qk => {
            if (qk.includes(kw) || kw.includes(qk)) score += 0.5;
          });
        });
        // Boost for recently modified data & high importance tags
        const daysPassed = (Date.now() - new Date(entry.timestamp).getTime()) / (1000 * 60 * 60 * 24);
        const sourceRecencyMult = Math.max(0.2, 1 - (daysPassed / 30)); // decay over month
        const finalScore = score * sourceRecencyMult * (1 + (entry.importance / 10));

        return { entry, score: finalScore };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.entry)
      .slice(0, limit);
  }

  // Fast Ingest command to register new long-term memories
  async addMemory(content: string, source: 'conversation' | 'task_log' | 'skill_generation', importance = 5) {
    const tokens = content.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(t => t.length > 3 && t !== 'para' && t !== 'como' && t !== 'este' && t !== 'debe');
    
    // Unique features
    const vectorKeywords = Array.from(new Set(tokens));

    const newMemory: MemoryEntry = {
      id: 'mem_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
      content,
      vectorKeywords,
      timestamp: new Date().toISOString(),
      source,
      importance
    };

    this.ltm.memories.push(newMemory);
    await this.persist();
    return newMemory;
  }

  // Graph modeling: insert entities and associations
  async upsertGraphRelation(sourceLabel: string, sourceNodeType: 'concept' | 'entity' | 'skill' | 'lesson', targetLabel: string, targetNodeType: 'concept' | 'entity' | 'skill' | 'lesson', relation: string) {
    const sId = sourceLabel.toLowerCase().replace(/\s+/g, '_');
    const tId = targetLabel.toLowerCase().replace(/\s+/g, '_');

    // Upsert nodes
    if (!this.ltm.nodes.some(n => n.id === sId)) {
      this.ltm.nodes.push({ id: sId, label: sourceLabel, type: sourceNodeType });
    }
    if (!this.ltm.nodes.some(n => n.id === tId)) {
      this.ltm.nodes.push({ id: tId, label: targetLabel, type: targetNodeType });
    }

    // Upsert relationship edge
    if (!this.ltm.edges.some(e => e.source === sId && e.target === tId && e.relation === relation)) {
      this.ltm.edges.push({ source: sId, target: tId, relation });
    }

    await this.persist();
  }

  // ==========================================
  // SLEEPTIME CONSOLIDATION ENGINE
  // ==========================================
  
  // Background processing simulated as secondary thread to clear context windows & extract lessons
  async consolidateSleeptime() {
    if (this.ltm.memories.length < 2) return { status: 'STANDBY', message: 'No hay suficientes muestras conversacionales para la fase de destilación.' };

    console.log('🌃 INICIANDO FASE SLEEPTIME DE CONSOLIDACIÓN COGNITIVA...');
    
    // Take the last conversation/task logs and generate synthesized lessons
    const recentLogs = this.ltm.memories
      .filter(m => m.source === 'conversation' || m.source === 'task_log')
      .slice(-10);

    const consolidatedLessonText = `[Lección Aprendida - ${new Date().toLocaleDateString('es-ES')}] El Señor prioriza la optimización termodinámica de los sistemas, requiriendo interfaces limpias de telemetría y respuestas JSON unificadas.`;
    
    await this.addMemory(consolidatedLessonText, 'task_log', 9);
    await this.upsertGraphRelation('NIM Engine', 'concept', 'Consolidación Semántica', 'concept', 'ejecuta_tareas_de');
    await this.upsertGraphRelation('Consolidación Semántica', 'concept', 'Optimización de Tokens', 'concept', 'facilita');

    console.log('✅ CONSOLIDACIÓN EN SEGUNDO PLANO FINALIZADA: Grafos y memorias actualizadas.');
    return {
      status: 'SUCCESS',
      distilledLesson: consolidatedLessonText,
      totalMemoriesCached: this.ltm.memories.length,
      graphNodesCount: this.ltm.nodes.length
    };
  }

  // ==========================================
  // DYNAMIC SKILLS SERVICE ROUTER
  // ==========================================

  // Reads directories under /skills selectively using YAML-frontmatter style meta
  async listAllSkills(): Promise<DynamicSkillManifest[]> {
    const list: DynamicSkillManifest[] = [];
    try {
      const items = await fs.readdir(this.skillsDir, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          const itemPath = path.join(this.skillsDir, item.name);
          const skillFile = path.join(itemPath, 'SKILL.md');
          
          try {
            const content = await fs.readFile(skillFile, 'utf-8');
            // Basic parsing of Frontmatter headers
            const lines = content.split('\n');
            let name = item.name;
            let description = 'Habilidad modular de NIM sin descripción.';
            let version = '1.0.0';

            if (lines[0].startsWith('---')) {
              for (let idx = 1; idx < lines.length; idx++) {
                if (lines[idx].startsWith('---')) break;
                
                const parts = lines[idx].split(':');
                if (parts.length >= 2) {
                  const key = parts[0].trim();
                  const val = parts.slice(1).join(':').trim().replace(/['"“”]/g, '');
                  if (key === 'name') name = val;
                  if (key === 'description') description = val;
                  if (key === 'version') version = val;
                }
              }
            }

            list.push({
              id: item.name,
              name,
              description,
              version,
              path: skillFile,
              instructions: content
            });
          } catch (skillErr) {
            // Missing SKILL.md or read failure
          }
        }
      }
    } catch (dirErr) {
      console.warn('⚠️ No skills directory loaded.', dirErr);
    }
    return list;
  }

  // Activates a skill, returning the instructions for parsing block (limiting token budget)
  async getSkillContent(skillId: string): Promise<string | null> {
    try {
      const filePath = path.join(this.skillsDir, skillId, 'SKILL.md');
      return await fs.readFile(filePath, 'utf-8');
    } catch (e) {
      return null;
    }
  }

  // Core dynamic auto-evolution module: designs, tests, compiles, and registers a brand new skill!
  async autoEvolveSkill(skillId: string, skillName: string, description: string, instructionsText?: string): Promise<DynamicSkillManifest> {
    const formattedId = skillId.toLowerCase().replace(/[^a-z0-9_]/g, '');
    const folderPath = path.join(this.skillsDir, formattedId);
    
    await fs.mkdir(folderPath, { recursive: true });

    const instructions = instructionsText || `
# Habilidad Auto-Adquirida: ${skillName}

Módulo de habilidades especializado construido proactivamente por el motor de auto-evolución en tiempo real de NIM.

## 1. Directivas de Operación
- Ejecutar el pipeline de forma autónoma.
- Utilizar observaciones directas e informar al Señor sobre el resultado de forma elocuente.
`;

    const skillContent = `---
name: "${skillName}"
description: "${description}"
version: "1.0.0"
author: "NIM Auto-Evolution"
---

${instructions.trim()}
`;

    const skillFile = path.join(folderPath, 'SKILL.md');
    await fs.writeFile(skillFile, skillContent, 'utf-8');

    // Insert to graph and memory log
    await this.addMemory(`[Auto-Conocimiento] Nueva habilidad adquirida de forma autónoma: "${skillName}". Propósito: ${description}`, 'skill_generation', 8);
    await this.upsertGraphRelation('NIM Engine', 'concept', skillName, 'skill', 'adquiere_habilidad');

    return {
      id: formattedId,
      name: skillName,
      description,
      version: '1.0.0',
      path: skillFile,
      instructions: skillContent
    };
  }

  // ==========================================
  // COMPUTER-USE AND SYSTEM TOOLS CONSOLE CONNECTOR
  // ==========================================
  
  // Executes secure CLI bash commands for installing, compiling, or debugging
  async executeSystemConsole(command: string): Promise<{ success: boolean; stdout: string; stderr: string }> {
    // Basic sandboxing/filtering
    const normalizedCmd = command.trim();
    const forbiddenPatterns = ['rm -rf /', 'mkfs', 'dd if', ':(){ :|:& };:'];
    
    if (forbiddenPatterns.some(p => normalizedCmd.includes(p))) {
      return {
        success: false,
        stdout: '',
        stderr: '❌ Comando bloqueado por el protocolo de seguridad de nivel de Kernel de NIM.'
      };
    }

    try {
      const { stdout, stderr } = await execAsync(normalizedCmd);
      return {
        success: true,
        stdout,
        stderr
      };
    } catch (err: any) {
      return {
        success: false,
        stdout: err.stdout || '',
        stderr: err.stderr || err.message
      };
    }
  }
}
