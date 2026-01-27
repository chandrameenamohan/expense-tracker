import { ParserRegistry } from "./registry";
import { upiParser } from "./upi";
import { creditCardParser } from "./credit-card";
import { bankTransferParser } from "./bank-transfer";
import { sipParser } from "./sip";
import { loanParser } from "./loan";
import { aiFallbackParser, createAiFallbackParser } from "./ai-fallback";
import type { SpawnFn } from "./ai-fallback";
import type { RawEmail, Transaction } from "../types";

/**
 * Creates a fully configured parser pipeline with all regex parsers
 * registered in priority order, plus the AI fallback.
 * Pass a custom spawnFn to override the claude CLI invocation (for testing).
 */
export function createParserPipeline(spawnFn?: SpawnFn): ParserRegistry {
  const registry = new ParserRegistry();

  // Register regex parsers in priority order:
  // 1. UPI — most common in India
  // 2. Credit card
  // 3. Bank transfer (NEFT/RTGS/IMPS)
  // 4. SIP (mutual fund)
  // 5. Loan (EMI)
  registry.register(upiParser);
  registry.register(creditCardParser);
  registry.register(bankTransferParser);
  registry.register(sipParser);
  registry.register(loanParser);

  // AI fallback for unrecognized email formats
  if (spawnFn) {
    registry.setFallback(createAiFallbackParser(spawnFn));
  } else {
    registry.setFallback(aiFallbackParser);
  }

  return registry;
}

/**
 * Parse a single raw email through the full pipeline.
 * Returns parsed transactions or an empty array.
 */
export function parseEmail(
  pipeline: ParserRegistry,
  email: RawEmail,
): Transaction[] {
  return pipeline.parse(email);
}

/**
 * Parse multiple raw emails through the pipeline.
 * Returns a flat array of all parsed transactions.
 */
export function parseEmails(
  pipeline: ParserRegistry,
  emails: RawEmail[],
): Transaction[] {
  const results: Transaction[] = [];
  for (const email of emails) {
    const txs = pipeline.parse(email);
    results.push(...txs);
  }
  return results;
}
