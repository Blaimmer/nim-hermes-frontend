// ── Connection Manager: modo dual NIM PC ──────────────────────────────────
// Orquesta las DOS conexiones del ecosistema:
//   :9119 (hermes serve)  → UI/sesiones/chat (protocolo JSON-RPC portado)
//   :9876 (WSS bridge)    → tools de la PC local (nim_* legacy E2EE)
//
// Modos (NIM_CONN_MODE):
//   'serve'   → solo :9119 (chat, sesiones, cron, skills)
//   'bridge'  → solo :9876 (tools PC, modo legacy)
//   'dual'    → ambos (default recomendado)
import { HermesGateway } from './hermes/api-client'
import { wssClient } from './wss_client'

export type ConnMode = 'serve' | 'bridge' | 'dual'

const DEFAULT_SERVE_URL = 'ws://127.0.0.1:9119'
const DEFAULT_BRIDGE_URL = 'ws://72.60.123.163:9876'

export class ConnectionManager {
  mode: ConnMode = 'dual'
  serveUrl = DEFAULT_SERVE_URL
  bridgeUrl = DEFAULT_BRIDGE_URL

  // Cliente JSON-RPC para :9119 (portado de Hermes Desktop)
  gateway = new HermesGateway()
  // Cliente legacy E2EE para :9876 (tools PC)
  bridge = wssClient

  constructor() {
    const envMode = (typeof process !== 'undefined' ? process.env.NIM_CONN_MODE : undefined) as ConnMode | undefined
    if (envMode === 'serve' || envMode === 'bridge' || envMode === 'dual') {
      this.mode = envMode
    }
  }

  /** Conexión principal: sirve chat/UI (la que la app usa por defecto). */
  get primary() {
    return this.gateway
  }

  /** ¿El puente a la PC está disponible? */
  get hasBridge(): boolean {
    return this.mode === 'bridge' || this.mode === 'dual'
  }

  /** Conecta el modo serve (:9119) — chat/sesiones. */
  async connectServe(): Promise<void> {
    if (this.mode === 'bridge') return
    await this.gateway.connect(this.serveUrl)
  }

  /** Conecta el modo bridge (:9876) — tools PC. Requiere master password. */
  async connectBridge(masterPassword: string): Promise<void> {
    if (this.mode === 'serve') return
    await this.bridge.connect(masterPassword)
  }

  /** Conecta según el modo configurado. */
  async connectAll(masterPassword?: string): Promise<void> {
    await this.connectServe()
    if (this.hasBridge && masterPassword) {
      await this.connectBridge(masterPassword)
    }
  }

  disconnectAll(): void {
    this.gateway.close()
    this.bridge.disconnect?.()
  }
}

export const connectionManager = new ConnectionManager()
