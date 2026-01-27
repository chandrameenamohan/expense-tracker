/**
 * AI-based duplicate confirmation using Claude CLI.
 * Takes candidate pairs and asks Claude to confirm or reject each.
 */

import type { ClaudeCli } from "../categorizer/claude-cli";
import type { Transaction } from "../types";
import { getTransaction } from "../db/transactions";

export interface DuplicateConfirmation {
  txId1: string;
  txId2: string;
  isDuplicate: boolean;
  confidence: number;
}

interface AiDuplicateResult {
  isDuplicate: boolean;
  confidence: number;
}

function buildPrompt(tx1: Transaction, tx2: Transaction): string {
  const fmt = (tx: Transaction) =>
    [
      `  ID: ${tx.id}`,
      `  Date: ${tx.date.toISOString().slice(0, 10)}`,
      `  Amount: ${tx.amount} ${tx.currency} (${tx.direction})`,
      `  Merchant: ${tx.merchant}`,
      `  Bank: ${tx.bank || "-"}`,
      `  Type: ${tx.type}`,
      `  Reference: ${tx.reference || "-"}`,
      `  Description: ${tx.description || "-"}`,
    ].join("\n");

  return `You are a financial transaction deduplication assistant.
Determine if these two transactions are duplicates of the same real-world transaction (reported by different email notifications).

Transaction A:
${fmt(tx1)}

Transaction B:
${fmt(tx2)}

Respond with ONLY valid JSON (no markdown fences): {"isDuplicate": true/false, "confidence": 0.0-1.0}`;
}

/**
 * Confirm candidate duplicate pairs using AI.
 * Returns only confirmed duplicates.
 */
export function confirmDuplicates(
  cli: ClaudeCli,
  pairs: Array<{ txId1: string; txId2: string }>,
): DuplicateConfirmation[] {
  const results: DuplicateConfirmation[] = [];

  for (const pair of pairs) {
    const tx1 = getTransaction(pair.txId1);
    const tx2 = getTransaction(pair.txId2);
    if (!tx1 || !tx2) continue;

    const result = cli.runJson<AiDuplicateResult>({
      prompt: buildPrompt(tx1, tx2),
    });

    if (result && typeof result.isDuplicate === "boolean") {
      results.push({
        txId1: pair.txId1,
        txId2: pair.txId2,
        isDuplicate: result.isDuplicate,
        confidence: result.confidence ?? 0.5,
      });
    }
  }

  return results;
}
