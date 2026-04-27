import { AlertRepository, AlertRow } from './alert.repository';
import { createLogger } from '../utils/logger';

const logger = createLogger('AlertService');

export class AlertService {
  private repo: AlertRepository;

  constructor() {
    this.repo = new AlertRepository();
  }

  async createAlert(userId: string, data: {
    symbol: string;
    exchange?: string;
    condition_type: string;
    threshold: number;
    label?: string;
    note?: string;
    expires_at?: string;
  }): Promise<AlertRow> {
    const alert = await this.repo.create({
      user_id: userId,
      symbol: data.symbol.toUpperCase(),
      exchange: (data.exchange || 'NSE').toUpperCase(),
      condition_type: data.condition_type,
      threshold: data.threshold,
      label: data.label,
      note: data.note,
      expires_at: data.expires_at ? new Date(data.expires_at) : null,
    });

    logger.info(`Alert created: ${alert.id} for ${alert.symbol}`);
    return alert;
  }

  async getUserAlerts(userId: string, status?: string): Promise<AlertRow[]> {
    return this.repo.findByUser(userId, status);
  }

  async getAlertById(id: string, userId: string): Promise<AlertRow | null> {
    const alert = await this.repo.findById(id);
    if (!alert || alert.user_id !== userId) return null;
    return alert;
  }

  async updateAlert(id: string, userId: string, data: Partial<Pick<AlertRow, 'label' | 'note' | 'threshold' | 'condition_type' | 'status' | 'expires_at'>>): Promise<AlertRow | null> {
    const alert = await this.repo.findById(id);
    if (!alert || alert.user_id !== userId) return null;
    return (await this.repo.update(id, data)) || null;
  }

  async deleteAlert(id: string, userId: string): Promise<boolean> {
    return this.repo.delete(id, userId);
  }

  async reactivateAlert(id: string, userId: string): Promise<AlertRow | null> {
    const alert = await this.repo.findById(id);
    if (!alert || alert.user_id !== userId) return null;
    if (alert.status !== 'triggered' && alert.status !== 'disabled') return null;
    return (await this.repo.update(id, { status: 'active' })) || null;
  }

  /** Used by the evaluation engine */
  getRepository(): AlertRepository {
    return this.repo;
  }
}
