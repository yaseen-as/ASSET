import { SignalGeneratorService } from '../services/signal-generator.service';
import { SignalRepository } from '../repositories/signal.repository';

export class SignalScheduler {
  private generator: SignalGeneratorService;
  private signalRepo: SignalRepository;
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    this.generator = new SignalGeneratorService();
    this.signalRepo = new SignalRepository();
  }

  start(): void {
    // Run signal generation every 4 hours
    const intervalMs = 4 * 60 * 60 * 1000;
    this.timer = setInterval(() => this.run(), intervalMs);

    // Run on startup after a delay (allow market-data-service to seed data first)
    setTimeout(() => this.runIfStale(), 30000);
  }

  private async run(): Promise<void> {
    console.log('[SignalScheduler] Starting scheduled signal generation...');
    const total = await this.generator.generateForAllSymbols();
    console.log(`[SignalScheduler] Done. Created ${total} new signal(s).`);
  }

  private async runIfStale(): Promise<void> {
    try {
      const latest = await this.signalRepo.getLatestSignalDate();
      const hoursSinceLast = latest
        ? (Date.now() - new Date(latest).getTime()) / 3600000
        : Infinity;

      if (hoursSinceLast > 20) {
        console.log('[SignalScheduler] No recent signals found, generating now...');
        await this.run();
      } else {
        console.log(`[SignalScheduler] Last signal ${Math.round(hoursSinceLast)}h ago, skipping startup run.`);
      }
    } catch (err: any) {
      console.error(`[SignalScheduler] Startup check failed: ${err.message}`);
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
