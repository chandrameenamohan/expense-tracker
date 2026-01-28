/**
 * Deeper insights for chat mode: trends, comparisons, and suggestions.
 * Computes month-over-month changes, category shifts, merchant patterns,
 * and actionable savings suggestions from transaction data.
 */

import { getDb } from "../db/connection";
import { getConfig } from "../config";

export interface MonthComparison {
  month: string;
  total: number;
  prevTotal: number;
  changePercent: number;
}

export interface CategoryTrend {
  category: string;
  currentMonth: number;
  previousMonth: number;
  changePercent: number;
}

export interface MerchantPattern {
  merchant: string;
  totalSpent: number;
  transactionCount: number;
  avgAmount: number;
  frequency: string; // "weekly", "monthly", "occasional"
}

export interface Suggestion {
  message: string;
  type: "recurring_high" | "category_spike" | "top_merchant" | "savings_opportunity";
}

export interface InsightsData {
  monthOverMonth: MonthComparison[];
  categoryTrends: CategoryTrend[];
  merchantPatterns: MerchantPattern[];
  suggestions: Suggestion[];
}

interface MonthlyRow {
  month: string;
  total: number;
}

interface CategoryMonthRow {
  category: string;
  month: string;
  total: number;
}

interface MerchantRow {
  merchant: string;
  total: number;
  count: number;
  avg_amount: number;
  first_date: string;
  last_date: string;
}

/** Compute month-over-month spending comparisons (debits). */
export function getMonthOverMonth(): MonthComparison[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT substr(date, 1, 7) as month, SUM(amount) as total
       FROM transactions WHERE direction = 'debit'
       GROUP BY substr(date, 1, 7)
       ORDER BY month ASC`,
    )
    .all() as MonthlyRow[];

  const comparisons: MonthComparison[] = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const curr = rows[i];
    const changePercent =
      prev.total > 0 ? ((curr.total - prev.total) / prev.total) * 100 : 0;
    comparisons.push({
      month: curr.month,
      total: curr.total,
      prevTotal: prev.total,
      changePercent,
    });
  }
  return comparisons;
}

/** Compute category spending trends: current vs previous month. */
export function getCategoryTrends(): CategoryTrend[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT category, substr(date, 1, 7) as month, SUM(amount) as total
       FROM transactions WHERE direction = 'debit' AND category IS NOT NULL
       GROUP BY category, substr(date, 1, 7)
       ORDER BY month DESC`,
    )
    .all() as CategoryMonthRow[];

  if (rows.length === 0) return [];

  // Find the two most recent months
  const months = [...new Set(rows.map((r) => r.month))].sort().reverse();
  if (months.length < 2) return [];

  const currentMonth = months[0];
  const prevMonth = months[1];

  const currentMap = new Map<string, number>();
  const prevMap = new Map<string, number>();

  for (const row of rows) {
    if (row.month === currentMonth) currentMap.set(row.category, row.total);
    else if (row.month === prevMonth) prevMap.set(row.category, row.total);
  }

  const allCategories = new Set([...currentMap.keys(), ...prevMap.keys()]);
  const trends: CategoryTrend[] = [];

  for (const cat of allCategories) {
    const curr = currentMap.get(cat) ?? 0;
    const prev = prevMap.get(cat) ?? 0;
    if (curr === 0 && prev === 0) continue;
    const changePercent = prev > 0 ? ((curr - prev) / prev) * 100 : curr > 0 ? 100 : 0;
    trends.push({
      category: cat,
      currentMonth: curr,
      previousMonth: prev,
      changePercent,
    });
  }

  return trends.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
}

/** Analyze merchant spending patterns. */
export function getMerchantPatterns(): MerchantPattern[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT merchant, SUM(amount) as total, COUNT(*) as count,
              AVG(amount) as avg_amount, MIN(date) as first_date, MAX(date) as last_date
       FROM transactions WHERE direction = 'debit'
       GROUP BY merchant
       HAVING count >= 2
       ORDER BY total DESC
       LIMIT 15`,
    )
    .all() as MerchantRow[];

  return rows.map((r) => {
    const firstDate = new Date(r.first_date);
    const lastDate = new Date(r.last_date);
    const daySpan = Math.max(1, (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
    const avgDaysBetween = daySpan / Math.max(1, r.count - 1);

    let frequency: "weekly" | "monthly" | "occasional";
    if (avgDaysBetween <= 10) frequency = "weekly";
    else if (avgDaysBetween <= 45) frequency = "monthly";
    else frequency = "occasional";

    return {
      merchant: r.merchant,
      totalSpent: r.total,
      transactionCount: r.count,
      avgAmount: r.avg_amount,
      frequency,
    };
  });
}

/** Generate actionable suggestions based on spending patterns. */
export function generateSuggestions(
  categoryTrends: CategoryTrend[],
  merchantPatterns: MerchantPattern[],
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Category spikes > 50%
  for (const trend of categoryTrends) {
    if (trend.changePercent > 50 && trend.currentMonth > 500) {
      suggestions.push({
        message: `${trend.category} spending jumped ${Math.round(trend.changePercent)}% this month (₹${fmt(trend.currentMonth)} vs ₹${fmt(trend.previousMonth)} last month).`,
        type: "category_spike",
      });
    }
  }

  // High-frequency merchants with high spend
  for (const mp of merchantPatterns) {
    if (mp.frequency === "weekly" && mp.totalSpent > 2000) {
      suggestions.push({
        message: `You spend at ${mp.merchant} frequently (${mp.transactionCount} times, avg ₹${fmt(mp.avgAmount)}). Total: ₹${fmt(mp.totalSpent)}.`,
        type: "recurring_high",
      });
    }
  }

  // Top merchant dominance
  if (merchantPatterns.length >= 3) {
    const totalTopSpend = merchantPatterns.reduce((s, m) => s + m.totalSpent, 0);
    const topMerchant = merchantPatterns[0];
    const topShare = (topMerchant.totalSpent / totalTopSpend) * 100;
    if (topShare > 30) {
      suggestions.push({
        message: `${topMerchant.merchant} accounts for ${Math.round(topShare)}% of your top merchant spending (₹${fmt(topMerchant.totalSpent)}).`,
        type: "top_merchant",
      });
    }
  }

  // Categories that dropped significantly (savings opportunity / good trend)
  for (const trend of categoryTrends) {
    if (trend.changePercent < -30 && trend.previousMonth > 1000) {
      suggestions.push({
        message: `${trend.category} spending dropped ${Math.round(Math.abs(trend.changePercent))}% this month — down to ₹${fmt(trend.currentMonth)} from ₹${fmt(trend.previousMonth)}.`,
        type: "savings_opportunity",
      });
    }
  }

  return suggestions;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString(getConfig().currency.locale);
}

/** Compute all deeper insights. */
export function getInsightsData(): InsightsData {
  const monthOverMonth = getMonthOverMonth();
  const categoryTrends = getCategoryTrends();
  const merchantPatterns = getMerchantPatterns();
  const suggestions = generateSuggestions(categoryTrends, merchantPatterns);

  return { monthOverMonth, categoryTrends, merchantPatterns, suggestions };
}

/** Format insights as a text block for inclusion in chat context. */
export function formatInsightsContext(data: InsightsData): string {
  const lines: string[] = [];

  if (data.monthOverMonth.length > 0) {
    lines.push("\nMonth-over-month spending changes:");
    for (const m of data.monthOverMonth) {
      const dir = m.changePercent >= 0 ? "+" : "";
      lines.push(
        `  ${m.month}: ₹${fmt(m.total)} (${dir}${Math.round(m.changePercent)}% vs previous month)`,
      );
    }
  }

  if (data.categoryTrends.length > 0) {
    lines.push("\nCategory trends (current vs previous month):");
    for (const ct of data.categoryTrends.slice(0, 8)) {
      const dir = ct.changePercent >= 0 ? "+" : "";
      lines.push(
        `  ${ct.category}: ₹${fmt(ct.currentMonth)} (${dir}${Math.round(ct.changePercent)}% change)`,
      );
    }
  }

  if (data.merchantPatterns.length > 0) {
    lines.push("\nRecurring merchant patterns:");
    for (const mp of data.merchantPatterns.slice(0, 8)) {
      lines.push(
        `  ${mp.merchant}: ₹${fmt(mp.totalSpent)} total, ${mp.transactionCount} txns, avg ₹${fmt(mp.avgAmount)}, ${mp.frequency}`,
      );
    }
  }

  if (data.suggestions.length > 0) {
    lines.push("\nNotable patterns:");
    for (const s of data.suggestions) {
      lines.push(`  - ${s.message}`);
    }
  }

  return lines.join("\n");
}
