import { Router } from 'express';
import { BrokerController } from '../controllers/broker.controller';

const router = Router();

router.post('/connect', BrokerController.connect);
router.delete('/disconnect/:connectionId', BrokerController.disconnect);
router.get('/connections', BrokerController.getConnections);
router.patch('/connections/:connectionId/toggle', BrokerController.toggle);
router.post('/orders', BrokerController.placeOrder);
router.get('/holdings/:connectionId', BrokerController.getHoldings);

export { router as brokerRoutes };
