import type { EvalResult } from "../types";
import { createClaudeCli, type SpawnFn } from "../../src/categorizer/claude-cli";

const MAX_RETRIES = 2;

interface JudgeOptions {
  spawnFn?: SpawnFn;
}

function getCli(opts?: JudgeOptions) {
  return createClaudeCli(opts?.spawnFn);
}

/**
 * LLM judge for categorization: scores 1.0 (exact), 0.5 (reasonable), 0.0 (wrong)
 */
export function judgeCategorization(
  actual: string,
  expected: string,
  merchant: string,
  caseId: string,
  opts?: JudgeOptions,
): EvalResult {
  if (actual === expected) {
    return { id: caseId, pass: true, score: 1, details: {} };
  }

  const cli = getCli(opts);
  const prompt = `You are an eval judge for an expense categorization system.

A transaction from merchant "${merchant}" was categorized as "${actual}".
The expected category was "${expected}".

Score this categorization:
- 1.0 if the categories are equivalent or the actual is clearly correct
- 0.5 if the actual category is reasonable but not ideal
- 0.0 if the actual category is clearly wrong

Respond with JSON only: { "score": <number>, "reasoning": "<brief explanation>" }`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = cli.runJson<{ score: number; reasoning: string }>({
      prompt,
    });

    if (result && typeof result.score === "number") {
      const score = Math.max(0, Math.min(1, result.score));
      return {
        id: caseId,
        pass: score >= 0.5,
        score,
        details: { reasoning: result.reasoning, actual, expected },
      };
    }
  }

  // Fallback: no LLM available, strict match
  return {
    id: caseId,
    pass: false,
    score: 0,
    details: { error: "LLM judge unavailable", actual, expected },
  };
}

/**
 * LLM judge for answer quality: scores 1-5 on correctness, completeness, clarity, grounding.
 */
export function judgeAnswerQuality(
  question: string,
  answer: string,
  expectedTraits: string[],
  caseId: string,
  opts?: JudgeOptions,
): EvalResult {
  const cli = getCli(opts);
  const prompt = `You are an eval judge for an expense tracker AI assistant.

The user asked: "${question}"
The assistant answered: "${answer}"

The answer should have these traits:
${expectedTraits.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Score each dimension from 1 to 5:
- correctness: Are the facts/numbers accurate?
- completeness: Does it address the full question?
- clarity: Is it well-formatted and easy to understand?
- grounding: Does it avoid hallucination and stick to provided data?

Respond with JSON only:
{ "correctness": <1-5>, "completeness": <1-5>, "clarity": <1-5>, "grounding": <1-5>, "reasoning": "<brief>" }`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = cli.runJson<{
      correctness: number;
      completeness: number;
      clarity: number;
      grounding: number;
      reasoning: string;
    }>({ prompt });

    if (
      result &&
      typeof result.correctness === "number" &&
      typeof result.completeness === "number" &&
      typeof result.clarity === "number" &&
      typeof result.grounding === "number"
    ) {
      const avg =
        (result.correctness +
          result.completeness +
          result.clarity +
          result.grounding) /
        4;
      const normalized = (avg - 1) / 4; // 1-5 → 0-1
      return {
        id: caseId,
        pass: avg >= 3.5,
        score: normalized,
        details: {
          correctness: result.correctness,
          completeness: result.completeness,
          clarity: result.clarity,
          grounding: result.grounding,
          avg,
          reasoning: result.reasoning,
        },
      };
    }
  }

  return {
    id: caseId,
    pass: false,
    score: 0,
    details: { error: "LLM judge unavailable" },
  };
}
