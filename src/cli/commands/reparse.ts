/**
 * `expense-tracker reparse` command.
 * Re-parses all raw emails through the parser pipeline.
 * Deletes existing transactions and creates fresh ones.
 */

import { getAllRawEmails } from "../../db/raw-emails";
import { deleteAllTransactions, insertTransactions } from "../../db/transactions";
import { getReviewQueueCount } from "../../db/review-queue";
import { createParserPipeline, parseEmails } from "../../parser/pipeline";
import { createClaudeCli } from "../../categorizer/claude-cli";
import { categorizeTransactions } from "../../categorizer/categorize";

/** Dependencies injectable for testing. */
export interface ReparseDeps {
  getAllRawEmails: typeof getAllRawEmails;
  deleteAllTransactions: typeof deleteAllTransactions;
  createParserPipeline: typeof createParserPipeline;
  parseEmails: typeof parseEmails;
  createClaudeCli: typeof createClaudeCli;
  categorizeTransactions: typeof categorizeTransactions;
  insertTransactions: typeof insertTransactions;
  getReviewQueueCount: typeof getReviewQueueCount;
}

const defaultDeps: ReparseDeps = {
  getAllRawEmails,
  deleteAllTransactions,
  createParserPipeline,
  parseEmails,
  createClaudeCli,
  categorizeTransactions,
  insertTransactions,
  getReviewQueueCount,
};

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

export async function reparseCommand(
  args: string[],
  deps: ReparseDeps = defaultDeps,
): Promise<void> {
  const skipCategorize = hasFlag(args, "--skip-categorize");

  // Step 1: Get all raw emails
  const rawEmails = deps.getAllRawEmails();
  if (rawEmails.length === 0) {
    console.log("No raw emails in database. Run \"expense-tracker sync\" first.");
    return;
  }

  console.log(`Found ${rawEmails.length} raw emails.`);

  // Step 2: Delete existing transactions
  const deleted = deps.deleteAllTransactions();
  console.log(`Deleted ${deleted} existing transactions.`);

  // Step 3: Re-parse all emails
  console.log("Re-parsing all emails...");
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
        console.log("Claude CLI not available, skipping categorization.");
      }
    }
  }

  // Step 5: Store transactions
  const inserted = deps.insertTransactions(transactions);
  console.log(`Stored ${inserted} transactions.`);

  // Step 6: Summary
  const reviewCount = deps.getReviewQueueCount();
  if (reviewCount > 0) {
    console.log(
      `${reviewCount} transactions need review. Run "expense-tracker review" to review them.`,
    );
  }

  console.log("Reparse complete.");
}
