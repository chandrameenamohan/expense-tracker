import { describe, it, expect } from "bun:test";
import {
  createAiFallbackParser,
  parseAiResponse,
  buildPrompt,
  toTransaction,
} from "../../src/parser/ai-fallback";
import type { RawEmail } from "../../src/types";

function makeEmail(overrides: Partial<RawEmail> = {}): RawEmail {
  return {
    messageId: "msg-123",
    from: "alerts@bank.com",
    subject: "Transaction Alert",
    date: new Date("2025-01-15T10:00:00Z"),
    bodyText: "Your account has been debited Rs. 500 for purchase at Amazon",
    ...overrides,
  };
}

describe("buildPrompt", () => {
  it("includes email fields in the prompt", () => {
    const email = makeEmail();
    const prompt = buildPrompt(email);
    expect(prompt).toContain("Transaction Alert");
    expect(prompt).toContain("alerts@bank.com");
    expect(prompt).toContain("Rs. 500");
    expect(prompt).toContain("2025-01-15");
  });

  it("truncates long body text to 8000 chars", () => {
    const longBody = "x".repeat(10000);
    const email = makeEmail({ bodyText: longBody });
    const prompt = buildPrompt(email);
    // The body portion should be truncated
    expect(prompt.length).toBeLessThan(10000 + 1000); // prompt template + 8000
  });
});

describe("parseAiResponse", () => {
  it("parses direct JSON with transactions array", () => {
    const json = JSON.stringify({
      transactions: [{ amount: 500, direction: "debit", type: "upi", merchant: "Amazon", confidence: 0.9 }],
    });
    const result = parseAiResponse(json);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].amount).toBe(500);
  });

  it("parses JSON wrapped in claude CLI result field", () => {
    const inner = JSON.stringify({
      transactions: [{ amount: 1000, direction: "credit", type: "bank_transfer", merchant: "Salary", confidence: 0.95 }],
    });
    const json = JSON.stringify({ result: inner });
    const result = parseAiResponse(json);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].merchant).toBe("Salary");
  });

  it("handles markdown code fences in response", () => {
    const inner = JSON.stringify({
      transactions: [{ amount: 200, direction: "debit", type: "credit_card", merchant: "Swiggy", confidence: 0.8 }],
    });
    const wrapped = "```json\n" + inner + "\n```";
    const json = JSON.stringify({ result: wrapped });
    const result = parseAiResponse(json);
    expect(result.transactions).toHaveLength(1);
  });

  it("returns empty transactions for invalid JSON", () => {
    expect(() => parseAiResponse("not json at all")).toThrow();
  });

  it("returns empty transactions for missing transactions key", () => {
    const result = parseAiResponse(JSON.stringify({ foo: "bar" }));
    expect(result.transactions).toHaveLength(0);
  });
});

describe("toTransaction", () => {
  const email = makeEmail();

  it("converts a valid AI transaction", () => {
    const ai = {
      amount: 500,
      direction: "debit",
      type: "upi",
      merchant: "Amazon",
      account: "XX1234",
      bank: "HDFC",
      reference: "REF123",
      confidence: 0.9,
    };
    const tx = toTransaction(ai, email);
    expect(tx).not.toBeNull();
    expect(tx!.amount).toBe(500);
    expect(tx!.direction).toBe("debit");
    expect(tx!.type).toBe("upi");
    expect(tx!.merchant).toBe("Amazon");
    expect(tx!.source).toBe("ai");
    expect(tx!.confidence).toBe(0.9);
    expect(tx!.needsReview).toBe(false);
  });

  it("flags low confidence transactions for review", () => {
    const ai = {
      amount: 300,
      direction: "debit",
      type: "credit_card",
      merchant: "Unknown Store",
      confidence: 0.5,
    };
    const tx = toTransaction(ai, email);
    expect(tx).not.toBeNull();
    expect(tx!.needsReview).toBe(true);
    expect(tx!.confidence).toBe(0.5);
  });

  it("handles string amounts", () => {
    const ai = {
      amount: "Rs. 1,500.00",
      direction: "debit",
      type: "upi",
      merchant: "Flipkart",
      confidence: 0.85,
    };
    const tx = toTransaction(ai, email);
    expect(tx).not.toBeNull();
    expect(tx!.amount).toBe(1500);
  });

  it("returns null for zero/negative amounts", () => {
    const ai = { amount: 0, direction: "debit", type: "upi", merchant: "Test", confidence: 0.9 };
    expect(toTransaction(ai, email)).toBeNull();

    const ai2 = { amount: -100, direction: "debit", type: "upi", merchant: "Test", confidence: 0.9 };
    expect(toTransaction(ai2, email)).toBeNull();
  });

  it("defaults to debit for invalid direction", () => {
    const ai = { amount: 100, direction: "unknown", type: "upi", merchant: "Test", confidence: 0.9 };
    const tx = toTransaction(ai, email);
    expect(tx!.direction).toBe("debit");
  });

  it("defaults to bank_transfer for invalid type", () => {
    const ai = { amount: 100, direction: "debit", type: "paypal", merchant: "Test", confidence: 0.9 };
    const tx = toTransaction(ai, email);
    expect(tx!.type).toBe("bank_transfer");
  });

  it("defaults confidence to 0.5 when missing", () => {
    const ai = { amount: 100, direction: "debit", type: "upi", merchant: "Test", confidence: undefined as unknown as number };
    const tx = toTransaction(ai, email);
    expect(tx!.confidence).toBe(0.5);
    expect(tx!.needsReview).toBe(true);
  });

  it("uses AI-provided date when valid", () => {
    const ai = {
      amount: 100,
      direction: "debit",
      type: "upi",
      merchant: "Test",
      confidence: 0.9,
      date: "2025-02-20T12:00:00Z",
    };
    const tx = toTransaction(ai, email);
    expect(tx!.date.toISOString()).toBe("2025-02-20T12:00:00.000Z");
  });

  it("falls back to email date for invalid AI date", () => {
    const ai = {
      amount: 100,
      direction: "debit",
      type: "upi",
      merchant: "Test",
      confidence: 0.9,
      date: "not-a-date",
    };
    const tx = toTransaction(ai, email);
    expect(tx!.date).toBe(email.date);
  });
});

describe("createAiFallbackParser", () => {
  it("canParse always returns true", () => {
    const parser = createAiFallbackParser(() => ({ exitCode: 0, stdout: "", stderr: "" }));
    expect(parser.canParse(makeEmail())).toBe(true);
  });

  it("returns parsed transactions from mock claude CLI", () => {
    const aiOutput = JSON.stringify({
      transactions: [
        { amount: 750, direction: "debit", type: "upi", merchant: "Zomato", confidence: 0.85 },
      ],
    });
    const mockSpawn = () => ({ exitCode: 0, stdout: aiOutput, stderr: "" });
    const parser = createAiFallbackParser(mockSpawn);

    const result = parser.parse(makeEmail());
    expect(result).not.toBeNull();
    expect(result!).toHaveLength(1);
    expect(result![0].merchant).toBe("Zomato");
    expect(result![0].source).toBe("ai");
    expect(result![0].confidence).toBe(0.85);
    expect(result![0].needsReview).toBe(false);
  });

  it("returns null when claude CLI fails", () => {
    const mockSpawn = () => ({ exitCode: 1, stdout: "", stderr: "error" });
    const parser = createAiFallbackParser(mockSpawn);
    expect(parser.parse(makeEmail())).toBeNull();
  });

  it("returns null when claude CLI returns empty output", () => {
    const mockSpawn = () => ({ exitCode: 0, stdout: "", stderr: "" });
    const parser = createAiFallbackParser(mockSpawn);
    expect(parser.parse(makeEmail())).toBeNull();
  });

  it("returns null when claude returns empty transactions", () => {
    const mockSpawn = () => ({
      exitCode: 0,
      stdout: JSON.stringify({ transactions: [] }),
      stderr: "",
    });
    const parser = createAiFallbackParser(mockSpawn);
    expect(parser.parse(makeEmail())).toBeNull();
  });

  it("returns null when claude returns invalid JSON", () => {
    const mockSpawn = () => ({ exitCode: 0, stdout: "not json", stderr: "" });
    const parser = createAiFallbackParser(mockSpawn);
    expect(parser.parse(makeEmail())).toBeNull();
  });

  it("handles multiple transactions from a single email", () => {
    const aiOutput = JSON.stringify({
      transactions: [
        { amount: 500, direction: "debit", type: "upi", merchant: "Amazon", confidence: 0.9 },
        { amount: 200, direction: "debit", type: "credit_card", merchant: "Swiggy", confidence: 0.8 },
      ],
    });
    const mockSpawn = () => ({ exitCode: 0, stdout: aiOutput, stderr: "" });
    const parser = createAiFallbackParser(mockSpawn);

    const result = parser.parse(makeEmail());
    expect(result).toHaveLength(2);
    expect(result![0].merchant).toBe("Amazon");
    expect(result![1].merchant).toBe("Swiggy");
  });

  it("flags low-confidence transactions for review", () => {
    const aiOutput = JSON.stringify({
      transactions: [
        { amount: 300, direction: "debit", type: "upi", merchant: "Unknown Shop", confidence: 0.4 },
      ],
    });
    const mockSpawn = () => ({ exitCode: 0, stdout: aiOutput, stderr: "" });
    const parser = createAiFallbackParser(mockSpawn);

    const result = parser.parse(makeEmail());
    expect(result![0].needsReview).toBe(true);
    expect(result![0].confidence).toBe(0.4);
  });

  it("handles claude CLI result wrapper format", () => {
    const inner = JSON.stringify({
      transactions: [
        { amount: 1000, direction: "credit", type: "bank_transfer", merchant: "Salary", confidence: 0.95 },
      ],
    });
    const mockSpawn = () => ({
      exitCode: 0,
      stdout: JSON.stringify({ result: inner }),
      stderr: "",
    });
    const parser = createAiFallbackParser(mockSpawn);

    const result = parser.parse(makeEmail());
    expect(result).toHaveLength(1);
    expect(result![0].merchant).toBe("Salary");
    expect(result![0].direction).toBe("credit");
  });

  it("passes prompt with email content to spawn function", () => {
    let capturedArgs: string[] = [];
    const mockSpawn = (args: string[]) => {
      capturedArgs = args;
      return { exitCode: 0, stdout: JSON.stringify({ transactions: [] }), stderr: "" };
    };
    const parser = createAiFallbackParser(mockSpawn);
    parser.parse(makeEmail({ subject: "HDFC Alert" }));

    expect(capturedArgs[0]).toBe("claude");
    expect(capturedArgs[1]).toBe("-p");
    expect(capturedArgs[2]).toContain("HDFC Alert");
    expect(capturedArgs[3]).toBe("--output-format");
    expect(capturedArgs[4]).toBe("json");
  });

  it("returns null when spawn throws", () => {
    const mockSpawn = () => {
      throw new Error("spawn failed");
    };
    const parser = createAiFallbackParser(mockSpawn);
    expect(parser.parse(makeEmail())).toBeNull();
  });
});
