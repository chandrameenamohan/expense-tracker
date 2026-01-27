/**
 * Claude CLI wrapper module.
 * Provides a single interface for all `claude` subprocess calls.
 * Supports dependency injection for testing.
 */

/** Result from a claude CLI invocation */
export interface ClaudeResult {
  success: boolean;
  output: string;
  error?: string;
}

/** Options for a claude CLI call */
export interface ClaudeOptions {
  /** The prompt to send */
  prompt: string;
  /** Output format (default: "json") */
  outputFormat?: "json" | "text" | "stream-json";
  /** Maximum tokens (optional) */
  maxTokens?: number;
}

/** Spawn function signature for dependency injection */
export type SpawnFn = (args: string[]) => {
  exitCode: number;
  stdout: string;
  stderr: string;
};

/** Default spawn using Bun.spawnSync */
function defaultSpawn(args: string[]): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const proc = Bun.spawnSync(args, {
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

/** Try to parse a string as JSON, stripping markdown code fences if needed. */
function parseJsonString(text: string): unknown | null {
  const stripped = text
    .replace(/^```(?:json)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

/**
 * Create a Claude CLI client.
 * @param spawnFn - Optional custom spawn function for testing
 */
export function createClaudeCli(spawnFn?: SpawnFn) {
  const spawn = spawnFn ?? defaultSpawn;

  return {
    /**
     * Run a prompt through the claude CLI and return the result.
     */
    run(options: ClaudeOptions): ClaudeResult {
      const args = ["claude", "-p", options.prompt];

      const format = options.outputFormat ?? "json";
      args.push("--output-format", format);

      if (options.maxTokens) {
        args.push("--max-tokens", String(options.maxTokens));
      }

      try {
        const result = spawn(args);

        if (result.exitCode !== 0) {
          return {
            success: false,
            output: "",
            error: `claude CLI exited with code ${result.exitCode}: ${result.stderr}`,
          };
        }

        const output = result.stdout.trim();
        return { success: true, output };
      } catch (err) {
        return {
          success: false,
          output: "",
          error: `Failed to invoke claude CLI: ${err}`,
        };
      }
    },

    /**
     * Run a prompt and parse the JSON output.
     * Returns the parsed object or null on failure.
     */
    runJson<T = unknown>(options: Omit<ClaudeOptions, "outputFormat">): T | null {
      const result = this.run({ ...options, outputFormat: "json" });
      if (!result.success || !result.output) return null;

      try {
        const parsed = JSON.parse(result.output);
        // Handle CLI envelope format: { type: "result", result: "..." }
        if (parsed && typeof parsed === "object" && typeof parsed.result === "string") {
          return parseJsonString(parsed.result) as T;
        }
        return parsed as T;
      } catch {
        // Try stripping markdown code fences from raw output
        return parseJsonString(result.output) as T ?? null;
      }
    },

    /**
     * Check if the claude CLI is available.
     */
    isAvailable(): boolean {
      try {
        const result = spawn(["claude", "--version"]);
        return result.exitCode === 0;
      } catch {
        return false;
      }
    },
  };
}

/** Type of the claude CLI client */
export type ClaudeCli = ReturnType<typeof createClaudeCli>;
