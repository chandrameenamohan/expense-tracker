import type { Parser, RawEmail, Transaction } from "../types";
import { normalizeAmount } from "./amount";
import { randomUUID } from "crypto";
import { getConfig } from "../config";

const TRANSFER_SUBJECT_PATTERNS = [
  /neft/i,
  /rtgs/i,
  /imps/i,
  /fund\s*transfer/i,
  /salary\s*credit/i,
  /a\/c\s*(?:credited|debited)/i,
  /account\s*(?:credited|debited)/i,
];

const TRANSFER_BODY_PATTERNS = [
  /neft/i,
  /rtgs/i,
  /imps/i,
  /fund\s*transfer/i,
  /salary\s*(?:credit|credited)/i,
  /(?:neft|rtgs|imps)\s*(?:ref|reference|txn|transaction)/i,
  /(?:transferred|transfer)\s*(?:to|from)/i,
];

const AMOUNT_RE = /(?:Rs\.?|INR|₹)\s*[\d,]+(?:\.\d{1,2})?/i;

const REFERENCE_RE =
  /(?:neft|rtgs|imps)\s*(?:ref(?:erence)?|txn|transaction)\s*(?:no\.?|number|id|#)?[\s:]*([A-Z]{4}[A-Z0-9]\d{6,16}|\d{6,18})/i;

const ACCOUNT_RE =
  /(?:a\/c|ac|account|acct)[\s.:]*(?:no\.?\s*)?([xX*]+\d{3,6}|\d{3,6}[xX*]+\d{0,4})/i;

const BANK_PATTERNS: [RegExp, string][] = [
  [/hdfc/i, "HDFC"],
  [/icici/i, "ICICI"],
  [/sbi|state\s*bank/i, "SBI"],
  [/axis/i, "Axis"],
  [/kotak/i, "Kotak"],
  [/pnb|punjab\s*national/i, "PNB"],
  [/bob|bank\s*of\s*baroda/i, "Bank of Baroda"],
  [/canara/i, "Canara"],
  [/union\s*bank/i, "Union Bank"],
  [/idfc/i, "IDFC"],
  [/yes\s*bank/i, "Yes Bank"],
  [/indusind/i, "IndusInd"],
];

const DEBIT_RE =
  /(?:debited|sent|transferred\s*to|debit|paid)/i;
const CREDIT_RE =
  /(?:credited|received|credit|salary|refund)/i;

const SALARY_RE = /salary/i;

const SENDER_RE =
  /(?:from|sender|remitter|by)[\s:]+([A-Za-z0-9\s&.'-]+?)(?:\s*(?:on|via|through|ref|for|rs\.?|inr|₹|a\/c|account|neft|rtgs|imps|\.|$))/i;

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

function extractMerchant(text: string): string {
  if (SALARY_RE.test(text)) return "Salary";
  const match = text.match(SENDER_RE);
  if (match?.[1]) return match[1].trim();
  return "Unknown";
}

function extractReference(text: string): string | undefined {
  const match = text.match(REFERENCE_RE);
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

export const bankTransferParser: Parser = {
  canParse(email: RawEmail): boolean {
    const text = `${email.subject} ${email.bodyText}`;
    return (
      TRANSFER_SUBJECT_PATTERNS.some((p) => p.test(email.subject)) ||
      TRANSFER_BODY_PATTERNS.some((p) => p.test(text))
    );
  },

  parse(email: RawEmail): Transaction[] | null {
    const text = email.bodyText || "";
    const fullText = `${email.subject} ${text}`;

    const amountMatch = fullText.match(AMOUNT_RE);
    if (!amountMatch) return null;

    const amount = normalizeAmount(amountMatch[0]);
    if (amount === null || amount === 0) return null;

    const direction = detectDirection(fullText);
    const now = new Date();

    const transaction: Transaction = {
      id: randomUUID(),
      emailMessageId: email.messageId,
      date: parseDate(fullText, email.date),
      amount,
      currency: getConfig().currency.code,
      direction,
      type: "bank_transfer",
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
