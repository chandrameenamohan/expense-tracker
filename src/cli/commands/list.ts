/**
 * `expense-tracker list` command.
 * Lists transactions with optional filters for date, type, category, direction, and bank.
 */

import {
  listTransactions,
  countTransactions,
  type ListTransactionsOptions,
} from "../../db/transactions";
import type { Transaction } from "../../types";

/** Parse CLI args into filter options. */
export function parseListArgs(args: string[]): ListTransactionsOptions & { bank?: string } {
  const opts: ListTransactionsOptions & { bank?: string } = {};

  for (const arg of args) {
    if (arg.startsWith("--from=")) {
      opts.startDate = arg.slice("--from=".length);
    } else if (arg.startsWith("--to=")) {
      opts.endDate = arg.slice("--to=".length);
    } else if (arg.startsWith("--type=")) {
      opts.type = arg.slice("--type=".length) as Transaction["type"];
    } else if (arg.startsWith("--category=")) {
      opts.category = arg.slice("--category=".length);
    } else if (arg.startsWith("--direction=")) {
      opts.direction = arg.slice("--direction=".length) as Transaction["direction"];
    } else if (arg.startsWith("--bank=")) {
      opts.bank = arg.slice("--bank=".length);
    } else if (arg.startsWith("--limit=")) {
      opts.limit = parseInt(arg.slice("--limit=".length), 10);
    } else if (arg.startsWith("--offset=")) {
      opts.offset = parseInt(arg.slice("--offset=".length), 10);
    } else if (arg === "--review") {
      opts.needsReview = true;
    }
  }

  return opts;
}

/** Format a transaction as a single display line. */
export function formatTransaction(tx: Transaction): string {
  const date = tx.date.toISOString().slice(0, 10);
  const dir = tx.direction === "debit" ? "-" : "+";
  const amount = `${dir}₹${tx.amount.toLocaleString("en-IN")}`;
  const cat = tx.category ?? "Uncategorized";
  const review = tx.needsReview ? " [review]" : "";
  return `${date}  ${amount.padEnd(15)} ${tx.merchant.padEnd(25)} ${cat.padEnd(15)} ${tx.type.padEnd(15)} ${tx.bank || "-"}${review}`;
}

/** Format header line. */
function formatHeader(): string {
  return `${"Date".padEnd(10)}  ${"Amount".padEnd(15)} ${"Merchant".padEnd(25)} ${"Category".padEnd(15)} ${"Type".padEnd(15)} Bank`;
}

/** Dependencies injectable for testing. */
export interface ListDeps {
  listTransactions: typeof listTransactions;
  countTransactions: typeof countTransactions;
}

const defaultDeps: ListDeps = {
  listTransactions,
  countTransactions,
};

export async function listCommand(
  args: string[],
  deps: ListDeps = defaultDeps,
): Promise<void> {
  const opts = parseListArgs(args);
  const { bank, ...dbOpts } = opts;

  let transactions = deps.listTransactions(dbOpts);

  // Bank filter is applied in-memory since it's not in ListTransactionsOptions
  if (bank) {
    const bankLower = bank.toLowerCase();
    transactions = transactions.filter(
      (tx) => tx.bank?.toLowerCase() === bankLower,
    );
  }

  if (transactions.length === 0) {
    console.log("No transactions found.");
    return;
  }

  console.log(formatHeader());
  console.log("-".repeat(90));
  for (const tx of transactions) {
    console.log(formatTransaction(tx));
  }
  console.log("-".repeat(90));
  console.log(`${transactions.length} transaction(s)`);
}
