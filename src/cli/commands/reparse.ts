/**
 * `expense-tracker reparse` command.
 * Re-parses raw emails through the parser pipeline.
 * With --missing: only re-parses emails that have no transactions (safe, non-destructive).
 * Without flags: deletes existing transactions and re-parses everything.
 */

import { getAllRawEmails, getRawEmailsByIds } from "../../db/raw-emails";
import { deleteAllTransactions, insertTransactions } from "../../db/transactions";
import { getReviewQueueCount } from "../../db/review-queue";
import { createParserPipeline, parseEmails } from "../../parser/pipeline";
import { createClaudeCli } from "../../categorizer/claude-cli";
import { categorizeTransactions } from "../../categorizer/categorize";
import { findAndFlagDuplicates } from "../../dedup/dedup";
import { getDb } from "../../db/connection";

/** Dependencies injectable for testing. */
export interface ReparseDeps {
  getAllRawEmails: typeof getAllRawEmails;
  getRawEmailsByIds: typeof getRawEmailsByIds;
  deleteAllTransactions: typeof deleteAllTransactions;
  createParserPipeline: typeof createParserPipeline;
  parseEmails: typeof parseEmails;
  createClaudeCli: typeof createClaudeCli;
  categorizeTransactions: typeof categorizeTransactions;
  insertTransactions: typeof insertTransactions;
  getReviewQueueCount: typeof getReviewQueueCount;
  findAndFlagDuplicates: typeof findAndFlagDuplicates;
}

const defaultDeps: ReparseDeps = {
  getAllRawEmails,
  getRawEmailsByIds,
  deleteAllTransactions,
  createParserPipeline,
  parseEmails,
  createClaudeCli,
  categorizeTransactions,
  insertTransactions,
  getReviewQueueCount,
  findAndFlagDuplicates,
};

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

export async function reparseCommand(
  args: string[],
  deps: ReparseDeps = defaultDeps,
): Promise<void> {
  const skipCategorize = hasFlag(args, "--skip-categorize");
  const missingOnly = hasFlag(args, "--missing");

  if (missingOnly) {
    return reparseMissing(args, deps, skipCategorize);
  }

  // Full reparse: delete all and re-parse everything
  const rawEmails = deps.getAllRawEmails();
  if (rawEmails.length === 0) {
    console.log("No raw emails in database. Run \"expense-tracker sync\" first.");
    return;
  }

  console.log(`Found ${rawEmails.length} raw emails.`);

  const deleted = deps.deleteAllTransactions();
  console.log(`Deleted ${deleted} existing transactions.`);

  console.log("Re-parsing all emails...");
  const pipeline = deps.createParserPipeline();
  const transactions = deps.parseEmails(pipeline, rawEmails);

  if (transactions.length === 0) {
    console.log("No transactions found in emails.");
    return;
  }

  console.log(`Parsed ${transactions.length} transactions.`);

  if (!skipCategorize) {
    categorizeAll(deps, transactions);
  }

  const inserted = deps.insertTransactions(transactions);
  console.log(`Stored ${inserted} transactions.`);

  printReviewCount(deps);
  console.log("Reparse complete.");
}

/** Re-parse only emails that have no transactions (non-destructive). */
async function reparseMissing(
  _args: string[],
  deps: ReparseDeps,
  skipCategorize: boolean,
): Promise<void> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT message_id FROM raw_emails
    WHERE message_id NOT IN (SELECT DISTINCT email_message_id FROM transactions)
  `).all() as { message_id: string }[];

  if (rows.length === 0) {
    console.log("All emails already have transactions. Nothing to reparse.");
    return;
  }

  const ids = rows.map((r) => r.message_id);
  console.log(`Found ${ids.length} emails with no transactions.`);

  const rawEmails = deps.getRawEmailsByIds(ids);
  const pipeline = deps.createParserPipeline();
  const transactions = deps.parseEmails(pipeline, rawEmails);

  if (transactions.length === 0) {
    console.log("No transactions found in emails.");
    return;
  }

  console.log(`Parsed ${transactions.length} transactions.`);

  if (!skipCategorize) {
    categorizeAll(deps, transactions);
  }

  const inserted = deps.insertTransactions(transactions);
  console.log(`Stored ${inserted} new transactions.`);

  // Run dedup on newly inserted transactions
  if (inserted > 0) {
    const cli = deps.createClaudeCli();
    if (cli.isAvailable()) {
      console.log("Checking for duplicates...");
      const newTxIds = transactions.map((tx) => tx.id);
      const dedupResult = deps.findAndFlagDuplicates(cli, newTxIds);
      if (dedupResult.duplicatesConfirmed > 0) {
        console.log(`Flagged ${dedupResult.duplicatesConfirmed} duplicate(s) for review.`);
      }
    }
  }

  printReviewCount(deps);
  console.log("Reparse complete.");
}

function categorizeAll(deps: ReparseDeps, transactions: { category?: string; confidence?: number }[]): void {
  const uncategorized = transactions.filter((tx) => !tx.category);
  if (uncategorized.length === 0) return;

  console.log(`Categorizing ${uncategorized.length} transactions...`);
  const cli = deps.createClaudeCli();
  if (cli.isAvailable()) {
    const results = deps.categorizeTransactions(cli, uncategorized as any);
    for (let i = 0; i < uncategorized.length; i++) {
      uncategorized[i].category = results[i].category;
      if (uncategorized[i].confidence === undefined) {
        uncategorized[i].confidence = results[i].confidence;
      }
    }
  } else {
    console.log("Claude CLI not available, skipping categorization.");
  }
}

function printReviewCount(deps: ReparseDeps): void {
  const reviewCount = deps.getReviewQueueCount();
  if (reviewCount > 0) {
    console.log(
      `${reviewCount} transactions need review. Run "expense-tracker review" to review them.`,
    );
  }
}
