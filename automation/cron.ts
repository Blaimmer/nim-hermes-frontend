import cron from 'node-cron';

// NIM Autonomous Cron Scheduler
export class CronManager {
  private jobs: Map<string, cron.ScheduledTask> = new Map();

  startJob(id: string, expression: string, task: () => void) {
    if (this.jobs.has(id)) {
      this.jobs.get(id)?.stop();
    }
    const newJob = cron.schedule(expression, task);
    this.jobs.set(id, newJob);
    console.log(`⏱️ [CRON] Trabajo programado: ${id} (${expression})`);
  }

  stopJob(id: string) {
    if (this.jobs.has(id)) {
      this.jobs.get(id)?.stop();
      this.jobs.delete(id);
      console.log(`⏱️ [CRON] Trabajo detenido: ${id}`);
    }
  }

  listJobs() {
    return Array.from(this.jobs.keys());
  }
}

export const cronManager = new CronManager();
