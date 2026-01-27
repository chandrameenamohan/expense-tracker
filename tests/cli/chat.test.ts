import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { buildDataContext, buildChatPrompt, chatCommand, type ChatDeps } from "../../src/cli/commands/chat";
import { getDb, _resetDb } from "../../src/db";
import { runMigrations } from "../../src/db";
import type { ClaudeCli } from "../../src/categorizer/claude-cli";

function setupTestDb() {
  process.env.EXPENSE_TRACKER_DB = ":memory:";
  _resetDb();
  runMigrations();
}

function ensureRawEmail(messageId: string) {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO raw_emails (message_id, from_address, subject, date, body_text)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(messageId, "test@bank.com", "Transaction", "2025-01-15T10:00:00.000Z", "body");
}

function insertTestTransaction(overrides: Record<string, unknown> = {}) {
  const db = getDb();
  const defaults = {
    id: `tx-${Math.random().toString(36).slice(2)}`,
    email_message_id: "msg-1",
    date: "2025-01-15T10:00:00.000Z",
    amount: 500,
    currency: "INR",
    direction: "debit",
    type: "upi",
    merchant: "Swiggy",
    account: "1234",
    bank: "HDFC",
    category: "Food",
    source: "regex",
    confidence: 1.0,
    needs_review: 0,
  };
  const row = { ...defaults, ...overrides };
  ensureRawEmail(row.email_message_id as string);
  db.prepare(
    `INSERT INTO transactions (id, email_message_id, date, amount, currency, direction, type, merchant, account, bank, category, source, confidence, needs_review)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id, row.email_message_id, row.date, row.amount, row.currency,
    row.direction, row.type, row.merchant, row.account, row.bank,
    row.category, row.source, row.confidence, row.needs_review,
  );
}

function makeMockCli(response: { success: boolean; output: string; error?: string }): ClaudeCli {
  return {
    run: () => response,
    runJson: () => null,
    isAvailable: () => response.success,
  };
}

function makeDeps(
  cli: ClaudeCli,
  inputs: string[],
): { deps: ChatDeps; output: string[] } {
  const output: string[] = [];
  let inputIdx = 0;
  return {
    deps: {
      cli,
      readLine: async () => {
        if (inputIdx >= inputs.length) return null;
        return inputs[inputIdx++];
      },
      writeLine: (text: string) => output.push(text),
    },
    output,
  };
}

describe("chat command", () => {
  beforeEach(setupTestDb);
  afterEach(() => {
    delete process.env.EXPENSE_TRACKER_DB;
    _resetDb();
  });

  test("buildDataContext includes transaction data", () => {
    insertTestTransaction();
    insertTestTransaction({ id: "tx-2", email_message_id: "msg-2", merchant: "Amazon", amount: 1200, category: "Shopping" });

    const ctx = buildDataContext();
    expect(ctx).toContain("Total transactions: 2");
    expect(ctx).toContain("Swiggy");
    expect(ctx).toContain("Amazon");
    expect(ctx).toContain("Food");
    expect(ctx).toContain("Shopping");
  });

  test("buildDataContext handles empty database", () => {
    const ctx = buildDataContext();
    expect(ctx).toContain("Total transactions: 0");
  });

  test("buildChatPrompt includes data and question", () => {
    const prompt = buildChatPrompt("some data", "how much did I spend?");
    expect(prompt).toContain("some data");
    expect(prompt).toContain("how much did I spend?");
    expect(prompt).toContain("expense analyst");
  });

  test("inline question mode sends prompt and prints response", async () => {
    insertTestTransaction();
    const cli = makeMockCli({ success: true, output: "You spent ₹500 on food." });
    const { deps, output } = makeDeps(cli, []);
    deps.useNlQuery = false;

    await chatCommand(["how much on food?"], deps);

    expect(output).toContain("You spent ₹500 on food.");
  });

  test("inline question mode handles error", async () => {
    const cli = makeMockCli({ success: false, output: "", error: "CLI failed" });
    // isAvailable returns false for this mock, but inline bypasses the check
    // We need a cli that is available but fails on run
    const failCli: ClaudeCli = {
      run: () => ({ success: false, output: "", error: "CLI failed" }),
      runJson: () => null,
      isAvailable: () => true,
    };
    const { deps, output } = makeDeps(failCli, []);
    deps.useNlQuery = false;

    await chatCommand(["test question"], deps);

    expect(output.some((l) => l.includes("Error"))).toBe(true);
  });

  test("interactive mode processes questions and exits on quit", async () => {
    insertTestTransaction();
    const responses = ["Answer 1", "Answer 2"];
    let callIdx = 0;
    const cli: ClaudeCli = {
      run: () => ({ success: true, output: responses[callIdx++] || "ok" }),
      runJson: () => null,
      isAvailable: () => true,
    };
    const { deps, output } = makeDeps(cli, ["question 1", "question 2", "exit"]);
    deps.useNlQuery = false;

    await chatCommand([], deps);

    expect(output[0]).toContain("Expense Tracker Chat");
    expect(output.some((l) => l.includes("Answer 1"))).toBe(true);
    expect(output.some((l) => l.includes("Answer 2"))).toBe(true);
    expect(output[output.length - 1]).toBe("Goodbye!");
  });

  test("interactive mode skips empty input", async () => {
    let runCount = 0;
    const cli: ClaudeCli = {
      run: () => { runCount++; return { success: true, output: "response" }; },
      runJson: () => null,
      isAvailable: () => true,
    };
    const { deps } = makeDeps(cli, ["", "  ", "actual question", "quit"]);
    deps.useNlQuery = false;

    await chatCommand([], deps);

    expect(runCount).toBe(1);
  });

  test("unavailable claude CLI shows error", async () => {
    const cli: ClaudeCli = {
      run: () => ({ success: false, output: "" }),
      runJson: () => null,
      isAvailable: () => false,
    };
    const { deps, output } = makeDeps(cli, []);

    await chatCommand([], deps);

    expect(output.some((l) => l.includes("not available"))).toBe(true);
  });

  test("buildDataContext includes monthly trends", () => {
    insertTestTransaction({ date: "2025-01-15T10:00:00.000Z" });
    insertTestTransaction({ id: "tx-feb", email_message_id: "msg-2", date: "2025-02-15T10:00:00.000Z", merchant: "Zomato" });

    const ctx = buildDataContext();
    expect(ctx).toContain("2025-01");
    expect(ctx).toContain("2025-02");
    expect(ctx).toContain("Monthly trends");
  });

  test("buildDataContext includes top merchants", () => {
    insertTestTransaction({ amount: 1000 });
    insertTestTransaction({ id: "tx-2", email_message_id: "msg-2", merchant: "Amazon", amount: 2000, category: "Shopping" });

    const ctx = buildDataContext();
    expect(ctx).toContain("Top merchants");
    expect(ctx).toContain("Amazon");
  });
});
