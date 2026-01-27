import type { EvalResult } from "../types";
import type { Transaction } from "../../src/types";
import type { Alert } from "../../src/cli/alerts";

/** Compare two transaction objects field-by-field */
export function matchTransaction(
  actual: Partial<Transaction>,
  expected: Partial<Transaction>,
  caseId: string,
): EvalResult {
  const details: Record<string, unknown> = {};
  let matched = 0;
  let total = 0;

  function check(field: string, a: unknown, e: unknown, fuzzy = false) {
    if (e === undefined) return;
    total++;
    if (fuzzy && typeof a === "string" && typeof e === "string") {
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (norm(a) === norm(e)) {
        matched++;
        return;
      }
      details[field] = { expected: e, actual: a, match: false };
      return;
    }
    if (typeof a === "number" && typeof e === "number") {
      if (Math.abs(a - e) < 0.01) {
        matched++;
        return;
      }
      details[field] = { expected: e, actual: a, match: false };
      return;
    }
    if (a === e) {
      matched++;
      return;
    }
    details[field] = { expected: e, actual: a, match: false };
  }

  check("amount", actual.amount, expected.amount);
  check("direction", actual.direction, expected.direction);
  check("type", actual.type, expected.type);
  check("merchant", actual.merchant, expected.merchant, true);
  check("bank", actual.bank, expected.bank, true);
  check("account", actual.account, expected.account);
  check("category", actual.category, expected.category);
  check("currency", actual.currency, expected.currency);

  const score = total > 0 ? matched / total : 1;
  return {
    id: caseId,
    pass: score === 1,
    score,
    details,
  };
}

/** Exact category match */
export function matchCategory(
  actual: string,
  expected: string,
  caseId: string,
): EvalResult {
  const pass = actual === expected;
  return {
    id: caseId,
    pass,
    score: pass ? 1 : 0,
    details: pass ? {} : { expected, actual },
  };
}

/** Validate SQL is read-only and parseable */
export function matchSql(
  sql: string,
  caseId: string,
  expectedPatterns?: string[],
): EvalResult {
  const details: Record<string, unknown> = {};

  const trimmed = sql.trim().replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
  const upper = trimmed.toUpperCase();

  const isSelect = upper.startsWith("SELECT") || upper.startsWith("WITH");
  if (!isSelect) {
    details.error = "Does not start with SELECT/WITH";
  }

  const blocked = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|PRAGMA|REINDEX|VACUUM)\b/i;
  if (blocked.test(trimmed)) {
    details.blockedKeyword = true;
  }

  let patternScore = 1;
  if (expectedPatterns && expectedPatterns.length > 0) {
    let matched = 0;
    for (const p of expectedPatterns) {
      if (upper.includes(p.toUpperCase())) {
        matched++;
      } else {
        details[`missingPattern_${p}`] = true;
      }
    }
    patternScore = matched / expectedPatterns.length;
  }

  const pass = isSelect && !details.blockedKeyword && patternScore === 1;
  const score = pass ? 1 : isSelect && !details.blockedKeyword ? patternScore * 0.5 : 0;

  return { id: caseId, pass, score, details };
}

/** Compare alert arrays */
export function matchAlerts(
  actual: Alert[],
  expected: { type: string; count?: number }[],
  caseId: string,
): EvalResult {
  const details: Record<string, unknown> = {};

  for (const exp of expected) {
    const matching = actual.filter((a) => a.type === exp.type);
    const expectedCount = exp.count ?? 1;
    if (matching.length !== expectedCount) {
      details[`${exp.type}_count`] = {
        expected: expectedCount,
        actual: matching.length,
      };
    }
  }

  // Check for unexpected alerts
  const expectedTypes = new Set(expected.map((e) => e.type));
  const unexpected = actual.filter((a) => !expectedTypes.has(a.type));
  if (unexpected.length > 0) {
    details.unexpected = unexpected.map((a) => a.type);
  }

  const pass = Object.keys(details).length === 0;
  return { id: caseId, pass, score: pass ? 1 : 0, details };
}

/** Match query result rows against expected values */
export function matchQueryResults(
  actual: Record<string, unknown>[],
  expected: Record<string, unknown>[],
  caseId: string,
): EvalResult {
  const details: Record<string, unknown> = {};

  if (actual.length !== expected.length) {
    details.rowCount = { expected: expected.length, actual: actual.length };
  }

  let matched = 0;
  const checkCount = Math.min(actual.length, expected.length);
  for (let i = 0; i < checkCount; i++) {
    const a = actual[i];
    const e = expected[i];
    let rowMatch = true;
    for (const key of Object.keys(e)) {
      const av = a[key];
      const ev = e[key];
      if (typeof av === "number" && typeof ev === "number") {
        if (Math.abs(av - ev) >= 0.01) rowMatch = false;
      } else if (av !== ev) {
        rowMatch = false;
      }
    }
    if (rowMatch) matched++;
  }

  const total = Math.max(actual.length, expected.length);
  const score = total > 0 ? matched / total : 1;
  const pass = score === 1 && !details.rowCount;
  if (!pass && checkCount > 0) {
    details.matchedRows = matched;
    details.totalExpected = expected.length;
  }

  return { id: caseId, pass, score, details };
}
