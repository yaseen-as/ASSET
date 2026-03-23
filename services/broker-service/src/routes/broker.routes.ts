import { Router } from 'express';
import { BrokerController } from '../controllers/broker.controller';
import { OrderController } from '../controllers/order.controller';
import { SymbolController } from '../controllers/symbol.controller';
import { PaperController } from '../controllers/paper.controller';
import { MarketController } from '../controllers/market.controller';

const router = Router();

// ─── Real-time market data (Angel One) ──────────────────────────────────────
router.get('/market/quote/:exchange/:symbol', MarketController.getQuote);

// ─── Broker connection management ────────────────────────────────────────────
router.post('/connect', BrokerController.connect);
router.delete('/disconnect/:connectionId', BrokerController.disconnect);
router.get('/connections', BrokerController.getConnections);
router.patch('/connections/:connectionId/toggle', BrokerController.toggle);
router.get('/holdings/:connectionId', BrokerController.getHoldings);
router.get('/feed-tokens', BrokerController.getFeedTokens);
router.get('/feed-tokens/active', BrokerController.getActiveFeedTokens);

// ─── Order management ────────────────────────────────────────────────────────
router.post('/orders', OrderController.placeOrder);
router.get('/orders', OrderController.getOrders);
router.get('/orders/stats', OrderController.getOrderStats);
router.get('/orders/:orderId', OrderController.getOrder);
router.delete('/orders/:orderId/cancel', OrderController.cancelOrder);

// ─── Symbol master ───────────────────────────────────────────────────────────
router.get('/symbols/search', SymbolController.search);
router.get('/symbols/:exchange/:symbol', SymbolController.getSymbol);
router.post('/symbols/sync', SymbolController.syncMaster);

// ─── Paper trading ───────────────────────────────────────────────────────────
router.get('/paper/balance', PaperController.getBalance);
router.post('/paper/reset', PaperController.reset);

export { router as brokerRoutes };
