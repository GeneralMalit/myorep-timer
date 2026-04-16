import { handlePaddleWebhookRequest } from '../../src/server/billingHandlers';

export default async function handler(request: Request): Promise<Response> {
    return handlePaddleWebhookRequest(request);
}
