/**
 * Parser eval runner.
 * Tests regex + AI fallback parsers against ground truth fixtures.
 */

import type { EvalCase, EvalResult } from "../types";
import type { RawEmail, Transaction } from "../../src/types";
import { createParserPipeline, parseEmail } from "../../src/parser/pipeline";
import { matchTransaction } from "../graders/code-grader";
import { buildSummary } from "../report";
import { loadFixtures } from "../helpers";
import type { SpawnFn } from "../../src/categorizer/claude-cli";

interface ParserFixture {
  id: string;
  description: string;
  input: {
    messageId: string;
    from: string;
    subject: string;
    date: string;
    bodyText: string;
    bodyHtml?: string;
  };
  expected: {
    amount: number;
    direction: "debit" | "credit";
    type: string;
    merchant: string;
    bank?: string;
    account?: string;
  };
}

export function runParserEval(opts?: { live?: boolean; spawnFn?: SpawnFn }) {
  const fixtures = loadFixtures<ParserFixture[]>("parser/fixtures.json");
  const pipeline = createParserPipeline(opts?.live ? undefined : opts?.spawnFn);

  const results: EvalResult[] = [];

  for (const fixture of fixtures) {
    const email: RawEmail = {
      messageId: fixture.input.messageId,
      from: fixture.input.from,
      subject: fixture.input.subject,
      date: new Date(fixture.input.date),
      bodyText: fixture.input.bodyText,
      bodyHtml: fixture.input.bodyHtml,
    };

    const txs = parseEmail(pipeline, email);
    if (txs.length === 0) {
      results.push({
        id: fixture.id,
        pass: false,
        score: 0,
        details: { error: "No transactions parsed" },
      });
      continue;
    }

    const result = matchTransaction(
      txs[0],
      fixture.expected as Partial<Transaction>,
      fixture.id,
    );
    results.push(result);
  }

  return buildSummary("parser", results);
}
