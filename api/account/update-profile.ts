import { handleProfileUpdateRequest } from '../../src/server/accountHandlers';

export default async function handler(request: Request): Promise<Response> {
    return handleProfileUpdateRequest(request);
}
