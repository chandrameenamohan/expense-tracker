/**
 * Category assignment module.
 * Uses Claude CLI to assign a category to a transaction based on
 * merchant, amount, type, and description.
 */

import type { CategoryCorrection, Transaction } from "../types";
import type { ClaudeCli } from "./claude-cli";
import {
  getRecentCorrections,
  getCorrectionsByMerchant,
} from "../db/category-corrections";

/** All valid categories */
export const CATEGORIES = [
  "Food",
  "Transport",
  "Shopping",
  "Bills",
  "Entertainment",
  "Health",
  "Education",
  "Investment",
  "Transfer",
  "Other",
] as const;

/** Human-readable descriptions so the LLM knows what each category covers. */
const CATEGORY_DESCRIPTIONS: Record<CategoryName, string> = {
  Food: "Restaurants, cafes, bakeries, coffee shops, grocery stores, food delivery, dining out",
  Transport: "Fuel, gas stations, cab/taxi, auto, ride-sharing, metro, bus, parking, tolls, vehicle servicing",
  Shopping: "Online/offline retail, clothing, electronics, home goods, Amazon, Flipkart",
  Bills: "Utilities, electricity, water, internet, phone, rent, insurance, subscriptions, app purchases, recharges",
  Entertainment: "Movies, streaming, gaming, events, concerts, sports",
  Health: "Pharmacy, hospital, doctor, lab tests, medical supplies, gym, fitness",
  Education: "Courses, books, tuition, school/college fees, training",
  Investment: "Mutual funds, SIP, stocks, fixed deposits, PPF, NPS",
  Transfer: "Person-to-person transfers, NEFT/RTGS/IMPS to individuals, rent payments to landlords, family transfers",
  Other: "Only use when the transaction truly does not fit any category above",
};

export type CategoryName = (typeof CATEGORIES)[number];

/** Response expected from Claude */
interface CategorizeResponse {
  category: string;
  confidence: number;
}

/**
 * Format corrections as few-shot examples for the prompt.
 */
export function formatCorrections(corrections: CategoryCorrection[]): string {
  if (corrections.length === 0) return "";

  const lines = [
    "The user has previously corrected these categorizations — use them as guidance:",
  ];

  for (const c of corrections) {
    lines.push(
      `- "${c.merchant}": was "${c.originalCategory}" → corrected to "${c.correctedCategory}"`,
    );
  }

  return lines.join("\n");
}

/**
 * Gather relevant corrections for a transaction: merchant-specific first, then recent.
 */
export function gatherCorrections(
  merchant: string,
  maxExamples = 10,
): CategoryCorrection[] {
  const merchantCorrections = getCorrectionsByMerchant(merchant, maxExamples);
  if (merchantCorrections.length >= maxExamples) {
    return merchantCorrections.slice(0, maxExamples);
  }
  const remaining = maxExamples - merchantCorrections.length;
  const recent = getRecentCorrections(remaining + merchantCorrections.length);
  const merchantIds = new Set(merchantCorrections.map((c) => c.id));
  const extras = recent.filter((c) => !merchantIds.has(c.id)).slice(0, remaining);
  return [...merchantCorrections, ...extras];
}

/**
 * Build the categorization prompt for a single transaction.
 */
export function buildCategoryPrompt(
  tx: Transaction,
  corrections: CategoryCorrection[] = [],
): string {
  const categoryList = CATEGORIES.map(
    (c) => `- ${c}: ${CATEGORY_DESCRIPTIONS[c]}`,
  ).join("\n");

  const parts = [
    "Categorize this transaction into exactly one of these categories:",
    categoryList,
    "",
  ];

  const correctionBlock = formatCorrections(corrections);
  if (correctionBlock) {
    parts.push(correctionBlock, "");
  }

  parts.push(
    "Transaction details:",
    `- Merchant: ${tx.merchant}`,
    `- Amount: ${tx.currency} ${tx.amount}`,
    `- Type: ${tx.type}`,
    `- Direction: ${tx.direction}`,
  );

  if (tx.description) {
    parts.push(`- Description: ${tx.description}`);
  }

  parts.push(
    "",
    "Respond with JSON only, no explanation:",
    '{ "category": "<one of the categories above>", "confidence": <0.0 to 1.0> }',
  );

  return parts.join("\n");
}

/**
 * Build a batch categorization prompt for multiple transactions.
 */
export function buildBatchCategoryPrompt(
  txs: Transaction[],
  corrections: CategoryCorrection[] = [],
): string {
  const categoryList = CATEGORIES.map(
    (c) => `- ${c}: ${CATEGORY_DESCRIPTIONS[c]}`,
  ).join("\n");

  const parts = [
    "Categorize each transaction into exactly one of these categories:",
    categoryList,
    "",
  ];

  const correctionBlock = formatCorrections(corrections);
  if (correctionBlock) {
    parts.push(correctionBlock, "");
  }

  parts.push("Transactions:");

  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i];
    let line = `${i + 1}. Merchant: ${tx.merchant}, Amount: ${tx.currency} ${tx.amount}, Type: ${tx.type}, Direction: ${tx.direction}`;
    if (tx.description) {
      line += `, Description: ${tx.description}`;
    }
    parts.push(line);
  }

  parts.push(
    "",
    "Respond with a JSON array only, no explanation:",
    '[{ "category": "<category>", "confidence": <0.0 to 1.0> }, ...]',
  );

  return parts.join("\n");
}

/**
 * Validate that a category string is one of the known categories.
 */
export function isValidCategory(category: string): category is CategoryName {
  return CATEGORIES.includes(category as CategoryName);
}

/**
 * Categorize a single transaction using Claude CLI.
 * Returns the category name or "Other" if AI fails.
 */
export function categorizeTransaction(
  cli: ClaudeCli,
  tx: Transaction,
): { category: CategoryName; confidence: number } {
  const corrections = gatherCorrections(tx.merchant);
  const prompt = buildCategoryPrompt(tx, corrections);
  const result = cli.runJson<CategorizeResponse>({ prompt });

  if (result && result.category && isValidCategory(result.category)) {
    const confidence =
      typeof result.confidence === "number"
        ? Math.max(0, Math.min(1, result.confidence))
        : 0.5;
    return { category: result.category, confidence };
  }

  return { category: "Other", confidence: 0 };
}

/**
 * Categorize multiple transactions in a single Claude call.
 * Falls back to individual calls if batch parsing fails.
 */
export function categorizeTransactions(
  cli: ClaudeCli,
  txs: Transaction[],
): { category: CategoryName; confidence: number }[] {
  if (txs.length === 0) return [];
  if (txs.length === 1) return [categorizeTransaction(cli, txs[0])];

  const corrections = getRecentCorrections(10);
  const prompt = buildBatchCategoryPrompt(txs, corrections);
  const results = cli.runJson<CategorizeResponse[]>({ prompt });

  if (Array.isArray(results) && results.length === txs.length) {
    return results.map((r) => {
      if (r && r.category && isValidCategory(r.category)) {
        const confidence =
          typeof r.confidence === "number"
            ? Math.max(0, Math.min(1, r.confidence))
            : 0.5;
        return { category: r.category, confidence };
      }
      return { category: "Other" as CategoryName, confidence: 0 };
    });
  }

  // Fallback: categorize individually
  return txs.map((tx) => categorizeTransaction(cli, tx));
}
