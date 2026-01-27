import { describe, test, expect } from "bun:test";
import { createClaudeCli } from "../../src/categorizer/claude-cli";
import type { SpawnFn } from "../../src/categorizer/claude-cli";

function mockSpawn(
  exitCode: number,
  stdout: string,
  stderr = "",
): SpawnFn {
  return (_args: string[]) => ({ exitCode, stdout, stderr });
}

describe("createClaudeCli", () => {
  describe("run", () => {
    test("returns success with output on exit code 0", () => {
      const cli = createClaudeCli(mockSpawn(0, '{"result":"hello"}'));
      const result = cli.run({ prompt: "test" });
      expect(result.success).toBe(true);
      expect(result.output).toBe('{"result":"hello"}');
      expect(result.error).toBeUndefined();
    });

    test("returns failure on non-zero exit code", () => {
      const cli = createClaudeCli(mockSpawn(1, "", "some error"));
      const result = cli.run({ prompt: "test" });
      expect(result.success).toBe(false);
      expect(result.output).toBe("");
      expect(result.error).toContain("exited with code 1");
    });

    test("returns failure when spawn throws", () => {
      const cli = createClaudeCli(() => {
        throw new Error("not found");
      });
      const result = cli.run({ prompt: "test" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to invoke");
    });

    test("passes correct args with default json format", () => {
      let capturedArgs: string[] = [];
      const cli = createClaudeCli((args) => {
        capturedArgs = args;
        return { exitCode: 0, stdout: "{}", stderr: "" };
      });
      cli.run({ prompt: "my prompt" });
      expect(capturedArgs).toEqual(["claude", "-p", "my prompt", "--output-format", "json"]);
    });

    test("passes text format when specified", () => {
      let capturedArgs: string[] = [];
      const cli = createClaudeCli((args) => {
        capturedArgs = args;
        return { exitCode: 0, stdout: "hello", stderr: "" };
      });
      cli.run({ prompt: "my prompt", outputFormat: "text" });
      expect(capturedArgs).toEqual(["claude", "-p", "my prompt", "--output-format", "text"]);
    });

    test("passes max-tokens when specified", () => {
      let capturedArgs: string[] = [];
      const cli = createClaudeCli((args) => {
        capturedArgs = args;
        return { exitCode: 0, stdout: "{}", stderr: "" };
      });
      cli.run({ prompt: "test", maxTokens: 1024 });
      expect(capturedArgs).toContain("--max-tokens");
      expect(capturedArgs).toContain("1024");
    });
  });

  describe("runJson", () => {
    test("parses direct JSON response", () => {
      const cli = createClaudeCli(mockSpawn(0, '{"foo":"bar"}'));
      const result = cli.runJson({ prompt: "test" });
      expect(result).toEqual({ foo: "bar" });
    });

    test("unwraps wrapper format with result string", () => {
      const inner = JSON.stringify({ foo: "bar" });
      const cli = createClaudeCli(mockSpawn(0, JSON.stringify({ result: inner })));
      const result = cli.runJson({ prompt: "test" });
      expect(result).toEqual({ foo: "bar" });
    });

    test("strips markdown code fences", () => {
      const cli = createClaudeCli(mockSpawn(0, '```json\n{"foo":"bar"}\n```'));
      const result = cli.runJson({ prompt: "test" });
      expect(result).toEqual({ foo: "bar" });
    });

    test("returns null on failure", () => {
      const cli = createClaudeCli(mockSpawn(1, "", "error"));
      const result = cli.runJson({ prompt: "test" });
      expect(result).toBeNull();
    });

    test("returns null on invalid JSON", () => {
      const cli = createClaudeCli(mockSpawn(0, "not json at all"));
      const result = cli.runJson({ prompt: "test" });
      expect(result).toBeNull();
    });

    test("returns null on empty output", () => {
      const cli = createClaudeCli(mockSpawn(0, ""));
      const result = cli.runJson({ prompt: "test" });
      expect(result).toBeNull();
    });
  });

  describe("isAvailable", () => {
    test("returns true when claude --version succeeds", () => {
      const cli = createClaudeCli(mockSpawn(0, "1.0.0"));
      expect(cli.isAvailable()).toBe(true);
    });

    test("returns false when claude --version fails", () => {
      const cli = createClaudeCli(mockSpawn(1, ""));
      expect(cli.isAvailable()).toBe(false);
    });

    test("returns false when spawn throws", () => {
      const cli = createClaudeCli(() => {
        throw new Error("not found");
      });
      expect(cli.isAvailable()).toBe(false);
    });
  });
});
