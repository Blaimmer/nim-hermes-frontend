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
}

export interface Stats {
  latency: number;
  cpu: number;
  memory: string;
  networkStatus: 'NOMINAL' | 'DEGRADED' | 'DISCONNECTED';
}
