export type SystemStatus = 'STANDBY' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR';

export interface HermesModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  strengths: string;
  custom?: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'thought' | 'action' | 'observation' | 'response' | 'system' | 'user';
  message: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'nim';
  text: string;
  timestamp: string;
  modelUsed?: string;
  streaming?: boolean;
}

export interface Skill {
  id: string;
  name: string;
  status: 'Activa' | 'Inactiva' | 'Error';
  isEnabled: boolean;
  description: string;
  callCount: number;
  environment?: 'PC' | 'VPS';
}

export interface Stats {
  latency: number;
  cpu: number;
  memory: string;
  networkStatus: 'NOMINAL' | 'DEGRADED' | 'DISCONNECTED';
}

// ===== NIM DASHBOARD V2 — Nuevos tipos =====

export interface NIMAgent {
  id: string;
  name: string;
  role: string;
  icon: string;
  status: 'online' | 'idle' | 'offline' | 'error';
  lastActive: string;
  metrics: {
    tasksCompleted: number;
    successRate: number;
    avgTime: string;
  };
  description: string;
}

export interface NIMTask {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  agentId: string;
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
  description: string;
}

export interface NIMCronJob {
  id: string;
  name: string;
  schedule: string;
  nextRun: string;
  lastRun: string;
  status: 'active' | 'paused' | 'error';
  prompt: string;
}

export interface NIMClient {
  id: string;
  name: string;
  company: string;
  status: 'lead' | 'contacted' | 'negotiation' | 'closed' | 'lost';
  lastContact: string;
  notes: string;
  value: string;
}

export interface MetricPoint {
  timestamp: string;
  sessions: number;
  tokens: number;
  toolCalls: number;
  memoryUsed: string;
}
