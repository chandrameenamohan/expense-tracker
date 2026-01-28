/**
 * Post-sync alerts: surface spending anomalies after each sync.
 * Compares the current week's spending by category against the
 * trailing-4-week weekly average per category.
 */

import { getDb } from "../db/connection";
import { getConfig } from "../config";

export interface Alert {
  message: string;
  type: "spending_spike" | "large_transaction" | "new_category";
}

interface CategorySpending {
  category: string;
  total: number;
  count: number;
}

const { spikeThreshold: SPIKE_THRESHOLD, largeTransactionAmount: LARGE_TRANSACTION_AMOUNT } = getConfig().alerts;

/** Get spending by category for a date range (debits only). */
export function getCategorySpending(
  startDate: string,
  endDate: string,
): CategorySpending[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT category, SUM(amount) as total, COUNT(*) as count
       FROM transactions
       WHERE direction = 'debit' AND date >= ? AND date <= ?
       GROUP BY category`,
    )
    .all(startDate, endDate) as CategorySpending[];
}

/** Get the start of the current ISO week (Monday) as YYYY-MM-DD. */
export function weekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

/** Generate alerts by comparing current week vs trailing 4-week average. */
export function generateAlerts(now: Date = new Date()): Alert[] {
  const alerts: Alert[] = [];
  const db = getDb();

  const currentWeekStart = weekStart(now);
  const currentEnd = now.toISOString().slice(0, 10);

  // Trailing 4 weeks: 4 weeks before current week start
  const trailingStart = new Date(now);
  const dow = now.getDay();
  const toMonday = dow === 0 ? 6 : dow - 1;
  trailingStart.setDate(now.getDate() - toMonday - 28);
  const trailingStartStr = trailingStart.toISOString().slice(0, 10);
  const trailingEndStr = (() => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  // Current week spending by category
  const currentSpending = getCategorySpending(currentWeekStart, currentEnd);

  // Trailing 4-week spending by category
  const trailingSpending = getCategorySpending(trailingStartStr, trailingEndStr);

  // Build trailing weekly average map
  const trailingAvgMap = new Map<string, number>();
  for (const row of trailingSpending) {
    trailingAvgMap.set(row.category, row.total / 4);
  }

  // Check for spending spikes
  for (const curr of currentSpending) {
    const cat = curr.category ?? "Uncategorized";
    const avg = trailingAvgMap.get(curr.category) ?? 0;
    if (avg > 0 && curr.total > avg * SPIKE_THRESHOLD) {
      const pctMore = Math.round(((curr.total - avg) / avg) * 100);
      alerts.push({
        message: `You spent ${pctMore}% more on ${cat} this week (₹${formatNum(curr.total)} vs avg ₹${formatNum(avg)}/week).`,
        type: "spending_spike",
      });
    } else if (avg === 0 && curr.total > 0) {
      // New category this week
      alerts.push({
        message: `New spending in ${cat} this week: ₹${formatNum(curr.total)}.`,
        type: "new_category",
      });
    }
  }

  // Check for large individual transactions from today's sync
  const largeTxRows = db
    .prepare(
      `SELECT amount, merchant, category FROM transactions
       WHERE direction = 'debit' AND amount >= ? AND date >= ?
       ORDER BY amount DESC LIMIT 5`,
    )
    .all(LARGE_TRANSACTION_AMOUNT, currentWeekStart) as {
    amount: number;
    merchant: string;
    category: string | null;
  }[];

  for (const tx of largeTxRows) {
    alerts.push({
      message: `Large transaction: ₹${formatNum(tx.amount)} at ${tx.merchant || "unknown"}.`,
      type: "large_transaction",
    });
  }

  return alerts;
}

function formatNum(n: number): string {
  return n.toLocaleString(getConfig().currency.locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** Print alerts to console. */
export function printAlerts(alerts: Alert[]): void {
  if (alerts.length === 0) return;
  console.log("\n--- Alerts ---\n");
  for (const alert of alerts) {
    console.log(`  ⚠ ${alert.message}`);
  }
}
