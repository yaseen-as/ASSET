import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import Redis from 'ioredis';
import { config } from '../config';
import type { WSClientMessage, WSServerMessage, WSTickData } from '@platform/shared';

interface ClientInfo {
  ws: WebSocket;
  userId: string;
  subscribedSymbols: Set<string>;
  lastPong: number;
}

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, ClientInfo>();
  private symbolSubscribers = new Map<string, Set<string>>(); // symbol → Set<clientId>
  private redisSub: Redis | null = null;
  private redisPub: Redis | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  async start(port: number): Promise<void> {
    this.wss = new WebSocketServer({ port });

    // Setup Redis Pub/Sub
    this.redisSub = new Redis(config.redis.url);
    this.redisPub = new Redis(config.redis.url);

    // Subscribe to market tick channel
    await this.redisSub.psubscribe('market:tick:*');
    this.redisSub.on('pmessage', (_pattern, channel, message) => {
      this.handleRedisTick(channel, message);
    });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    // Heartbeat every 30s
    this.heartbeatInterval = setInterval(() => this.checkHeartbeats(), 30000);

    console.log(`WebSocket server running on port ${port}`);
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    // Extract userId from query params (set by gateway)
    const url = new URL(req.url || '', `http://localhost`);
    const userId = url.searchParams.get('userId') || 'anonymous';
    const clientId = `${userId}_${Date.now()}`;

    const client: ClientInfo = {
      ws,
      userId,
      subscribedSymbols: new Set(),
      lastPong: Date.now(),
    };

    this.clients.set(clientId, client);

    ws.on('message', (data) => {
      try {
        const msg: WSClientMessage = JSON.parse(data.toString());
        this.handleClientMessage(clientId, msg);
      } catch {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'Invalid message format' } }));
      }
    });

    ws.on('pong', () => {
      client.lastPong = Date.now();
    });

    ws.on('close', () => {
      this.handleDisconnect(clientId);
    });

    ws.on('error', () => {
      this.handleDisconnect(clientId);
    });
  }

  private handleClientMessage(clientId: string, msg: WSClientMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (msg.action === 'subscribe') {
      for (const symbol of msg.symbols) {
        client.subscribedSymbols.add(symbol);
        if (!this.symbolSubscribers.has(symbol)) {
          this.symbolSubscribers.set(symbol, new Set());
        }
        this.symbolSubscribers.get(symbol)!.add(clientId);
      }
    } else if (msg.action === 'unsubscribe') {
      for (const symbol of msg.symbols) {
        client.subscribedSymbols.delete(symbol);
        this.symbolSubscribers.get(symbol)?.delete(clientId);
        // Clean up empty sets
        if (this.symbolSubscribers.get(symbol)?.size === 0) {
          this.symbolSubscribers.delete(symbol);
        }
      }
    }
  }

  private handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from all symbol subscriptions
    for (const symbol of client.subscribedSymbols) {
      this.symbolSubscribers.get(symbol)?.delete(clientId);
      if (this.symbolSubscribers.get(symbol)?.size === 0) {
        this.symbolSubscribers.delete(symbol);
      }
    }

    this.clients.delete(clientId);
  }

  private handleRedisTick(channel: string, message: string): void {
    // channel format: market:tick:NSE:RELIANCE
    const parts = channel.split(':');
    const symbolKey = `${parts[2]}:${parts[3]}`; // NSE:RELIANCE

    const subscribers = this.symbolSubscribers.get(symbolKey);
    if (!subscribers || subscribers.size === 0) return;

    const tickData = JSON.parse(message) as WSTickData;
    const wsMessage: WSServerMessage = { type: 'tick', data: tickData };
    const payload = JSON.stringify(wsMessage);

    for (const clientId of subscribers) {
      const client = this.clients.get(clientId);
      if (client && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }

  // Publish tick to Redis (called when receiving data from broker feed)
  async publishTick(tick: WSTickData): Promise<void> {
    const channel = `market:tick:${tick.exchange}:${tick.symbol}`;
    await this.redisPub?.publish(channel, JSON.stringify(tick));
  }

  private checkHeartbeats(): void {
    const now = Date.now();
    for (const [clientId, client] of this.clients) {
      if (now - client.lastPong > 90000) { // 90s timeout
        client.ws.terminate();
        this.handleDisconnect(clientId);
      } else {
        client.ws.ping();
      }
    }
  }

  async stop(): Promise<void> {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.wss?.close();
    await this.redisSub?.quit();
    await this.redisPub?.quit();
  }
}
