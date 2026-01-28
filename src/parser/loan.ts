import type { Parser, RawEmail, Transaction } from "../types";
import { normalizeAmount } from "./amount";
import { randomUUID } from "crypto";
import { getConfig } from "../config";

const LOAN_SUBJECT_PATTERNS = [
  /emi/i,
  /loan\s*(?:repayment|payment|debit|instalment|installment)/i,
  /(?:home|car|personal|auto|vehicle|education)\s*loan/i,
  /equated\s*monthly\s*install?ment/i,
];

const LOAN_BODY_PATTERNS = [
  /emi/i,
  /loan\s*(?:repayment|payment|debit|instalment|installment|account|a\/c)/i,
  /(?:home|car|personal|auto|vehicle|education)\s*loan/i,
  /equated\s*monthly\s*install?ment/i,
  /loan\s*(?:no|number|#|id|account)/i,
];

const AMOUNT_RE = /(?:Rs\.?|INR|₹)\s*[\d,]+(?:\.\d{1,2})?/i;

const LOAN_ACCOUNT_RE =
  /loan\s*(?:a\/c|ac|account|acct)[\s.:]*(?:no\.?\s*)?[\s.:]*([A-Za-z0-9*xX]+[\d]{3,})|loan\s*(?:no\.?|number|#|id)[\s.:]*([A-Za-z0-9*xX]+[\d]{3,})/i;

const EMI_NUMBER_RE =
  /emi\s*(?:no\.?|number|#)[\s.:]*(\d+(?:\s*(?:of|\/)\s*\d+)?)/i;

const ACCOUNT_RE =
  /(?:a\/c|ac|account|acct|bank\s*a\/c)[\s.:]*(?:no\.?\s*)?([xX*]+\d{3,6}|\d{3,6}[xX*]+\d{0,4})/i;

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
  [/bajaj/i, "Bajaj Finance"],
  [/tata\s*capital/i, "Tata Capital"],
  [/mahindra/i, "Mahindra Finance"],
];

const LOAN_TYPE_RE =
  /(?:(home|car|personal|auto|vehicle|education)\s*loan)/i;

const DATE_RE =
  /(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{2,4})/i;

function detectBank(email: RawEmail): string {
  const text = `${email.from} ${email.subject} ${email.bodyText}`;
  for (const [pattern, name] of BANK_PATTERNS) {
    if (pattern.test(text)) return name;
  }
  return "Unknown";
}

function extractLoanAccount(text: string): string | undefined {
  const match = text.match(LOAN_ACCOUNT_RE);
  if (!match) return undefined;
  return match[1] ?? match[2] ?? undefined;
}

function extractEmiNumber(text: string): string | undefined {
  const match = text.match(EMI_NUMBER_RE);
  return match?.[1] ?? undefined;
}

function extractAccount(text: string): string {
  const match = text.match(ACCOUNT_RE);
  return match?.[1] ?? "Unknown";
}

function extractLoanType(text: string): string {
  const match = text.match(LOAN_TYPE_RE);
  if (match?.[1]) {
    const type = match[1].toLowerCase();
    return `${type.charAt(0).toUpperCase()}${type.slice(1)} Loan`;
  }
  return "Loan EMI";
}

function parseDate(text: string, fallback: Date): Date {
  const match = text.match(DATE_RE);
  if (match?.[1]) {
    const parsed = new Date(match[1]);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

export const loanParser: Parser = {
  canParse(email: RawEmail): boolean {
    const text = `${email.subject} ${email.bodyText}`;
    return (
      LOAN_SUBJECT_PATTERNS.some((p) => p.test(email.subject)) ||
      LOAN_BODY_PATTERNS.some((p) => p.test(text))
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
    const loanAccount = extractLoanAccount(fullText);
    const emiNumber = extractEmiNumber(fullText);
    const reference = loanAccount || emiNumber;

    const transaction: Transaction = {
      id: randomUUID(),
      emailMessageId: email.messageId,
      date: parseDate(fullText, email.date),
      amount,
      currency: getConfig().currency.code,
      direction: "debit",
      type: "loan",
      merchant: extractLoanType(fullText),
      account: extractAccount(fullText),
      bank: detectBank(email),
      reference,
      description: email.subject,
      source: "regex",
      needsReview: false,
      createdAt: now,
      updatedAt: now,
    };

    return [transaction];
  },
};
