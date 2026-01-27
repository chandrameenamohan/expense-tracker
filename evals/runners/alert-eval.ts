/**
 * Alert eval runner.
 * Tests spending alert generation against expected alerts.
 */

import type { EvalResult } from "../types";
import { generateAlerts } from "../../src/cli/alerts";
import { matchAlerts } from "../graders/code-grader";
import { buildSummary } from "../report";
import { loadFixtures, createTestDb, seedTransactions, teardownTestDb } from "../helpers";

interface AlertFixture {
  id: string;
  description: string;
  now: string; // ISO date string for "current time"
  seedData: Array<{
    id: string;
    emailMessageId: string;
    date: string;
    amount: number;
    direction: string;
    type: string;
    merchant: string;
    category?: string;
    bank?: string;
  }>;
  expectedAlerts: Array<{
    type: string;
    count?: number;
  }>;
}

export function runAlertEval() {
  const fixtures = loadFixtures<AlertFixture[]>("alerts/fixtures.json");
  const results: EvalResult[] = [];

  for (const fixture of fixtures) {
    const db = createTestDb();

    try {
      seedTransactions(db, fixture.seedData);
      const alerts = generateAlerts(new Date(fixture.now));
      const result = matchAlerts(alerts, fixture.expectedAlerts, fixture.id);
      results.push(result);
    } finally {
      teardownTestDb();
    }
  }

  return buildSummary("alerts", results);
}
