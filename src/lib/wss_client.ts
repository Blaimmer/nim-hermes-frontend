import { security } from "./security";
import { invoke } from "@tauri-apps/api/core";

export class NimWssClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: any = null;
  private password = "";
  private url = "ws://72.60.123.163:9876";
  public onBotMessage: ((text: string, state: string) => void) | null = null;
  public onStreamStart: ((sessionId?: string) => void) | null = null;
  public onStreamDelta: ((text: string) => void) | null = null;
  public onStreamComplete: ((text: string, interrupted?: boolean) => void) | null = null;
  public onToolCall: ((call: any) => void) | null = null;
  public onSkillsUpdate: ((skills: any[]) => void) | null = null;
  public onModelsList: ((models: any[]) => void) | null = null;
  public onSoulData: ((soul: any) => void) | null = null;
  public onLog: ((type: string, message: string) => void) | null = null;

  constructor() {}

  async connect(masterPassword: string) {
    this.password = masterPassword;
    console.log("Derivando llave criptográfica...");
    await security.setMasterKey(this.password);
    
    this.initWebSocket();
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private initWebSocket() {
    if (this.ws) {
      this.ws.close();
    }

    console.log(`Conectando a Hermes VPS: ${this.url}`);
    this.ws = new WebSocket(this.url);

    this.ws.onopen = async () => {
      console.log("WebSocket conectado. Enviando handshake cifrado...");
      const handshake = {
        type: "handshake",
        device: {
          type: "windows",
          name: "Nim-PC",
          os: "Windows 11",
          hostname: "creator-desktop"
        },
        capabilities: [
          "nim_terminal",
          "nim_filesystem",
          "nim_browser",
          "nim_patch_file",
          "nim_grep_search",
          "nim_list_dir",
          "nim_file_ops",
          "nim_code_exec",
          "nim_checkpoint",
          "nim_computer_use",
          "nim_antigravity"
        ],
        version: "2.0.0"
      };

      const encrypted = await security.encryptPayload(JSON.stringify(handshake));
      this.ws?.send(encrypted);
    };

    this.ws.onmessage = async (event) => {
      try {
        const encryptedPayload = event.data;
        const decryptedJson = await security.decryptPayload(encryptedPayload);
        const data = JSON.parse(decryptedJson);

        if (this.onLog && data.type !== 'ping' && data.type !== 'pong') {
          this.onLog('system', `[WSS IN] ${data.type}`);
        }

        this.handleMessage(data);
      } catch (err) {
        console.error("Error descifrando o parseando mensaje de Hermes:", err);
      }
    };

    this.ws.onclose = () => {
      console.log("WebSocket cerrado. Reconectando en 5s...");
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.initWebSocket(), 5000);
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket Error:", error);
    };
  }

  private async handleMessage(data: any) {
    console.log("Mensaje de Hermes:", data);

    if (data.type === "handshake_ack") {
      console.log(`✅ Conexión E2EE establecida con éxito. Fingerprint: ${data.key_fingerprint}`);
      return;
    }

    if (data.type === "ping") {
      const pong = { type: "pong", ts: data.ts };
      const enc = await security.encryptPayload(JSON.stringify(pong));
      this.ws?.send(enc);
      return;
    }

    if (data.type === "bot_message" && this.onBotMessage) {
      this.onBotMessage(data.text, data.bot_state || 'idle');
      return;
    }

    // ── STREAMING (message_start / message_delta / message_complete) ──
    if (data.type === "message_start") {
      if (this.onStreamStart) this.onStreamStart(data.session_id);
      return;
    }

    if (data.type === "message_delta") {
      if (this.onStreamDelta) this.onStreamDelta(data.text || "");
      return;
    }

    if (data.type === "message_complete") {
      if (this.onStreamComplete) this.onStreamComplete(data.text || "", !!data.interrupted);
      return;
    }

    if (data.type === "skills_update" && this.onSkillsUpdate) {
      this.onSkillsUpdate(data.skills);
      return;
    }

    if (data.type === "tool_call") {
      if (this.onToolCall) this.onToolCall(data);
      await this.executeToolCall(data);
      return;
    }

    if (data.type === "models_list" && this.onModelsList) {
      this.onModelsList(data.models);
      return;
    }

    if (data.type === "soul_data" && this.onSoulData) {
      this.onSoulData(data);
      return;
    }
  }

  // Enviar texto al VPS
  public async sendUserMessage(text: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const payload = { type: "user_message", text };
    if (this.onLog) this.onLog('system', `[WSS OUT] user_message`);
    const enc = await security.encryptPayload(JSON.stringify(payload));
    this.ws.send(enc);
  }

  // Enviar fragmento de audio al VPS (Base64)
  public async sendUserAudio(audioBase64: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const payload = { type: "user_audio", audio_base64: audioBase64, sample_rate: 16000 };
    if (this.onLog) this.onLog('system', `[WSS OUT] user_audio`);
    const enc = await security.encryptPayload(JSON.stringify(payload));
    this.ws.send(enc);
  }

  // UI Event: Solicitar lista de modelos
  public async getModels() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const payload = { type: "get_models" };
    const enc = await security.encryptPayload(JSON.stringify(payload));
    this.ws.send(enc);
  }

  // UI Event: Cambiar modelo
  public async switchModel(modelId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const payload = { type: "switch_model", modelId };
    if (this.onLog) this.onLog('system', `[WSS OUT] switch_model: ${modelId}`);
    const enc = await security.encryptPayload(JSON.stringify(payload));
    this.ws.send(enc);
  }

  // UI Event: Configurar Modelos Rápidos
  public async configQuickModels(models: string[]) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const payload = { type: "config_quick_models", models };
    const enc = await security.encryptPayload(JSON.stringify(payload));
    this.ws.send(enc);
  }

  // UI Event: Actualizar Memoria a Largo Plazo
  public async updateSoul(block: 'human' | 'persona' | 'task', content: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const payload = { type: "update_soul", block, content };
    if (this.onLog) this.onLog('system', `[WSS OUT] update_soul: ${block}`);
    const enc = await security.encryptPayload(JSON.stringify(payload));
    this.ws.send(enc);
  }

  // UI Event: Solicitar Memoria
  public async getSoul() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const payload = { type: "get_soul" };
    const enc = await security.encryptPayload(JSON.stringify(payload));
    this.ws.send(enc);
  }

  private async executeToolCall(call: any) {
    const callId = call.call_id;
    const name = call.tool_name;
    const args = call.arguments;

    let resultPayload: any = {
      type: "tool_result",
      call_id: callId,
      tool_name: name,
      result: {}
    };

    try {
      if (name === "nim_terminal") {
        const stdout = await invoke("nim_terminal", { command: args.command, cwd: args.cwd || "" });
        resultPayload.result = { stdout, exit_code: 0, stderr: "" };
      } else if (name === "nim_filesystem") {
        const output = await invoke("nim_filesystem", { 
          action: args.action, 
          path: args.path, 
          content: args.content || "" 
        });
        resultPayload.result = { stdout: output, exit_code: 0 };
      } else if (name === "nim_patch_file") {
        const output = await invoke("nim_patch_file", {
          path: args.path,
          target: args.target,
          replacement: args.replacement
        });
        resultPayload.result = { stdout: output, exit_code: 0 };
      } else if (name === "nim_list_dir") {
        const output = await invoke("nim_list_dir", { path: args.path });
        resultPayload.result = { stdout: output, exit_code: 0 };
      } else if (name === "nim_grep_search") {
        const output = await invoke("nim_grep_search", { query: args.query, path: args.path });
        resultPayload.result = { stdout: output, exit_code: 0 };
      } else if (name === "nim_file_ops") {
        const output = await invoke("nim_file_ops", {
          action: args.action,
          path: args.path,
          dest: args.dest || ""
        });
        resultPayload.result = { stdout: output, exit_code: 0 };
      } else if (name === "nim_code_exec") {
        const output = await invoke("nim_code_exec", {
          lang: args.lang || "python",
          code: args.code,
          timeoutSecs: args.timeout_secs || 30
        });
        resultPayload.result = { stdout: output, exit_code: 0 };
      } else if (name === "nim_checkpoint") {
        const output = await invoke("nim_checkpoint", {
          action: args.action,
          path: args.path,
          label: args.label || ""
        });
        resultPayload.result = { stdout: output, exit_code: 0 };
      } else if (name === "nim_computer_use") {
        const output = await invoke("nim_computer_use", {
          action: args.action,
          x: args.x || 0,
          y: args.y || 0,
          text: args.text || ""
        });
        resultPayload.result = { stdout: output, exit_code: 0 };
      } else if (name === "nim_antigravity") {
        const output = await invoke("nim_antigravity", {
          prompt: args.prompt || "",
          cwd: args.cwd || "",
          timeout_secs: args.timeout_secs || 0
        });
        resultPayload.result = { stdout: output, exit_code: 0 };
      } else {
        resultPayload.result = { error: `Tool ${name} not implemented yet.` };
      }
    } catch (e: any) {
      resultPayload.result = { error: e.toString() };
    }

    // Cifrar y devolver al VPS
    if (this.onLog) this.onLog('system', `[WSS OUT] tool_result (${name}) exit_code: ${resultPayload.result.exit_code}`);
    const encResult = await security.encryptPayload(JSON.stringify(resultPayload));
    this.ws?.send(encResult);
  }
}

export const wssClient = new NimWssClient();
