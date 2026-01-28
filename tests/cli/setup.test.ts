import { describe, expect, test, mock, beforeEach } from "bun:test";
import { setupCommand } from "../../src/cli/commands/setup";

// Capture console output
function captureLog(fn: () => void): string[] {
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    fn();
  } finally {
    console.log = origLog;
  }
  return logs;
}

describe("setup command", () => {
  test("prints setup instructions when no credentials exist", () => {
    // By default in test env, ~/.expense-tracker/credentials.json likely doesn't exist
    // (or if it does, this still validates the output structure)
    const logs = captureLog(() => setupCommand([]));
    const output = logs.join("\n");

    // Should always contain the title
    expect(output).toContain("Expense Tracker Setup");

    // Should mention Google Cloud or credentials path
    expect(output).toContain(".expense-tracker");
  });

  test("mentions Gmail readonly scope or setup complete", () => {
    const logs = captureLog(() => setupCommand([]));
    const output = logs.join("\n");

    // When credentials+token exist, setup short-circuits; otherwise mentions scope
    const mentionsScope = output.includes("gmail.readonly");
    const setupComplete = output.includes("Setup is complete");
    expect(mentionsScope || setupComplete).toBe(true);
  });
});
