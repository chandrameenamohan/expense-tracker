/**
 * Retry wrapper with exponential backoff for Gmail API 429 (rate limit) errors.
 */

/** Options for the retry wrapper */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 5) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in ms between retries (default: 32000) */
  maxDelayMs?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 32000,
};

/**
 * Returns true if the error is a Gmail API 429 rate limit error.
 */
export function isRateLimitError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const err = error as { code?: number; status?: number; response?: { status?: number } };
    if (err.code === 429 || err.status === 429) return true;
    if (err.response?.status === 429) return true;
  }
  return false;
}

/**
 * Computes the delay for a given attempt using exponential backoff with jitter.
 */
export function computeDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
): number {
  const exponential = initialDelayMs * 2 ** attempt;
  const capped = Math.min(exponential, maxDelayMs);
  // Add jitter: 50-100% of computed delay
  const jitter = 0.5 + Math.random() * 0.5;
  return Math.floor(capped * jitter);
}

/**
 * Executes an async function with exponential backoff retry on 429 errors.
 * Non-429 errors are thrown immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRateLimitError(error)) throw error;

      lastError = error;
      if (attempt === opts.maxRetries) break;

      const delay = computeDelay(attempt, opts.initialDelayMs, opts.maxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
