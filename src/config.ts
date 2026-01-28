/**
 * Central configuration module.
 * Loads optional ~/.expense-tracker/config.json, merges with defaults.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface AppConfig {
  gmail: {
    senders: string[];
    subjectKeywords: string[];
    redirectPort: number;
    authTimeoutMs: number;
    fetchBatchSize: number;
  };
  currency: {
    code: string;
    locale: string;
  };
  alerts: {
    spikeThreshold: number;
    largeTransactionAmount: number;
  };
  sync: {
    defaultLookbackMonths: number;
  };
  parser: {
    confidenceThreshold: number;
    bodyTruncationLimit: number;
  };
  rateLimit: {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
  };
  dedup: {
    dateToleranceDays: number;
  };
  categories: {
    list: string[];
    descriptions: Record<string, string>;
  };
}

const DEFAULT_CONFIG: AppConfig = {
  gmail: {
    senders: [
      "alerts@hdfcbank.net",
      "alerts@icicibank.com",
      "alerts@axisbank.com",
      "alerts@sbicard.com",
      "alerts@sbi.co.in",
      "noreply@hdfcbank.net",
      "creditcards@hdfcbank.net",
      "donotreply@indusind.com",
      "alerts@kotak.com",
      "transact@unionbankofindia.co.in",
      "chandrameenamohan@gmail.com",
    ],
    subjectKeywords: [
      "transaction",
      "debit",
      "credit",
      "payment",
      "UPI",
      "EMI",
      "SIP",
      "account update",
    ],
    redirectPort: 3847,
    authTimeoutMs: 120_000,
    fetchBatchSize: 50,
  },
  currency: {
    code: "INR",
    locale: "en-IN",
  },
  alerts: {
    spikeThreshold: 1.4,
    largeTransactionAmount: 10000,
  },
  sync: {
    defaultLookbackMonths: 12,
  },
  parser: {
    confidenceThreshold: 0.7,
    bodyTruncationLimit: 8000,
  },
  rateLimit: {
    maxRetries: 5,
    initialDelayMs: 1000,
    maxDelayMs: 32000,
  },
  dedup: {
    dateToleranceDays: 1,
  },
  categories: {
    list: [
      "Food",
      "Transport",
      "Shopping",
      "Bills",
      "Entertainment",
      "Health",
      "Education",
      "Investment",
      "Transfer",
      "Other",
    ],
    descriptions: {
      Food: "Restaurants, cafes, bakeries, coffee shops, grocery stores, food delivery, dining out",
      Transport: "Fuel, gas stations, cab/taxi, auto, ride-sharing, metro, bus, parking, tolls, vehicle servicing",
      Shopping: "Online/offline retail, clothing, electronics, home goods, Amazon, Flipkart",
      Bills: "Utilities, electricity, water, internet, phone, rent, insurance, subscriptions, app purchases, recharges",
      Entertainment: "Movies, streaming, gaming, events, concerts, sports",
      Health: "Pharmacy, hospital, doctor, lab tests, medical supplies, gym, fitness",
      Education: "Courses, books, tuition, school/college fees, training",
      Investment: "Mutual funds, SIP, stocks, fixed deposits, PPF, NPS",
      Transfer: "Person-to-person transfers, NEFT/RTGS/IMPS to individuals, rent payments to landlords, family transfers",
      Other: "Only use when the transaction truly does not fit any category above",
    },
  },
};

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];
    if (
      srcVal !== null &&
      typeof srcVal === "object" &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === "object" &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;

  const configPath = join(homedir(), ".expense-tracker", "config.json");
  let overrides: Record<string, unknown> = {};

  try {
    const raw = readFileSync(configPath, "utf-8");
    overrides = JSON.parse(raw);
  } catch {
    // No config file or invalid JSON — use defaults
  }

  cached = deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, overrides) as unknown as AppConfig;
  return cached;
}

/** Reset cached config (for testing). */
export function _resetConfig(): void {
  cached = null;
}
