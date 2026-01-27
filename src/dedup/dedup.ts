/**
 * Deduplication orchestrator.
 * Runs SQL candidate selection → AI confirmation → writes results.
 */

import { findCandidates } from "./candidates";
import { confirmDuplicates } from "./ai-confirm";
import { markAsDuplicate, getDuplicatesFor } from "../db/duplicate-groups";
import { flagForReview } from "../db/review-queue";
import type { ClaudeCli } from "../categorizer/claude-cli";

export interface DedupResult {
  candidatesFound: number;
  duplicatesConfirmed: number;
}

/**
 * Find and flag duplicate transactions.
 * @param cli - Claude CLI client for AI confirmation
 * @param txIds - Optional list of newly inserted transaction IDs to check
 */
export function findAndFlagDuplicates(
  cli: ClaudeCli,
  txIds?: string[],
): DedupResult {
  // Step 1: Find candidates via SQL
  const candidates = findCandidates(txIds);

  if (candidates.length === 0) {
    return { candidatesFound: 0, duplicatesConfirmed: 0 };
  }

  // Step 2: AI confirmation
  const confirmations = confirmDuplicates(cli, candidates);

  // Step 3: Write confirmed duplicates
  let duplicatesConfirmed = 0;
  for (const conf of confirmations) {
    if (!conf.isDuplicate) continue;

    // Keep the first transaction (by ID sort order), mark second as duplicate
    const kept = conf.txId1;
    const dup = conf.txId2;

    // Skip if already recorded
    const existing = getDuplicatesFor(kept);
    if (existing.some((d) => d.duplicateTransactionId === dup)) continue;

    markAsDuplicate(dup, kept, "ai_confirmed", conf.confidence);
    flagForReview(dup);
    duplicatesConfirmed++;
  }

  return {
    candidatesFound: candidates.length,
    duplicatesConfirmed,
  };
}
