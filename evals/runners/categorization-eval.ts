/**
 * Categorization eval runner.
 * Tests category assignment against ground truth fixtures.
 */

import type { EvalResult } from "../types";
import type { Transaction } from "../../src/types";
import { categorizeTransaction } from "../../src/categorizer/categorize";
import { createClaudeCli, type SpawnFn } from "../../src/categorizer/claude-cli";
import { matchCategory } from "../graders/code-grader";
import { judgeCategorization } from "../graders/llm-judge";
import { buildSummary } from "../report";
import { loadFixtures } from "../helpers";
import { createTestDb, teardownTestDb } from "../helpers";

interface CategorizationFixture {
  id: string;
  description: string;
  transaction: {
    merchant: string;
    amount: number;
    type: string;
    direction: string;
    currency?: string;
    description?: string;
  };
  expectedCategory: string;
}

export function runCategorizationEval(opts?: { live?: boolean; spawnFn?: SpawnFn }) {
  const fixtures = loadFixtures<CategorizationFixture[]>(
    "categorization/fixtures.json",
  );

  const db = createTestDb();

  try {
    const cli = createClaudeCli(opts?.live ? undefined : opts?.spawnFn);
    const results: EvalResult[] = [];

    for (const fixture of fixtures) {
      const tx: Transaction = {
        id: fixture.id,
        emailMessageId: "eval-email",
        date: new Date(),
        amount: fixture.transaction.amount,
        currency: fixture.transaction.currency ?? "INR",
        direction: fixture.transaction.direction as "debit" | "credit",
        type: fixture.transaction.type as Transaction["type"],
        merchant: fixture.transaction.merchant,
        account: "",
        bank: "",
        description: fixture.transaction.description,
        source: "regex",
        needsReview: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = categorizeTransaction(cli, tx);
      const codeResult = matchCategory(
        result.category,
        fixture.expectedCategory,
        fixture.id,
      );

      if (codeResult.pass) {
        results.push(codeResult);
      } else if (opts?.live) {
        // Use LLM judge for partial credit
        const judgeResult = judgeCategorization(
          result.category,
          fixture.expectedCategory,
          fixture.transaction.merchant,
          fixture.id,
        );
        results.push(judgeResult);
      } else {
        results.push(codeResult);
      }
    }

    return buildSummary("categorization", results);
  } finally {
    teardownTestDb();
  }
}
