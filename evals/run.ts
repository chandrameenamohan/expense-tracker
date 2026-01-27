#!/usr/bin/env bun

/**
 * Eval CLI entry point.
 * Usage:
 *   bun run evals/run.ts                  # run all evals
 *   bun run evals/run.ts parser           # run parser evals only
 *   bun run evals/run.ts --live           # use real Claude CLI
 */

import { runParserEval } from "./runners/parser-eval";
import { runCategorizationEval } from "./runners/categorization-eval";
import { runNlQueryEval } from "./runners/nl-query-eval";
import { runChatEval } from "./runners/chat-eval";
import { runAlertEval } from "./runners/alert-eval";
import { runE2eEval } from "./runners/e2e-eval";
import { buildReport, printReport, saveReport } from "./report";
import type { EvalSummary } from "./types";
import type { SpawnFn } from "../src/categorizer/claude-cli";

const args = process.argv.slice(2);
const component = args.find((a) => !a.startsWith("--"));
const live = args.includes("--live");

// Mock spawn for non-live mode: returns a canned categorization response
const mockSpawnFn: SpawnFn = (spawnArgs: string[]) => {
  const prompt = spawnArgs.find((_, i) => spawnArgs[i - 1] === "-p") ?? "";

  // Mock categorization response
  if (prompt.includes("Categorize")) {
    return {
      exitCode: 0,
      stdout: JSON.stringify({ category: "Other", confidence: 0.5 }),
      stderr: "",
    };
  }

  // Mock SQL generation
  if (prompt.includes("SQL query generator")) {
    return {
      exitCode: 0,
      stdout: "SELECT 'mock' as result;",
      stderr: "",
    };
  }

  // Mock answer interpretation
  if (prompt.includes("expense analyst")) {
    return {
      exitCode: 0,
      stdout: "Based on the data, here is the answer.",
      stderr: "",
    };
  }

  // Default mock
  return {
    exitCode: 0,
    stdout: JSON.stringify({ result: "mock" }),
    stderr: "",
  };
};

const evalOpts = { live, spawnFn: live ? undefined : mockSpawnFn };

const summaries: EvalSummary[] = [];

const runners: Record<string, () => EvalSummary> = {
  parser: () => runParserEval(evalOpts),
  categorization: () => runCategorizationEval(evalOpts),
  "nl-query": () => runNlQueryEval(evalOpts),
  chat: () => runChatEval(evalOpts),
  alerts: () => runAlertEval(),
  e2e: () => runE2eEval(evalOpts),
};

const toRun = component ? [component] : Object.keys(runners);

for (const name of toRun) {
  const runner = runners[name];
  if (!runner) {
    console.error(`Unknown component: ${name}`);
    console.error(`Available: ${Object.keys(runners).join(", ")}`);
    process.exit(1);
  }

  try {
    console.log(`Running ${name} evals...`);
    const summary = runner();
    summaries.push(summary);
  } catch (err) {
    console.error(`Error running ${name} evals:`, err);
    summaries.push({
      component: name,
      total: 0,
      passed: 0,
      failed: 0,
      passRate: 0,
      avgScore: 0,
      results: [],
    });
  }
}

const report = buildReport(summaries);
printReport(report);

const reportPath = saveReport(report);
console.log(`Report saved to: ${reportPath}`);

// Exit with non-zero if any component failed
const anyFailed = summaries.some((s) => s.passRate < 1);
if (anyFailed) {
  process.exitCode = 1;
}
