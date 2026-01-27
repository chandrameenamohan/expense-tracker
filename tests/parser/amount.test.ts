import { describe, expect, test } from "bun:test";
import { normalizeAmount, extractAmount } from "../../src/parser/amount";

describe("normalizeAmount", () => {
  test("strips Rs. prefix", () => {
    expect(normalizeAmount("Rs. 500")).toBe(500);
    expect(normalizeAmount("Rs.500")).toBe(500);
    expect(normalizeAmount("Rs 500")).toBe(500);
  });

  test("strips INR prefix", () => {
    expect(normalizeAmount("INR 1000")).toBe(1000);
    expect(normalizeAmount("INR1000")).toBe(1000);
    expect(normalizeAmount("inr 500")).toBe(500);
  });

  test("strips ₹ prefix", () => {
    expect(normalizeAmount("₹500")).toBe(500);
    expect(normalizeAmount("₹ 500")).toBe(500);
  });

  test("strips currency suffix", () => {
    expect(normalizeAmount("500 INR")).toBe(500);
    expect(normalizeAmount("500 Rs.")).toBe(500);
  });

  test("removes commas (Indian format)", () => {
    expect(normalizeAmount("1,50,000.00")).toBe(150000.0);
    expect(normalizeAmount("Rs. 1,50,000.00")).toBe(150000.0);
    expect(normalizeAmount("₹10,00,000")).toBe(1000000);
  });

  test("removes commas (Western format)", () => {
    expect(normalizeAmount("1,000.50")).toBe(1000.5);
  });

  test("handles decimals", () => {
    expect(normalizeAmount("Rs. 499.99")).toBe(499.99);
    expect(normalizeAmount("250.5")).toBe(250.5);
  });

  test("always returns positive", () => {
    expect(normalizeAmount("-500")).toBe(500);
    expect(normalizeAmount("Rs. -1000")).toBe(1000);
  });

  test("plain number string", () => {
    expect(normalizeAmount("500")).toBe(500);
    expect(normalizeAmount("1234.56")).toBe(1234.56);
  });

  test("returns null for invalid input", () => {
    expect(normalizeAmount("")).toBeNull();
    expect(normalizeAmount("abc")).toBeNull();
    expect(normalizeAmount("Rs.")).toBeNull();
    // @ts-expect-error testing invalid input
    expect(normalizeAmount(null)).toBeNull();
    // @ts-expect-error testing invalid input
    expect(normalizeAmount(undefined)).toBeNull();
  });
});

describe("extractAmount", () => {
  test("extracts amount with Rs. prefix", () => {
    expect(extractAmount("You spent Rs. 1,234.56 at Amazon")).toBe(1234.56);
  });

  test("extracts amount with ₹ prefix", () => {
    expect(extractAmount("Debited ₹500 from your account")).toBe(500);
  });

  test("extracts amount with INR prefix", () => {
    expect(extractAmount("Transaction of INR 2,500.00 approved")).toBe(2500.0);
  });

  test("extracts Indian format amounts", () => {
    expect(extractAmount("Amount: Rs. 1,50,000.00 debited")).toBe(150000.0);
  });

  test("returns null when no amount found", () => {
    expect(extractAmount("No amount here")).toBeNull();
    expect(extractAmount("")).toBeNull();
  });
});
