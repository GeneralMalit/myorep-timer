import { handlePaddlePortalRequest } from '../../src/server/billingHandlers.ts';
import { withWebHandler } from '../_utils/webHandler.ts';

export default withWebHandler(handlePaddlePortalRequest);
