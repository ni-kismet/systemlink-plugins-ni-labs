import { API_ROUTES } from './api.constants';

/** Default headers applied to all SystemLink API requests. */
export const DEFAULT_HTTP_HEADERS = {
  'Content-Type': 'application/json',
  accept: 'application/json',
} as const;

/** Central retry policy for transient API failures on safe read/query endpoints. */
const RETRIABLE_STATUS_CODES: readonly number[] = [0, 408, 429, 502, 503, 504];

/** Central retry policy for transient API failures on safe read/query endpoints. */
export const HTTP_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 500,
  // Only retry safe read/query routes. Mutating endpoints are excluded to avoid
  // replaying writes or deletes and causing duplicate side effects.
  retriableRoutes: [
    API_ROUTES.getUser,
    API_ROUTES.getAuth,
    API_ROUTES.queryUsers,
    API_ROUTES.queryProducts,
    API_ROUTES.querySystems,
    API_ROUTES.queryAssets,
    API_ROUTES.queryWorkItemTemplates,
    API_ROUTES.queryUserDataItems,
  ],
  retriableStatusCodes: RETRIABLE_STATUS_CODES,
} as const;
