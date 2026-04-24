import { handleEntitlementRefreshRequest } from '../../src/server/accountHandlers.ts';
import { withWebHandler } from '../_utils/webHandler.ts';

export default withWebHandler(handleEntitlementRefreshRequest);
