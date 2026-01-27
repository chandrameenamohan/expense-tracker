/**
 * Amount normalization utility for Indian currency formats.
 * Strips currency symbols (Rs., INR, ₹), removes commas,
 * and returns a positive number.
 */

const CURRENCY_PREFIX = /^[\s]*(?:Rs\.?|INR|₹)[\s]*/i;
const CURRENCY_SUFFIX = /[\s]*(?:Rs\.?|INR|₹)[\s]*$/i;
const COMMAS = /,/g;
const WHITESPACE = /\s/g;

/**
 * Normalize an amount string to a positive number.
 * Handles formats like:
 *   "Rs. 1,50,000.00", "INR 2,500", "₹500", "1,50,000.00"
 * Returns null if the string cannot be parsed.
 */
export function normalizeAmount(raw: string): number | null {
  if (!raw || typeof raw !== "string") return null;

  let cleaned = raw.trim();

  // Strip currency symbols from start and end
  cleaned = cleaned.replace(CURRENCY_PREFIX, "");
  cleaned = cleaned.replace(CURRENCY_SUFFIX, "");

  // Remove commas and whitespace
  cleaned = cleaned.replace(COMMAS, "");
  cleaned = cleaned.replace(WHITESPACE, "");

  if (!cleaned) return null;

  const num = Number(cleaned);
  if (Number.isNaN(num) || !Number.isFinite(num)) return null;

  return Math.abs(num);
}

/**
 * Extract the first amount found in a text string.
 * Looks for patterns like "Rs. 1,234.56", "INR 500", "₹1,00,000".
 */
const AMOUNT_PATTERN =
  /(?:Rs\.?|INR|₹)\s*[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})?\s*(?:Rs\.?|INR|₹)/i;

export function extractAmount(text: string): number | null {
  if (!text) return null;
  const match = text.match(AMOUNT_PATTERN);
  if (!match) return null;
  return normalizeAmount(match[0]);
}
