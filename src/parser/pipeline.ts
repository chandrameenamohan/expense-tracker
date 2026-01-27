import { ParserRegistry } from "./registry";
import { aiFallbackParser, createAiFallbackParser } from "./ai-fallback";
import type { SpawnFn } from "./ai-fallback";
import type { RawEmail, Transaction } from "../types";

/**
 * Creates a parser pipeline that uses AI (Claude CLI) for all parsing.
 * Pass a custom spawnFn to override the claude CLI invocation (for testing).
 */
export function createParserPipeline(spawnFn?: SpawnFn): ParserRegistry {
  const registry = new ParserRegistry();

  // Use AI for all email parsing
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
