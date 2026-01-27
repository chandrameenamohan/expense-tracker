import type { Parser, RawEmail, Transaction, TransactionType, TransactionDirection } from "../types";
import { normalizeAmount } from "./amount";
import { randomUUID } from "crypto";

/**
 * Expected JSON shape from the claude CLI response.
 */
interface AiTransaction {
  amount: number | string;
  direction: string;
  type: string;
  merchant: string;
  account?: string;
  bank?: string;
  reference?: string;
  description?: string;
  date?: string;
  confidence: number;
}

interface AiResponse {
  transactions: AiTransaction[];
}

const VALID_TYPES: TransactionType[] = ["upi", "credit_card", "bank_transfer", "sip", "loan"];
const VALID_DIRECTIONS: TransactionDirection[] = ["debit", "credit"];

const PROMPT_TEMPLATE = `You are a financial email parser. Extract transaction details from the following email.

Return ONLY valid JSON (no markdown, no code fences) in this exact format:
{
  "transactions": [
    {
      "amount": 1234.56,
      "direction": "debit" or "credit",
      "type": "upi" or "credit_card" or "bank_transfer" or "sip" or "loan",
      "merchant": "merchant or payee name",
      "account": "masked account/card number if present",
      "bank": "bank name if present",
      "reference": "transaction reference if present",
      "description": "brief description",
      "date": "ISO 8601 date string if present",
      "confidence": 0.0 to 1.0
    }
  ]
}

Rules:
- amount must be a positive number in INR
- confidence reflects how certain you are about the extraction (1.0 = very certain)
- If you cannot extract any transaction, return {"transactions": []}
- Do NOT invent data. Only extract what is clearly stated in the email.

Subject: {{SUBJECT}}
From: {{FROM}}
Date: {{DATE}}

Email body:
{{BODY}}`;

export function buildPrompt(email: RawEmail): string {
  const body = email.bodyText || "";
  return PROMPT_TEMPLATE
    .replace("{{SUBJECT}}", email.subject)
    .replace("{{FROM}}", email.from)
    .replace("{{DATE}}", email.date.toISOString())
    .replace("{{BODY}}", body.slice(0, 8000));
}

/**
 * Parse the raw JSON string from claude CLI into an AiResponse.
 */
export function parseAiResponse(raw: string): AiResponse {
  let text = raw;
  try {
    const wrapper = JSON.parse(raw);
    if (wrapper && typeof wrapper === "object") {
      if (typeof wrapper.result === "string") {
        text = wrapper.result;
      } else if (Array.isArray(wrapper.transactions)) {
        return validateAiResponse(wrapper);
      }
    }
  } catch {
    // Not valid JSON wrapper — try parsing text directly below
  }

  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "");
  text = text.trim();

  const parsed = JSON.parse(text);
  return validateAiResponse(parsed);
}

function validateAiResponse(obj: unknown): AiResponse {
  if (!obj || typeof obj !== "object") {
    return { transactions: [] };
  }
  const record = obj as Record<string, unknown>;
  if (!Array.isArray(record.transactions)) {
    return { transactions: [] };
  }
  return { transactions: record.transactions as AiTransaction[] };
}

export function toTransaction(
  ai: AiTransaction,
  email: RawEmail,
): Transaction | null {
  let amount: number;
  if (typeof ai.amount === "string") {
    const normalized = normalizeAmount(ai.amount);
    if (normalized === null) return null;
    amount = normalized;
  } else if (typeof ai.amount === "number" && ai.amount > 0) {
    amount = ai.amount;
  } else {
    return null;
  }

  const direction = VALID_DIRECTIONS.includes(ai.direction as TransactionDirection)
    ? (ai.direction as TransactionDirection)
    : "debit";

  const type = VALID_TYPES.includes(ai.type as TransactionType)
    ? (ai.type as TransactionType)
    : "bank_transfer";

  const merchant = (ai.merchant || "Unknown").trim();
  if (!merchant) return null;

  const confidence = typeof ai.confidence === "number"
    ? Math.max(0, Math.min(1, ai.confidence))
    : 0.5;

  let date = email.date;
  if (ai.date) {
    const parsed = new Date(ai.date);
    if (!isNaN(parsed.getTime())) {
      date = parsed;
    }
  }

  const now = new Date();

  return {
    id: randomUUID(),
    emailMessageId: email.messageId,
    date,
    amount,
    currency: "INR",
    direction,
    type,
    merchant,
    account: (ai.account || "").trim(),
    bank: (ai.bank || "").trim(),
    reference: ai.reference?.trim() || undefined,
    description: ai.description?.trim() || undefined,
    source: "ai",
    confidence,
    needsReview: confidence < 0.7,
    createdAt: now,
    updatedAt: now,
  };
}

/** Spawn function signature for dependency injection in tests. */
export type SpawnFn = (args: string[]) => { exitCode: number; stdout: string; stderr: string };

/**
 * Creates an AI fallback parser. Accepts an optional custom spawn function
 * for testing (to avoid actually calling the claude CLI).
 */
export function createAiFallbackParser(spawnFn?: SpawnFn): Parser {
  const spawn: SpawnFn = spawnFn ?? ((args) => {
    const proc = Bun.spawnSync(args, {
      stdout: "pipe",
      stderr: "pipe",
    });
    return {
      exitCode: proc.exitCode,
      stdout: proc.stdout.toString(),
      stderr: proc.stderr.toString(),
    };
  });

  return {
    canParse(_email: RawEmail): boolean {
      return true;
    },

    parse(email: RawEmail): Transaction[] | null {
      const prompt = buildPrompt(email);

      let stdout: string;
      try {
        const result = spawn(["claude", "-p", prompt, "--output-format", "json"]);

        if (result.exitCode !== 0) {
          console.error(`AI fallback: claude CLI failed (exit ${result.exitCode}): ${result.stderr}`);
          return null;
        }

        stdout = result.stdout.trim();
      } catch (err) {
        console.error("AI fallback: failed to invoke claude CLI:", err);
        return null;
      }

      if (!stdout) return null;

      let aiResponse: AiResponse;
      try {
        aiResponse = parseAiResponse(stdout);
      } catch (err) {
        console.error("AI fallback: failed to parse response:", err);
        return null;
      }

      if (aiResponse.transactions.length === 0) return null;

      const transactions: Transaction[] = [];
      for (const ai of aiResponse.transactions) {
        const tx = toTransaction(ai, email);
        if (tx) {
          transactions.push(tx);
        }
      }

      return transactions.length > 0 ? transactions : null;
    },
  };
}

/**
 * Default AI fallback parser instance using the real claude CLI.
 */
export const aiFallbackParser: Parser = createAiFallbackParser();
