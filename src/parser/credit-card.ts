import type { Parser, RawEmail, Transaction } from "../types";
import { normalizeAmount } from "./amount";
import { randomUUID } from "crypto";

/**
 * Patterns to detect credit card transaction emails from Indian banks.
 */
const CC_SUBJECT_PATTERNS = [
  /credit\s*card/i,
  /card\s*transaction/i,
  /card\s*(?:has\s*been\s*)?(?:used|charged|swiped|swipe)/i,
  /card\s*ending/i,
  /card\s*no/i,
];

const CC_BODY_PATTERNS = [
  /credit\s*card/i,
  /card\s*(?:no\.?|number|ending)\s*(?:xx|[*xX]+)\d{4}/i,
  /card\s*(?:used|charged|swiped)/i,
  /(?:pos|ecom|online)\s*(?:transaction|purchase|txn)/i,
];

// Amount
const AMOUNT_RE = /(?:Rs\.?|INR|₹)\s*[\d,]+(?:\.\d{1,2})?/i;

// Card number (masked) - e.g., "XX1234", "XXXX1234", "****1234", "card ending 1234"
const CARD_RE =
  /(?:card\s*(?:no\.?|number|ending|#)?\s*(?:is\s*)?[:\s]*)([xX*]+\d{4}|\d{4})/i;

// Merchant - "at <merchant>" or "at <merchant> on" or "Info: <merchant>"
const MERCHANT_RE =
  /(?:at|@|merchant[:\s]|info[:\s])\s*([A-Za-z0-9\s&.'_-]+?)\s+(?:on\s+\d|for\s+Rs|of\s+Rs|dated|date|rs\.?\s*\d|inr\s*\d|₹\s*\d|amounting|amount)/i;

// Bank detection
const BANK_PATTERNS: [RegExp, string][] = [
  [/hdfc/i, "HDFC"],
  [/icici/i, "ICICI"],
  [/sbi|state\s*bank/i, "SBI"],
  [/axis/i, "Axis"],
  [/amex|american\s*express/i, "Amex"],
  [/kotak/i, "Kotak"],
  [/citibank|citi/i, "Citi"],
  [/rbl/i, "RBL"],
  [/indusind/i, "IndusInd"],
  [/yes\s*bank/i, "Yes Bank"],
];

// Direction
const DEBIT_RE =
  /(?:debited|spent|charged|used|swiped|purchase|debit|txn\s*of|transaction\s*of)/i;
const CREDIT_RE =
  /(?:credited|refund|reversal|cashback|credit(?!.*card))/i;

// Date
const DATE_RE =
  /(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{2,4})/i;

function detectBank(email: RawEmail): string {
  const text = `${email.from} ${email.subject} ${email.bodyText}`;
  for (const [pattern, name] of BANK_PATTERNS) {
    if (pattern.test(text)) return name;
  }
  return "Unknown";
}

function detectDirection(text: string): "debit" | "credit" {
  if (CREDIT_RE.test(text)) return "credit";
  if (DEBIT_RE.test(text)) return "debit";
  return "debit";
}

function extractCard(text: string): string {
  const match = text.match(CARD_RE);
  if (match?.[1]) {
    const val = match[1];
    // If it's just 4 digits, prefix with XX
    if (/^\d{4}$/.test(val)) return `XX${val}`;
    return val.toUpperCase();
  }
  return "Unknown";
}

function extractMerchant(text: string): string {
  const match = text.match(MERCHANT_RE);
  if (match?.[1]) return match[1].trim();
  return "Unknown";
}

function parseDate(text: string, fallback: Date): Date {
  const match = text.match(DATE_RE);
  if (match?.[1]) {
    const parsed = new Date(match[1]);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

export const creditCardParser: Parser = {
  canParse(email: RawEmail): boolean {
    const text = `${email.subject} ${email.bodyText}`;
    return (
      CC_SUBJECT_PATTERNS.some((p) => p.test(email.subject)) ||
      CC_BODY_PATTERNS.some((p) => p.test(text))
    );
  },

  parse(email: RawEmail): Transaction[] | null {
    const text = email.bodyText || "";
    const fullText = `${email.subject} ${text}`;

    const amountMatch = fullText.match(AMOUNT_RE);
    if (!amountMatch) return null;

    const amount = normalizeAmount(amountMatch[0]);
    if (amount === null || amount === 0) return null;

    const now = new Date();

    const transaction: Transaction = {
      id: randomUUID(),
      emailMessageId: email.messageId,
      date: parseDate(fullText, email.date),
      amount,
      currency: "INR",
      direction: detectDirection(fullText),
      type: "credit_card",
      merchant: extractMerchant(fullText),
      account: extractCard(fullText),
      bank: detectBank(email),
      description: email.subject,
      source: "regex",
      needsReview: false,
      createdAt: now,
      updatedAt: now,
    };

    return [transaction];
  },
};
