import { handleEntitlementRefreshRequest } from '../../src/server/accountHandlers';

export default async function handler(request: Request): Promise<Response> {
    return handleEntitlementRefreshRequest(request);
}
