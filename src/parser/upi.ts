import type { Parser, RawEmail, Transaction } from "../types";
import { normalizeAmount } from "./amount";
import { randomUUID } from "crypto";
import { getConfig } from "../config";

/**
 * Patterns to detect UPI transaction emails.
 * Matches Google Pay, PhonePe, and bank UPI alerts from major Indian banks.
 */
const UPI_SUBJECT_PATTERNS = [
  /upi/i,
  /google\s*pay/i,
  /phonepe/i,
  /gpay/i,
  /unified\s*payment/i,
];

const UPI_BODY_PATTERNS = [
  /upi\s*(ref|transaction|txn)/i,
  /upi\s*id/i,
  /vpa/i,
  /google\s*pay/i,
  /phonepe/i,
];

/**
 * Regex patterns for extracting transaction details from UPI emails.
 */

// Amount: "Rs. 1,234.56", "INR 500", "₹1,00,000"
const AMOUNT_RE =
  /(?:Rs\.?|INR|₹)\s*[\d,]+(?:\.\d{1,2})?/i;

// UPI reference number
const UPI_REF_RE =
  /(?:upi\s*(?:ref(?:erence)?|txn|transaction)\s*(?:no\.?|number|id|#)?[\s:]*(\d{6,18}))/i;

// VPA / UPI ID
const VPA_RE =
  /(?:vpa|upi\s*id|paid\s*to|received\s*from|to|from)[\s:]+([a-zA-Z0-9._-]+@[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)/i;

// Merchant name - try to extract from "paid to <name>" or "to <name>" patterns
const MERCHANT_NAME_RE =
  /(?:paid\s*to|sent\s*to|received\s*from|credited\s*from|from)\s+([A-Za-z0-9\s&.'-]+?)(?:\s*(?:on|via|through|upi|vpa|ref|for|rs\.?|inr|₹|\.|$))/i;

// Account identifier (masked account/card number)
const ACCOUNT_RE =
  /(?:a\/c|ac|account|acct)[\s.:]*(?:no\.?\s*)?([xX*]+\d{3,6}|\d{3,6}[xX*]+\d{0,4})/i;

// Bank name detection from sender/body
const BANK_PATTERNS: [RegExp, string][] = [
  [/hdfc/i, "HDFC"],
  [/icici/i, "ICICI"],
  [/sbi|state\s*bank/i, "SBI"],
  [/axis/i, "Axis"],
  [/kotak/i, "Kotak"],
  [/paytm\s*payments\s*bank/i, "Paytm Payments Bank"],
  [/yes\s*bank/i, "Yes Bank"],
  [/bob|bank\s*of\s*baroda/i, "Bank of Baroda"],
  [/pnb|punjab\s*national/i, "PNB"],
  [/idfc/i, "IDFC"],
  [/google\s*pay/i, "Google Pay"],
  [/phonepe/i, "PhonePe"],
];

// Direction detection
const DEBIT_RE =
  /(?:debited|sent|paid|debit|transferred|spent|charged)/i;
const CREDIT_RE =
  /(?:credited|received|credit|refund|cashback)/i;

// Date patterns
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
  // Check credit first since "credited" is more specific
  if (CREDIT_RE.test(text)) return "credit";
  if (DEBIT_RE.test(text)) return "debit";
  return "debit"; // default to debit
}

function extractMerchant(text: string): string {
  // Try merchant name pattern first
  const nameMatch = text.match(MERCHANT_NAME_RE);
  if (nameMatch?.[1]) {
    return nameMatch[1].trim();
  }

  // Fall back to VPA
  const vpaMatch = text.match(VPA_RE);
  if (vpaMatch?.[1]) {
    return vpaMatch[1];
  }

  return "Unknown";
}

function extractReference(text: string): string | undefined {
  const match = text.match(UPI_REF_RE);
  return match?.[1] ?? undefined;
}

function extractAccount(text: string): string {
  const match = text.match(ACCOUNT_RE);
  return match?.[1] ?? "Unknown";
}

function parseDate(text: string, fallback: Date): Date {
  const match = text.match(DATE_RE);
  if (match?.[1]) {
    const parsed = new Date(match[1]);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

export const upiParser: Parser = {
  canParse(email: RawEmail): boolean {
    const text = `${email.subject} ${email.bodyText}`;
    return (
      UPI_SUBJECT_PATTERNS.some((p) => p.test(email.subject)) ||
      UPI_BODY_PATTERNS.some((p) => p.test(text))
    );
  },

  parse(email: RawEmail): Transaction[] | null {
    const text = email.bodyText || "";
    const fullText = `${email.subject} ${text}`;

    // Extract amount
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
      currency: getConfig().currency.code,
      direction: detectDirection(fullText),
      type: "upi",
      merchant: extractMerchant(fullText),
      account: extractAccount(fullText),
      bank: detectBank(email),
      reference: extractReference(fullText),
      description: email.subject,
      source: "regex",
      needsReview: false,
      createdAt: now,
      updatedAt: now,
    };

    return [transaction];
  },
};
