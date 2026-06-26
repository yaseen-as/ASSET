import { Router } from 'express';
import { BrokerController } from './broker.controller';
import { OrderController } from './order.controller';
import { SymbolController } from './symbol.controller';
import { PaperController } from './paper.controller';
import { MarketController } from './market.controller';

const router = Router();

// ─── Upstox OAuth flow ──────────────────────────────────────────────────────
router.get('/broker/status', BrokerController.getStatus);
router.get('/broker/connect/upstox', BrokerController.connectUpstox);
router.get('/broker/callback/upstox', BrokerController.callbackUpstox);

// ─── Real-time market data (via Upstox) ─────────────────────────────────────
router.get('/market/quote/:exchange/:symbol', MarketController.getQuote);

// ─── Broker connection management ───────────────────────────────────────────
router.delete('/disconnect/:connectionId', BrokerController.disconnect);
router.get('/broker/connections', BrokerController.getConnections);
router.patch('/connections/:connectionId/toggle', BrokerController.toggle);
router.get('/holdings/:connectionId', BrokerController.getHoldings);

// ─── Order management ───────────────────────────────────────────────────────
router.post('/orders', OrderController.placeOrder);
router.get('/broker/orders', OrderController.getOrders);
router.get('/orders/stats', OrderController.getOrderStats);
router.get('/orders/:orderId', OrderController.getOrder);
router.delete('/orders/:orderId/cancel', OrderController.cancelOrder);

// ─── Symbol / instrument master ─────────────────────────────────────────────
router.get('/symbols/search', SymbolController.search);
router.get('/symbols/:exchange/:symbol', SymbolController.getSymbol);
router.post('/symbols/sync', SymbolController.syncMaster);

// ─── Paper trading ──────────────────────────────────────────────────────────
router.get('/broker/paper/balance', PaperController.getBalance);
router.get('/broker/paper/positions', PaperController.getPositions);
router.post('/paper/reset', PaperController.reset);

export { router as brokerRoutes };
