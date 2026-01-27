import { describe, it, expect, mock } from "bun:test";
import { withRetry, isRateLimitError, computeDelay } from "../../src/gmail/rate-limit";

describe("isRateLimitError", () => {
  it("detects error with code 429", () => {
    expect(isRateLimitError({ code: 429 })).toBe(true);
  });

  it("detects error with status 429", () => {
    expect(isRateLimitError({ status: 429 })).toBe(true);
  });

  it("detects error with response.status 429", () => {
    expect(isRateLimitError({ response: { status: 429 } })).toBe(true);
  });

  it("returns false for non-429 errors", () => {
    expect(isRateLimitError({ code: 500 })).toBe(false);
    expect(isRateLimitError(new Error("network"))).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
  });
});

describe("computeDelay", () => {
  it("increases exponentially", () => {
    const d0 = 1000 * 2 ** 0; // 1000
    const d1 = 1000 * 2 ** 1; // 2000
    const d2 = 1000 * 2 ** 2; // 4000

    // With jitter (50-100%), delay is in [base*0.5, base]
    const delay0 = computeDelay(0, 1000, 32000);
    expect(delay0).toBeGreaterThanOrEqual(d0 * 0.5);
    expect(delay0).toBeLessThanOrEqual(d0);

    const delay1 = computeDelay(1, 1000, 32000);
    expect(delay1).toBeGreaterThanOrEqual(d1 * 0.5);
    expect(delay1).toBeLessThanOrEqual(d1);

    const delay2 = computeDelay(2, 1000, 32000);
    expect(delay2).toBeGreaterThanOrEqual(d2 * 0.5);
    expect(delay2).toBeLessThanOrEqual(d2);
  });

  it("caps at maxDelayMs", () => {
    const delay = computeDelay(10, 1000, 5000);
    expect(delay).toBeLessThanOrEqual(5000);
  });
});

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const result = await withRetry(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("retries on 429 and succeeds", async () => {
    let calls = 0;
    const fn = () => {
      calls++;
      if (calls < 3) return Promise.reject({ code: 429 });
      return Promise.resolve("ok");
    };

    const result = await withRetry(fn, { initialDelayMs: 1, maxDelayMs: 2 });
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("throws non-429 errors immediately", async () => {
    const fn = () => Promise.reject(new Error("auth failed"));
    await expect(withRetry(fn, { initialDelayMs: 1 })).rejects.toThrow("auth failed");
  });

  it("throws after max retries exhausted", async () => {
    const fn = () => Promise.reject({ code: 429 });
    await expect(
      withRetry(fn, { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 2 }),
    ).rejects.toEqual({ code: 429 });
  });

  it("respects maxRetries option", async () => {
    let calls = 0;
    const fn = () => {
      calls++;
      return Promise.reject({ code: 429 });
    };

    try {
      await withRetry(fn, { maxRetries: 3, initialDelayMs: 1, maxDelayMs: 2 });
    } catch {}

    // 1 initial + 3 retries = 4 calls
    expect(calls).toBe(4);
  });
});
