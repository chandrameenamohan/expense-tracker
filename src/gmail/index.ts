export {
  getConfigDir,
  getCredentialsPath,
  getTokenPath,
  hasCredentials,
  hasToken,
} from "./config";

export {
  createOAuth2Client,
  getAuthUrl,
  exchangeCodeForToken,
  loadToken,
  saveToken,
  deleteToken,
  isTokenValid,
  authenticate,
} from "./auth";
export type { StoredToken } from "./auth";

export { buildQuery, listMessageIds } from "./query";

export { withRetry, isRateLimitError, computeDelay } from "./rate-limit";
export type { RetryOptions } from "./rate-limit";

export { fetchMessages } from "./fetch";

export { syncEmails } from "./sync";
export type { SyncOptions, SyncResult } from "./sync";
