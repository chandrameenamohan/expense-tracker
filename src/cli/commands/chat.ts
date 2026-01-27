/**
 * `expense-tracker chat` command.
 * Conversational query mode via `claude` CLI subprocess.
 * Users can ask natural language questions about their spending data.
 */

import { createClaudeCli, type ClaudeCli } from "../../categorizer/claude-cli";
import { getSummaryData } from "./summary";
import { listTransactions } from "../../db/transactions";
import { getDb } from "../../db/connection";
import { answerQuery } from "./nl-query";
import { getInsightsData, formatInsightsContext } from "../insights";
import * as readline from "readline";

export interface ChatDeps {
  cli: ClaudeCli;
  readLine: () => Promise<string | null>;
  writeLine: (text: string) => void;
  /** If true, use NL query (SQL generation) mode instead of static context. Defaults to true. */
  useNlQuery?: boolean;
}

/** Build a data context string summarizing the user's transaction data for the AI. */
export function buildDataContext(): string {
  const db = getDb();

  // Overall summary
  const summary = getSummaryData();

  // Recent transactions (last 20)
  const recent = listTransactions({ limit: 20 });

  // Top merchants by spend
  const topMerchants = db
    .prepare(
      `SELECT merchant, SUM(amount) as total, COUNT(*) as count
       FROM transactions WHERE direction = 'debit'
       GROUP BY merchant ORDER BY total DESC LIMIT 10`,
    )
    .all() as { merchant: string; total: number; count: number }[];

  const lines: string[] = [];
  lines.push("=== USER'S EXPENSE DATA ===");
  lines.push(`Total transactions: ${summary.transactionCount}`);
  lines.push(
    `Total debits: ₹${summary.totalDebit.toFixed(2)}, Total credits: ₹${summary.totalCredit.toFixed(2)}`,
  );

  if (summary.categoryBreakdown.length > 0) {
    lines.push("\nCategory breakdown (debits):");
    for (const cat of summary.categoryBreakdown) {
      lines.push(
        `  ${cat.category}: ₹${cat.total.toFixed(2)} (${cat.count} txns, ${cat.percent.toFixed(1)}%)`,
      );
    }
  }

  if (summary.monthlyTrends.length > 0) {
    lines.push("\nMonthly trends:");
    for (const m of summary.monthlyTrends) {
      lines.push(`  ${m.month}: ₹${m.total.toFixed(2)} (${m.count} txns)`);
    }
  }

  if (topMerchants.length > 0) {
    lines.push("\nTop merchants by spend:");
    for (const m of topMerchants) {
      lines.push(`  ${m.merchant}: ₹${m.total.toFixed(2)} (${m.count} txns)`);
    }
  }

  if (recent.length > 0) {
    lines.push("\nRecent transactions:");
    for (const tx of recent) {
      lines.push(
        `  ${tx.date.toISOString().slice(0, 10)} | ${tx.direction} | ₹${tx.amount.toFixed(2)} | ${tx.merchant} | ${tx.category ?? "Uncategorized"} | ${tx.type}`,
      );
    }
  }

  // Deeper insights: trends, comparisons, patterns
  const insights = getInsightsData();
  const insightsContext = formatInsightsContext(insights);
  if (insightsContext.trim()) {
    lines.push("\n=== DEEPER INSIGHTS ===");
    lines.push(insightsContext);
  }

  return lines.join("\n");
}

/** Build the system prompt for the chat. */
export function buildChatPrompt(dataContext: string, userQuestion: string): string {
  return `You are a personal expense analyst assistant. The user has an expense tracker with their transaction data.
Answer their question using ONLY the data provided below. Be concise and helpful. Use Indian Rupee (₹) formatting.
When relevant, highlight trends, comparisons between periods, and actionable suggestions.
If the data doesn't contain enough information to answer, say so.

${dataContext}

User question: ${userQuestion}`;
}

function createDefaultDeps(): ChatDeps {
  const cli = createClaudeCli();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return {
    cli,
    readLine: () =>
      new Promise<string | null>((resolve) => {
        rl.question("you> ", (answer) => {
          resolve(answer ?? null);
        });
        rl.once("close", () => resolve(null));
      }),
    writeLine: (text: string) => console.log(text),
  };
}

export async function chatCommand(
  args: string[],
  deps?: ChatDeps,
): Promise<void> {
  const { cli, readLine, writeLine } = deps ?? createDefaultDeps();

  // Check claude availability
  if (!cli.isAvailable()) {
    writeLine(
      "Error: claude CLI is not available. Chat mode requires the claude CLI.",
    );
    process.exitCode = 1;
    return;
  }

  const useNlQuery = deps?.useNlQuery !== false;

  // Handle single-question mode: expense-tracker chat "what did I spend on food?"
  const inlineQuestion = args.filter((a) => !a.startsWith("--")).join(" ");
  if (inlineQuestion) {
    if (useNlQuery) {
      const result = answerQuery(cli, inlineQuestion);
      writeLine(result.answer);
      if (result.error) process.exitCode = 1;
    } else {
      const dataContext = buildDataContext();
      const prompt = buildChatPrompt(dataContext, inlineQuestion);
      const result = cli.run({ prompt, outputFormat: "text" });
      if (result.success) {
        writeLine(result.output);
      } else {
        writeLine(`Error: ${result.error}`);
        process.exitCode = 1;
      }
    }
    return;
  }

  // Interactive REPL mode
  writeLine("Expense Tracker Chat (type 'exit' to quit)\n");

  const dataContext = useNlQuery ? null : buildDataContext();

  while (true) {
    const input = await readLine();
    if (input === null) break;

    const trimmed = input.trim();
    if (!trimmed) continue;
    if (trimmed === "exit" || trimmed === "quit" || trimmed === "q") break;

    if (useNlQuery) {
      const nlResult = answerQuery(cli, trimmed);
      writeLine(`\n${nlResult.answer}\n`);
    } else {
      const prompt = buildChatPrompt(dataContext!, trimmed);
      const result = cli.run({ prompt, outputFormat: "text" });

      if (result.success) {
        writeLine(`\n${result.output}\n`);
      } else {
        writeLine(`\nError: ${result.error}\n`);
      }
    }
  }

  writeLine("Goodbye!");
}
