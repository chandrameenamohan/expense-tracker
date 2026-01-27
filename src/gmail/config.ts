import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".expense-tracker");

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getCredentialsPath(): string {
  return join(CONFIG_DIR, "credentials.json");
}

export function getTokenPath(): string {
  return join(CONFIG_DIR, "token.json");
}

export function hasCredentials(): boolean {
  return existsSync(getCredentialsPath());
}

export function hasToken(): boolean {
  return existsSync(getTokenPath());
}
