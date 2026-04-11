import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('WsNotifier');

export class WsNotifier {
  private wss: WebSocketServer;
  private clients = new Map<string, Set<WebSocket>>();

  constructor() {
    this.wss = new WebSocketServer({ port: config.wsPort });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const url = new URL(req.url || '', `http://localhost:${config.wsPort}`);
      const userId = url.searchParams.get('userId');

      if (!userId) {
        ws.close(4001, 'userId query param required');
        return;
      }

      if (!this.clients.has(userId)) {
        this.clients.set(userId, new Set());
      }
      this.clients.get(userId)!.add(ws);
      logger.info(`WS client connected: ${userId}`);

      ws.on('close', () => {
        this.clients.get(userId)?.delete(ws);
        if (this.clients.get(userId)?.size === 0) {
          this.clients.delete(userId);
        }
        logger.info(`WS client disconnected: ${userId}`);
      });

      ws.on('pong', () => { /* keep-alive acknowledged */ });
    });

    // Heartbeat every 30s
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) ws.ping();
      });
    }, 30_000);

    logger.info(`WebSocket server listening on port ${config.wsPort}`);
  }

  push(userId: string, payload: Record<string, unknown>): void {
    const sockets = this.clients.get(userId);
    if (!sockets || sockets.size === 0) return;

    const msg = JSON.stringify(payload);
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }

  close(): void {
    this.wss.close();
  }
}
