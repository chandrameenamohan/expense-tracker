import type { Parser, RawEmail, Transaction } from "../types";
import { normalizeAmount } from "./amount";
import { randomUUID } from "crypto";

const SIP_SUBJECT_PATTERNS = [
  /sip/i,
  /mutual\s*fund/i,
  /systematic\s*investment/i,
  /nav\s*applied/i,
  /units?\s*allot/i,
  /purchase\s*(?:order|confirmation)/i,
];

const SIP_BODY_PATTERNS = [
  /sip/i,
  /mutual\s*fund/i,
  /systematic\s*investment/i,
  /folio\s*(?:no|number|#|:)/i,
  /nav\s*(?:applied|date|rs)/i,
  /units?\s*(?:allot|purchas|credit)/i,
  /(?:bse|nse)\s*(?:order|transaction)/i,
  /scheme\s*(?:name|code)/i,
];

const AMOUNT_RE = /(?:Rs\.?|INR|₹)\s*[\d,]+(?:\.\d{1,2})?/i;

const FOLIO_RE =
  /folio\s*(?:no\.?|number|#)?[\s:]*(\d{5,20}(?:\/\d+)?)/i;

const FUND_NAME_RE =
  /(?:scheme\s+name|fund\s+name|plan\s+name)[\s:]+([A-Za-z0-9\s&.()'-]+?)(?:\s*(?:folio|nav|amount|rs\.?|inr|₹|direct|regular|growth|dividend|has|is|was|\.|$))/i;

const FUND_NAME_IN_RE =
  /(?:sip|investment|purchase)\s+(?:in|of|for)\s+(?:scheme\s+name\s+)?([A-Za-z0-9\s&.()'-]+?)(?:\s*(?:folio|nav|amount|rs\.?|inr|₹|has|is|was|via|\.|$))/i;

const FUND_NAME_GENERIC_RE =
  /(?:scheme|fund|plan)[\s:]+([A-Za-z0-9\s&.()'-]+?)(?:\s*(?:folio|nav|amount|rs\.?|inr|₹|direct|regular|growth|dividend|has|is|was|\.|$))/i;

const ACCOUNT_RE =
  /(?:a\/c|ac|account|acct|bank\s*a\/c)[\s.:]*(?:no\.?\s*)?([xX*]+\d{3,6}|\d{3,6}[xX*]+\d{0,4})/i;

const BANK_PATTERNS: [RegExp, string][] = [
  [/hdfc/i, "HDFC"],
  [/icici/i, "ICICI"],
  [/sbi|state\s*bank/i, "SBI"],
  [/axis/i, "Axis"],
  [/kotak/i, "Kotak"],
  [/paytm\s*money/i, "Paytm Money"],
  [/zerodha|kite/i, "Zerodha"],
  [/groww/i, "Groww"],
  [/kuvera/i, "Kuvera"],
  [/cams/i, "CAMS"],
  [/karvy|kfintech/i, "KFintech"],
];

const DATE_RE =
  /(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{2,4})/i;

function detectBank(email: RawEmail): string {
  const text = `${email.from} ${email.subject} ${email.bodyText}`;
  for (const [pattern, name] of BANK_PATTERNS) {
    if (pattern.test(text)) return name;
  }
  return "Unknown";
}

function extractFundName(text: string): string {
  const match = text.match(FUND_NAME_RE) || text.match(FUND_NAME_IN_RE) || text.match(FUND_NAME_GENERIC_RE);
  if (match?.[1]) return match[1].trim();
  return "Unknown Fund";
}

function extractFolio(text: string): string | undefined {
  const match = text.match(FOLIO_RE);
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

export const sipParser: Parser = {
  canParse(email: RawEmail): boolean {
    const text = `${email.subject} ${email.bodyText}`;
    return (
      SIP_SUBJECT_PATTERNS.some((p) => p.test(email.subject)) ||
      SIP_BODY_PATTERNS.some((p) => p.test(text))
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
    const folio = extractFolio(fullText);

    const transaction: Transaction = {
      id: randomUUID(),
      emailMessageId: email.messageId,
      date: parseDate(fullText, email.date),
      amount,
      currency: "INR",
      direction: "debit",
      type: "sip",
      merchant: extractFundName(fullText),
      account: extractAccount(fullText),
      bank: detectBank(email),
      reference: folio,
      description: email.subject,
      source: "regex",
      needsReview: false,
      createdAt: now,
      updatedAt: now,
    };

    return [transaction];
  },
};
