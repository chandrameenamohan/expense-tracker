/**
 * NL query eval runner.
 * Tests natural language → SQL → result pipeline.
 */

import type { EvalResult } from "../types";
import { answerQuery, isReadOnlyQuery, executeQuery } from "../../src/cli/commands/nl-query";
import { createClaudeCli, type SpawnFn } from "../../src/categorizer/claude-cli";
import { matchSql, matchQueryResults } from "../graders/code-grader";
import { judgeAnswerQuality } from "../graders/llm-judge";
import { buildSummary } from "../report";
import { loadFixtures, createTestDb, seedTransactions, teardownTestDb } from "../helpers";

interface NlQueryFixture {
  id: string;
  description: string;
  seedData: Array<{
    id: string;
    emailMessageId: string;
    date: string;
    amount: number;
    direction: string;
    type: string;
    merchant: string;
    category?: string;
    bank?: string;
  }>;
  question: string;
  expectedSqlPatterns?: string[];
  expectedResults?: Record<string, unknown>[];
  expectedTraits?: string[];
}

export function runNlQueryEval(opts?: { live?: boolean; spawnFn?: SpawnFn }) {
  const fixtures = loadFixtures<NlQueryFixture[]>("nl-query/fixtures.json");
  const results: EvalResult[] = [];

  for (const fixture of fixtures) {
    const db = createTestDb();

    try {
      seedTransactions(db, fixture.seedData);

      const cli = createClaudeCli(opts?.live ? undefined : opts?.spawnFn);
      const queryResult = answerQuery(cli, fixture.question);

      // Grade SQL validity
      if (queryResult.sql) {
        const sqlResult = matchSql(
          queryResult.sql,
          `${fixture.id}_sql`,
          fixture.expectedSqlPatterns,
        );
        results.push(sqlResult);
      }

      // Grade result correctness
      if (queryResult.rows && fixture.expectedResults) {
        const rowResult = matchQueryResults(
          queryResult.rows,
          fixture.expectedResults,
          `${fixture.id}_results`,
        );
        results.push(rowResult);
      }

      // Grade answer quality with LLM judge (only in live mode)
      if (opts?.live && fixture.expectedTraits) {
        const answerResult = judgeAnswerQuality(
          fixture.question,
          queryResult.answer,
          fixture.expectedTraits,
          `${fixture.id}_answer`,
        );
        results.push(answerResult);
      }
    } finally {
      teardownTestDb();
    }
  }

  return buildSummary("nl-query", results);
}
