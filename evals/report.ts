import type { EvalReport, EvalSummary } from "./types";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Print a formatted summary to console */
export function printReport(report: EvalReport): void {
  console.log("\n" + "=".repeat(60));
  console.log("  EVAL REPORT");
  console.log("  " + report.timestamp);
  console.log("=".repeat(60) + "\n");

  for (const s of report.summaries) {
    printSummary(s);
  }

  console.log("-".repeat(60));
  console.log(
    `  OVERALL: ${(report.overallPassRate * 100).toFixed(1)}% pass rate, ${report.overallAvgScore.toFixed(2)} avg score`,
  );
  console.log("");
}

function printSummary(s: EvalSummary): void {
  const passRate = (s.passRate * 100).toFixed(1);
  const status = s.passRate >= 0.8 ? "PASS" : "FAIL";
  console.log(`  [${status}] ${s.component}: ${passRate}% (${s.passed}/${s.total}), avg score ${s.avgScore.toFixed(2)}`);

  const failures = s.results.filter((r) => !r.pass);
  if (failures.length > 0 && failures.length <= 5) {
    for (const f of failures) {
      console.log(`         ✗ ${f.id}: ${JSON.stringify(f.details)}`);
    }
  } else if (failures.length > 5) {
    for (const f of failures.slice(0, 3)) {
      console.log(`         ✗ ${f.id}: ${JSON.stringify(f.details)}`);
    }
    console.log(`         ... and ${failures.length - 3} more failures`);
  }
}

/** Build a report from summaries */
export function buildReport(summaries: EvalSummary[]): EvalReport {
  const totalCases = summaries.reduce((a, s) => a + s.total, 0);
  const totalPassed = summaries.reduce((a, s) => a + s.passed, 0);
  const totalScore = summaries.reduce((a, s) => a + s.avgScore * s.total, 0);

  return {
    timestamp: new Date().toISOString(),
    summaries,
    overallPassRate: totalCases > 0 ? totalPassed / totalCases : 0,
    overallAvgScore: totalCases > 0 ? totalScore / totalCases : 0,
  };
}

/** Build a summary from eval results */
export function buildSummary(
  component: string,
  results: import("./types").EvalResult[],
): EvalSummary {
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const avgScore =
    total > 0 ? results.reduce((a, r) => a + r.score, 0) / total : 0;

  return {
    component,
    total,
    passed,
    failed: total - passed,
    passRate: total > 0 ? passed / total : 0,
    avgScore,
    results,
  };
}

/** Save JSON report to evals/reports/ */
export function saveReport(report: EvalReport): string {
  const dir = join(import.meta.dir, "reports");
  mkdirSync(dir, { recursive: true });
  const filename = `eval-${report.timestamp.replace(/[:.]/g, "-")}.json`;
  const path = join(dir, filename);
  writeFileSync(path, JSON.stringify(report, null, 2));
  return path;
}
