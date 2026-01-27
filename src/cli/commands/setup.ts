import { getConfigDir, getCredentialsPath, hasCredentials, hasToken } from "../../gmail";

export function setupCommand(_args: string[]): void {
  console.log("=== Expense Tracker Setup ===\n");

  if (hasCredentials() && hasToken()) {
    console.log("✓ OAuth credentials found at: " + getCredentialsPath());
    console.log("✓ Token already exists. Setup is complete.");
    console.log("\nRun `expense-tracker sync` to fetch transaction emails.");
    return;
  }

  if (hasCredentials()) {
    console.log("✓ OAuth credentials found at: " + getCredentialsPath());
    console.log("⚠ No token yet. Run `expense-tracker sync` to trigger the OAuth consent flow.\n");
    return;
  }

  console.log("To connect to Gmail, you need Google Cloud OAuth2 credentials.\n");
  console.log("Follow these steps:\n");
  console.log("  1. Go to https://console.cloud.google.com/");
  console.log("  2. Create a new project (or select an existing one)");
  console.log("  3. Enable the Gmail API:");
  console.log("     - Navigate to APIs & Services → Library");
  console.log('     - Search for "Gmail API" and click Enable');
  console.log("  4. Create OAuth2 credentials:");
  console.log("     - Navigate to APIs & Services → Credentials");
  console.log('     - Click "Create Credentials" → "OAuth client ID"');
  console.log('     - Application type: "Desktop app"');
  console.log("     - Download the JSON file");
  console.log("  5. Save the downloaded file as:\n");
  console.log(`     ${getCredentialsPath()}\n`);
  console.log("  6. Run this command again to verify.\n");

  console.log(`Config directory: ${getConfigDir()}`);
  console.log("\nRequired Gmail scope: https://www.googleapis.com/auth/gmail.readonly");
  console.log("(Read-only access — this app never modifies your email.)");
}
