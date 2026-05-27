import { cronManager } from './cron';
import fs from 'fs/promises';
import path from 'path';

// El latido del sistema que despierta a NIM periódicamente
// para evaluar órdenes permanentes (Standing Orders) y tareas en segundo plano.

export class Heartbeat {
  private static isInitialized = false;

  static init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Ejecutar el latido cada 30 minutos
    cronManager.startJob('nim-heartbeat', '*/30 * * * *', async () => {
      console.log(`\n💓 [HEARTBEAT] Iniciando ciclo de autonomía agéntica...`);
      await this.evaluateStandingOrders();
    });
  }

  static async evaluateStandingOrders() {
    try {
      const ordersPath = path.join(__dirname, '../data/standing_orders.md');
      const orders = await fs.readFile(ordersPath, 'utf8');
      
      console.log(`📜 [STANDING ORDERS] NIM está revisando sus directivas permanentes.`);
      // En una implementación completa, aquí enviaríamos las Standing Orders al LLM
      // pidiéndole que decida si hay alguna tarea en segundo plano que deba iniciar ahora.
      // fetch('http://localhost:3050/api/webhook/execute', { ... prompt: 'Revisa las standing orders...' })
      
    } catch (e) {
      console.log(`⚠️ [HEARTBEAT] No se encontraron Standing Orders activas.`);
    }
  }
}
