import { handlePaddleWebhookRequest } from '../../src/server/billingHandlers.ts';
import { withWebHandler } from '../_utils/webHandler.ts';

export const config = { api: { bodyParser: false } };

export default withWebHandler(handlePaddleWebhookRequest);
