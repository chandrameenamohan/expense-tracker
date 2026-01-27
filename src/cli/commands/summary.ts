/**
 * `expense-tracker summary` command.
 * Shows expense summary, category breakdown, and monthly trends.
 */

import { getDb } from "../../db/connection";

export interface SummaryOptions {
  startDate?: string;
  endDate?: string;
  direction?: "debit" | "credit";
}

export function parseSummaryArgs(args: string[]): SummaryOptions {
  const opts: SummaryOptions = {};
  for (const arg of args) {
    if (arg.startsWith("--from=")) {
      opts.startDate = arg.slice("--from=".length);
    } else if (arg.startsWith("--to=")) {
      opts.endDate = arg.slice("--to=".length);
    } else if (arg.startsWith("--direction=")) {
      opts.direction = arg.slice("--direction=".length) as "debit" | "credit";
    }
  }
  return opts;
}

interface CategoryRow {
  category: string | null;
  total: number;
  count: number;
}

interface MonthlyRow {
  month: string;
  total: number;
  count: number;
}

function buildWhereClause(opts: SummaryOptions): { where: string; params: (string | number)[] } {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (opts.startDate) {
    conditions.push("date >= ?");
    params.push(opts.startDate);
  }
  if (opts.endDate) {
    conditions.push("date <= ?");
    params.push(opts.endDate);
  }
  if (opts.direction) {
    conditions.push("direction = ?");
    params.push(opts.direction);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

export interface SummaryData {
  totalDebit: number;
  totalCredit: number;
  transactionCount: number;
  categoryBreakdown: { category: string; total: number; count: number; percent: number }[];
  monthlyTrends: { month: string; total: number; count: number }[];
}

/** Query summary data from the database. */
export function getSummaryData(opts: SummaryOptions = {}): SummaryData {
  const db = getDb();
  const { where, params } = buildWhereClause(opts);

  // Totals by direction
  const totalsRows = db
    .prepare(
      `SELECT direction, SUM(amount) as total, COUNT(*) as count
       FROM transactions ${where}
       GROUP BY direction`,
    )
    .all(...params) as { direction: string; total: number; count: number }[];

  let totalDebit = 0;
  let totalCredit = 0;
  let transactionCount = 0;
  for (const row of totalsRows) {
    if (row.direction === "debit") totalDebit = row.total;
    else totalCredit = row.total;
    transactionCount += row.count;
  }

  // Category breakdown (debits only unless direction specified)
  const catWhere = buildWhereClause(
    opts.direction ? opts : { ...opts, direction: "debit" },
  );
  const categoryRows = db
    .prepare(
      `SELECT category, SUM(amount) as total, COUNT(*) as count
       FROM transactions ${catWhere.where}
       GROUP BY category
       ORDER BY total DESC`,
    )
    .all(...catWhere.params) as CategoryRow[];

  const catTotal = categoryRows.reduce((s, r) => s + r.total, 0);
  const categoryBreakdown = categoryRows.map((r) => ({
    category: r.category ?? "Uncategorized",
    total: r.total,
    count: r.count,
    percent: catTotal > 0 ? (r.total / catTotal) * 100 : 0,
  }));

  // Monthly trends
  const monthlyRows = db
    .prepare(
      `SELECT strftime('%Y-%m', date) as month, SUM(amount) as total, COUNT(*) as count
       FROM transactions ${where}
       GROUP BY strftime('%Y-%m', date)
       ORDER BY month ASC`,
    )
    .all(...params) as MonthlyRow[];

  return {
    totalDebit,
    totalCredit,
    transactionCount,
    categoryBreakdown,
    monthlyTrends: monthlyRows,
  };
}

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Print summary to console. */
export function printSummary(data: SummaryData): void {
  console.log("=== Expense Summary ===\n");

  console.log(`Total Debits:       ${formatCurrency(data.totalDebit)}`);
  console.log(`Total Credits:      ${formatCurrency(data.totalCredit)}`);
  console.log(`Net:                ${formatCurrency(data.totalCredit - data.totalDebit)}`);
  console.log(`Transactions:       ${data.transactionCount}`);

  if (data.categoryBreakdown.length > 0) {
    console.log("\n--- Category Breakdown ---\n");
    console.log(
      `${"Category".padEnd(20)} ${"Amount".padEnd(18)} ${"Count".padEnd(8)} %`,
    );
    console.log("-".repeat(55));
    for (const cat of data.categoryBreakdown) {
      console.log(
        `${cat.category.padEnd(20)} ${formatCurrency(cat.total).padEnd(18)} ${String(cat.count).padEnd(8)} ${cat.percent.toFixed(1)}%`,
      );
    }
  }

  if (data.monthlyTrends.length > 0) {
    console.log("\n--- Monthly Trends ---\n");
    console.log(`${"Month".padEnd(12)} ${"Amount".padEnd(18)} Count`);
    console.log("-".repeat(40));
    for (const m of data.monthlyTrends) {
      console.log(
        `${m.month.padEnd(12)} ${formatCurrency(m.total).padEnd(18)} ${m.count}`,
      );
    }
  }
}

export async function summaryCommand(args: string[]): Promise<void> {
  const opts = parseSummaryArgs(args);
  const data = getSummaryData(opts);

  if (data.transactionCount === 0) {
    console.log("No transactions found.");
    return;
  }

  printSummary(data);
}
