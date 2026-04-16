import { Request, Response, NextFunction } from 'express';
import { BrokerService } from './broker.service';
import { UpstoxAuthService } from './upstox-auth.service';

const brokerService = new BrokerService();
const upstoxAuth = new UpstoxAuthService();

export class BrokerController {
  // ─── Upstox OAuth flow ──────────────────────────────────────────────────────

  /** Returns the Upstox authorization URL. Frontend opens this in a browser. */
  static async connectUpstox(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const authUrl = upstoxAuth.buildAuthUrl(userId);
      res.json({ success: true, data: { authUrl } });
    } catch (error) { next(error); }
  }

  /** Upstox redirects here after user authorizes. Exchanges code → token. */
  static async callbackUpstox(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const code = req.query.code as string;
      const userId = req.query.state as string;

      if (!code || !userId) {
        res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing code or state' } });
        return;
      }

      await upstoxAuth.handleCallback(code, userId);

      // Redirect to frontend success page (or return JSON for SPA)
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/broker/connected`);
    } catch (error) { next(error); }
  }

  /** Check if the current user has an active broker connection. */
  static async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const status = await upstoxAuth.getStatus(userId);
      res.json({ success: true, data: status });
    } catch (error) { next(error); }
  }

  // ─── Existing connection management ─────────────────────────────────────────

  static async disconnect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      await brokerService.disconnect(userId, req.params.connectionId);
      res.json({ success: true, message: 'Disconnected successfully.' });
    } catch (error) { next(error); }
  }

  static async getConnections(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const connections = await brokerService.getConnections(userId);
      res.json({ success: true, data: connections });
    } catch (error) { next(error); }
  }

  static async toggle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const connection = await brokerService.toggleConnection(userId, req.params.connectionId, req.body.isActive);
      res.json({ success: true, data: connection });
    } catch (error) { next(error); }
  }

  static async getHoldings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const holdings = await brokerService.getHoldings(userId, req.params.connectionId);
      res.json({ success: true, data: holdings });
    } catch (error) { next(error); }
  }
}

export { brokerService };
