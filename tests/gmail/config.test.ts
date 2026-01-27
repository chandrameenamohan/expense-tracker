import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  getConfigDir,
  getCredentialsPath,
  getTokenPath,
} from "../../src/gmail/config";

describe("gmail config", () => {
  const expectedDir = join(homedir(), ".expense-tracker");

  test("getConfigDir returns ~/.expense-tracker", () => {
    expect(getConfigDir()).toBe(expectedDir);
  });

  test("getCredentialsPath returns credentials.json in config dir", () => {
    expect(getCredentialsPath()).toBe(join(expectedDir, "credentials.json"));
  });

  test("getTokenPath returns token.json in config dir", () => {
    expect(getTokenPath()).toBe(join(expectedDir, "token.json"));
  });
});
