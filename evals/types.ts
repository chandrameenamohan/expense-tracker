/** A single eval test case */
export interface EvalCase<I = unknown, E = unknown> {
  id: string;
  description: string;
  input: I;
  expected: E;
}

/** Result from grading an eval case */
export interface EvalResult {
  id: string;
  pass: boolean;
  score: number;
  details: Record<string, unknown>;
}

/** Grader function type */
export type Grader<O, E> = (output: O, expected: E) => EvalResult;

/** Component eval summary */
export interface EvalSummary {
  component: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  avgScore: number;
  results: EvalResult[];
}

/** Full eval report */
export interface EvalReport {
  timestamp: string;
  summaries: EvalSummary[];
  overallPassRate: number;
  overallAvgScore: number;
}
