/**
 * `expense-tracker sync` command.
 * Fetches new emails from Gmail, parses transactions, categorizes them, and stores results.
 */

import { authenticate } from "../../gmail/auth";
import { syncEmails } from "../../gmail/sync";
import { getAllRawEmails } from "../../db/raw-emails";
import { createParserPipeline, parseEmails } from "../../parser/pipeline";
import { createClaudeCli } from "../../categorizer/claude-cli";
import { categorizeTransactions } from "../../categorizer/categorize";
import { insertTransactions } from "../../db/transactions";
import { getReviewQueueCount } from "../../db/review-queue";
import { hasCredentials } from "../../gmail/config";
import { generateAlerts, printAlerts } from "../alerts";
import type { SyncResult } from "../../gmail/sync";
import type { OAuth2Client } from "googleapis-common";

/** Dependencies injectable for testing. */
export interface SyncDeps {
  hasCredentials: () => boolean;
  authenticate: () => Promise<OAuth2Client>;
  syncEmails: (client: OAuth2Client, opts?: { since?: Date }) => Promise<SyncResult>;
  getAllRawEmails: typeof getAllRawEmails;
  createParserPipeline: typeof createParserPipeline;
  parseEmails: typeof parseEmails;
  createClaudeCli: typeof createClaudeCli;
  categorizeTransactions: typeof categorizeTransactions;
  insertTransactions: typeof insertTransactions;
  getReviewQueueCount: typeof getReviewQueueCount;
  generateAlerts: typeof generateAlerts;
  printAlerts: typeof printAlerts;
}

const defaultDeps: SyncDeps = {
  hasCredentials,
  authenticate,
  syncEmails,
  getAllRawEmails,
  createParserPipeline,
  parseEmails,
  createClaudeCli,
  categorizeTransactions,
  insertTransactions,
  getReviewQueueCount,
  generateAlerts,
  printAlerts,
};

function parseSinceArg(args: string[]): Date | undefined {
  for (const arg of args) {
    if (arg.startsWith("--since=")) {
      const value = arg.slice("--since=".length);
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        console.error(`Invalid date for --since: "${value}"`);
        process.exitCode = 1;
        return undefined;
      }
      return date;
    }
  }
  return undefined;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

export async function syncCommand(
  args: string[],
  deps: SyncDeps = defaultDeps,
): Promise<void> {
  // Check credentials
  if (!deps.hasCredentials()) {
    console.error(
      'Gmail credentials not found. Run "expense-tracker setup" first.',
    );
    process.exitCode = 1;
    return;
  }

  const skipCategorize = hasFlag(args, "--skip-categorize");
  const sinceDate = parseSinceArg(args);
  if (sinceDate === undefined && args.some((a) => a.startsWith("--since="))) {
    return; // parseSinceArg set error
  }

  // Step 1: Authenticate
  console.log("Authenticating with Gmail...");
  let client;
  try {
    client = await deps.authenticate();
  } catch (err) {
    console.error("Authentication failed:", (err as Error).message);
    process.exitCode = 1;
    return;
  }

  // Step 2: Sync emails
  console.log("Fetching new emails...");
  let syncResult;
  try {
    syncResult = await deps.syncEmails(client, { since: sinceDate });
  } catch (err) {
    console.error("Email sync failed:", (err as Error).message);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Found ${syncResult.messagesFound} messages, ${syncResult.newEmailsStored} new emails stored.`,
  );

  if (syncResult.newEmailsStored === 0) {
    console.log("No new emails to process.");
    return;
  }

  // Step 3: Parse emails
  console.log("Parsing transactions...");
  const rawEmails = deps.getAllRawEmails();
  const pipeline = deps.createParserPipeline();
  const transactions = deps.parseEmails(pipeline, rawEmails);

  if (transactions.length === 0) {
    console.log("No transactions found in emails.");
    return;
  }

  console.log(`Parsed ${transactions.length} transactions.`);

  // Step 4: Categorize (unless skipped)
  if (!skipCategorize) {
    const uncategorized = transactions.filter((tx) => !tx.category);
    if (uncategorized.length > 0) {
      console.log(`Categorizing ${uncategorized.length} transactions...`);
      const cli = deps.createClaudeCli();
      if (cli.isAvailable()) {
        const results = deps.categorizeTransactions(cli, uncategorized);
        for (let i = 0; i < uncategorized.length; i++) {
          uncategorized[i].category = results[i].category;
          if (uncategorized[i].confidence === undefined) {
            uncategorized[i].confidence = results[i].confidence;
          }
        }
      } else {
        console.log(
          "Claude CLI not available, skipping categorization.",
        );
      }
    }
  }

  // Step 5: Store transactions
  const inserted = deps.insertTransactions(transactions);
  console.log(`Stored ${inserted} new transactions.`);

  // Step 6: Summary
  const reviewCount = deps.getReviewQueueCount();
  if (reviewCount > 0) {
    console.log(
      `${reviewCount} transactions need review. Run "expense-tracker review" to review them.`,
    );
  }

  // Step 7: Post-sync alerts
  const alerts = deps.generateAlerts();
  deps.printAlerts(alerts);

  console.log("Sync complete.");
}
