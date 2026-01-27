import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { registerCommand, routeCommand } from "../../src/cli";

describe("CLI router", () => {
  let consoleSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleSpy = spyOn(console, "log").mockImplementation(() => {});
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = undefined;
  });

  test("shows help with no arguments", () => {
    routeCommand([]);
    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain("expense-tracker");
  });

  test("shows help with 'help' command", () => {
    routeCommand(["help"]);
    expect(consoleSpy).toHaveBeenCalled();
  });

  test("shows help with --help flag", () => {
    routeCommand(["--help"]);
    expect(consoleSpy).toHaveBeenCalled();
  });

  test("routes to registered command", () => {
    let called = false;
    let receivedArgs: string[] = [];
    registerCommand("test-cmd", (args) => {
      called = true;
      receivedArgs = args;
    });

    routeCommand(["test-cmd", "--flag", "value"]);
    expect(called).toBe(true);
    expect(receivedArgs).toEqual(["--flag", "value"]);
  });

  test("shows error for unknown command", () => {
    routeCommand(["nonexistent"]);
    expect(errorSpy).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
