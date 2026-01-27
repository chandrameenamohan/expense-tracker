/**
 * End-to-end eval runner.
 * Full pipeline: raw email → parse → categorize → store → query.
 */

import type { EvalResult } from "../types";
import { createParserPipeline, parseEmail } from "../../src/parser/pipeline";
import { categorizeTransaction } from "../../src/categorizer/categorize";
import { createClaudeCli, type SpawnFn } from "../../src/categorizer/claude-cli";
import { insertRawEmail } from "../../src/db/raw-emails";
import { insertTransaction, getTransaction } from "../../src/db/transactions";
import { answerQuery } from "../../src/cli/commands/nl-query";
import { matchTransaction } from "../graders/code-grader";
import { buildSummary } from "../report";
import { loadFixtures, createTestDb, teardownTestDb } from "../helpers";
import type { RawEmail, Transaction } from "../../src/types";

interface E2eFixture {
  id: string;
  description: string;
  emails: Array<{
    messageId: string;
    from: string;
    subject: string;
    date: string;
    bodyText: string;
  }>;
  expectedTransactions: Array<{
    amount: number;
    direction: string;
    type: string;
    merchant: string;
  }>;
  query?: {
    question: string;
    expectedTraits: string[];
  };
}

export function runE2eEval(opts?: { live?: boolean; spawnFn?: SpawnFn }) {
  const fixtures = loadFixtures<E2eFixture[]>("parser/e2e-fixtures.json");
  const results: EvalResult[] = [];

  for (const fixture of fixtures) {
    const db = createTestDb();

    try {
      const pipeline = createParserPipeline(opts?.live ? undefined : opts?.spawnFn);
      const cli = createClaudeCli(opts?.live ? undefined : opts?.spawnFn);
      const allTxs: Transaction[] = [];

      for (const emailData of fixture.emails) {
        const email: RawEmail = {
          messageId: emailData.messageId,
          from: emailData.from,
          subject: emailData.subject,
          date: new Date(emailData.date),
          bodyText: emailData.bodyText,
        };

        insertRawEmail(email);
        const txs = parseEmail(pipeline, email);

        for (const tx of txs) {
          if (opts?.live) {
            const cat = categorizeTransaction(cli, tx);
            tx.category = cat.category;
            tx.confidence = cat.confidence;
          }
          insertTransaction(tx);
          allTxs.push(tx);
        }
      }

      // Check parsed transactions
      for (let i = 0; i < fixture.expectedTransactions.length; i++) {
        const expected = fixture.expectedTransactions[i];
        const actual = allTxs[i];
        if (!actual) {
          results.push({
            id: `${fixture.id}_tx_${i}`,
            pass: false,
            score: 0,
            details: { error: `Missing transaction ${i}` },
          });
          continue;
        }
        results.push(
          matchTransaction(
            actual,
            expected as Partial<Transaction>,
            `${fixture.id}_tx_${i}`,
          ),
        );
      }
    } finally {
      teardownTestDb();
    }
  }

  return buildSummary("e2e", results);
}
