/**
 * Chat eval runner.
 * Tests conversational query mode against expected answer traits.
 */

import type { EvalResult } from "../types";
import { chatCommand, type ChatDeps } from "../../src/cli/commands/chat";
import { createClaudeCli, type SpawnFn } from "../../src/categorizer/claude-cli";
import { judgeAnswerQuality } from "../graders/llm-judge";
import { buildSummary } from "../report";
import { loadFixtures, createTestDb, seedTransactions, teardownTestDb } from "../helpers";

interface ChatFixture {
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
  expectedTraits: string[];
}

export function runChatEval(opts?: { live?: boolean; spawnFn?: SpawnFn }) {
  const fixtures = loadFixtures<ChatFixture[]>("chat/fixtures.json");
  const results: EvalResult[] = [];

  for (const fixture of fixtures) {
    const db = createTestDb();

    try {
      seedTransactions(db, fixture.seedData);

      let capturedOutput = "";
      const cli = createClaudeCli(opts?.live ? undefined : opts?.spawnFn);

      const deps: ChatDeps = {
        cli,
        readLine: async () => null, // single question mode
        writeLine: (text: string) => {
          capturedOutput += text + "\n";
        },
        useNlQuery: true,
      };

      // Use inline question mode
      chatCommand([fixture.question], deps);

      if (opts?.live && fixture.expectedTraits.length > 0) {
        const result = judgeAnswerQuality(
          fixture.question,
          capturedOutput.trim(),
          fixture.expectedTraits,
          fixture.id,
        );
        results.push(result);
      } else {
        // Basic check: did we get any output?
        const hasOutput = capturedOutput.trim().length > 0;
        results.push({
          id: fixture.id,
          pass: hasOutput,
          score: hasOutput ? 0.5 : 0,
          details: hasOutput
            ? { outputLength: capturedOutput.length }
            : { error: "No output produced" },
        });
      }
    } finally {
      teardownTestDb();
    }
  }

  return buildSummary("chat", results);
}
