/**
 * `expense-tracker review` command.
 * Interactively review low-confidence AI-parsed transactions.
 * Shows each transaction needing review and prompts for action.
 */

import {
  getReviewQueue,
  getReviewQueueCount,
  resolveReview,
  updateTransactionCategory,
  insertCategoryCorrection,
} from "../../db";
import type { Transaction } from "../../types";
import { isValidCategory, CATEGORIES } from "../../categorizer";

/** Dependencies injectable for testing. */
export interface ReviewDeps {
  getReviewQueue: typeof getReviewQueue;
  getReviewQueueCount: typeof getReviewQueueCount;
  resolveReview: typeof resolveReview;
  updateTransactionCategory: typeof updateTransactionCategory;
  insertCategoryCorrection: typeof insertCategoryCorrection;
  readLine: (prompt: string) => Promise<string>;
}

const defaultReadLine = async (prompt: string): Promise<string> => {
  process.stdout.write(prompt);
  for await (const line of console) {
    return line.trim();
  }
  return "";
};

const defaultDeps: ReviewDeps = {
  getReviewQueue,
  getReviewQueueCount,
  resolveReview,
  updateTransactionCategory,
  insertCategoryCorrection,
  readLine: defaultReadLine,
};

/** Format a transaction for review display. */
export function formatForReview(tx: Transaction): string {
  const date = tx.date.toISOString().slice(0, 10);
  const dir = tx.direction === "debit" ? "-" : "+";
  const amount = `${dir}₹${tx.amount.toLocaleString("en-IN")}`;
  const cat = tx.category ?? "Uncategorized";
  const conf = tx.confidence != null ? ` (confidence: ${(tx.confidence * 100).toFixed(0)}%)` : "";

  const lines = [
    `  ID:        ${tx.id}`,
    `  Date:      ${date}`,
    `  Amount:    ${amount}`,
    `  Merchant:  ${tx.merchant}`,
    `  Category:  ${cat}${conf}`,
    `  Type:      ${tx.type}`,
    `  Bank:      ${tx.bank || "-"}`,
    `  Source:    ${tx.source}`,
  ];
  if (tx.description) {
    lines.push(`  Desc:      ${tx.description}`);
  }
  return lines.join("\n");
}

export async function reviewCommand(
  _args: string[],
  deps: ReviewDeps = defaultDeps,
): Promise<void> {
  const count = deps.getReviewQueueCount();

  if (count === 0) {
    console.log("No transactions need review.");
    return;
  }

  console.log(`${count} transaction(s) need review.\n`);
  console.log("Actions: [a]pprove  [c]ategorize <category>  [s]kip  [q]uit");
  console.log(`Categories: ${CATEGORIES.join(", ")}\n`);

  const queue = deps.getReviewQueue();
  let reviewed = 0;
  let skipped = 0;

  for (const tx of queue) {
    console.log(`--- Transaction ${reviewed + skipped + 1} of ${queue.length} ---`);
    console.log(formatForReview(tx));

    let handled = false;
    while (!handled) {
      const input = await deps.readLine("\n> ");
      const parts = input.split(/\s+/);
      const action = parts[0]?.toLowerCase();

      if (action === "a" || action === "approve") {
        deps.resolveReview(tx.id);
        console.log("Approved.\n");
        reviewed++;
        handled = true;
      } else if (action === "c" || action === "categorize") {
        const category = parts[1];
        if (!category || !isValidCategory(category)) {
          console.log(`Invalid category. Valid: ${CATEGORIES.join(", ")}`);
          continue;
        }
        const oldCategory = tx.category ?? "(none)";
        deps.updateTransactionCategory(tx.id, category);
        deps.resolveReview(tx.id);
        deps.insertCategoryCorrection(tx.merchant, oldCategory, category, tx.description);
        console.log(`Recategorized: ${oldCategory} → ${category}. Approved.\n`);
        reviewed++;
        handled = true;
      } else if (action === "s" || action === "skip") {
        console.log("Skipped.\n");
        skipped++;
        handled = true;
      } else if (action === "q" || action === "quit") {
        console.log(`\nReviewed: ${reviewed}, Skipped: ${skipped}, Remaining: ${queue.length - reviewed - skipped}`);
        return;
      } else {
        console.log("Unknown action. Use [a]pprove, [c]ategorize <category>, [s]kip, or [q]uit.");
      }
    }
  }

  console.log(`\nDone. Reviewed: ${reviewed}, Skipped: ${skipped}`);
}
