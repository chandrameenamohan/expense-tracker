import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { google } from "googleapis";
import { getCredentialsPath, getTokenPath } from "./config";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const REDIRECT_PORT = 3847;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;

export interface StoredToken {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

function loadCredentials(): { clientId: string; clientSecret: string } {
  const raw = readFileSync(getCredentialsPath(), "utf-8");
  const json = JSON.parse(raw);
  const installed = json.installed || json.web;
  if (!installed) {
    throw new Error(
      "Invalid credentials.json: missing 'installed' or 'web' key",
    );
  }
  return {
    clientId: installed.client_id,
    clientSecret: installed.client_secret,
  };
}

export function createOAuth2Client() {
  const { clientId, clientSecret } = loadCredentials();
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
}

export function getAuthUrl(client: ReturnType<typeof createOAuth2Client>): string {
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

export async function exchangeCodeForToken(
  client: ReturnType<typeof createOAuth2Client>,
  code: string,
): Promise<void> {
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  saveToken(tokens as StoredToken);
}

export function saveToken(token: StoredToken): void {
  const tokenPath = getTokenPath();
  mkdirSync(dirname(tokenPath), { recursive: true });
  writeFileSync(tokenPath, JSON.stringify(token, null, 2));
}

export function deleteToken(): void {
  try {
    unlinkSync(getTokenPath());
  } catch {
    // Ignore if file doesn't exist
  }
}

export function loadToken(
  client: ReturnType<typeof createOAuth2Client>,
): boolean {
  try {
    const raw = readFileSync(getTokenPath(), "utf-8");
    const token: StoredToken = JSON.parse(raw);
    client.setCredentials(token);
    return true;
  } catch {
    return false;
  }
}

/**
 * Registers a listener on the OAuth2 client to persist refreshed tokens
 * automatically when the googleapis library refreshes them.
 */
function setupAutoRefresh(client: ReturnType<typeof createOAuth2Client>): void {
  client.on("tokens", (tokens) => {
    // Load existing token to preserve refresh_token (Google doesn't always
    // return it on refresh responses)
    let merged = tokens as StoredToken;
    try {
      const raw = readFileSync(getTokenPath(), "utf-8");
      const existing: StoredToken = JSON.parse(raw);
      merged = { ...existing, ...tokens } as StoredToken;
    } catch {
      // No existing token file; use what we got
    }
    saveToken(merged);
  });
}

/**
 * Tests if the current token is valid by making a lightweight API call.
 * Returns true if valid, false if revoked/expired beyond refresh.
 */
export async function isTokenValid(
  client: ReturnType<typeof createOAuth2Client>,
): Promise<boolean> {
  try {
    const tokenInfo = await client.getAccessToken();
    return tokenInfo.token != null;
  } catch {
    return false;
  }
}

export async function authenticate(): Promise<
  ReturnType<typeof createOAuth2Client>
> {
  const client = createOAuth2Client();

  if (loadToken(client)) {
    setupAutoRefresh(client);

    // Verify token is still usable (handles revoked tokens)
    if (await isTokenValid(client)) {
      return client;
    }

    // Token is revoked or permanently invalid — delete and re-auth
    console.log("Token expired or revoked. Re-authenticating...");
    deleteToken();
  }

  const authUrl = getAuthUrl(client);
  console.log("Open this URL in your browser to authorize access:\n");
  console.log(authUrl);
  console.log();

  const code = await waitForAuthCode();
  await exchangeCodeForToken(client, code);
  setupAutoRefresh(client);
  console.log("Authentication successful! Token saved.");
  return client;
}

async function waitForAuthCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = Bun.serve({
      port: REDIRECT_PORT,
      fetch(req) {
        const url = new URL(req.url);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          reject(new Error(`OAuth error: ${error}`));
          setTimeout(() => server.stop(), 100);
          return new Response(
            "Authentication failed. You can close this tab.",
            { status: 400 },
          );
        }

        if (code) {
          resolve(code);
          setTimeout(() => server.stop(), 100);
          return new Response(
            "Authentication successful! You can close this tab.",
          );
        }

        return new Response("Waiting for authentication...", { status: 400 });
      },
    });

    setTimeout(() => {
      server.stop();
      reject(new Error("Authentication timed out after 120 seconds"));
    }, 120_000);
  });
}
