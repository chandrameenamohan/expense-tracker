import { describe, expect, test } from "bun:test";
import { ParserRegistry } from "../../src/parser/registry";
import type { Parser, RawEmail, Transaction } from "../../src/types";

function makeEmail(overrides: Partial<RawEmail> = {}): RawEmail {
  return {
    messageId: "msg-1",
    from: "bank@example.com",
    subject: "Transaction Alert",
    date: new Date("2025-01-15"),
    bodyText: "You spent Rs.500 at Shop",
    ...overrides,
  };
}

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    emailMessageId: "msg-1",
    date: new Date("2025-01-15"),
    amount: 500,
    currency: "INR",
    direction: "debit",
    type: "upi",
    merchant: "Shop",
    account: "XXXX1234",
    bank: "HDFC",
    source: "regex",
    needsReview: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeParser(
  canParseFn: (e: RawEmail) => boolean,
  parseFn: (e: RawEmail) => Transaction[] | null,
): Parser {
  return { canParse: canParseFn, parse: parseFn };
}

describe("ParserRegistry", () => {
  test("returns empty array when no parsers registered", () => {
    const registry = new ParserRegistry();
    expect(registry.parse(makeEmail())).toEqual([]);
  });

  test("uses first matching parser", () => {
    const registry = new ParserRegistry();
    const tx = makeTx();
    registry.register(makeParser(() => true, () => [tx]));
    registry.register(makeParser(() => true, () => [makeTx({ id: "tx-2" })]));

    const result = registry.parse(makeEmail());
    expect(result).toEqual([tx]);
  });

  test("skips parser that does not match canParse", () => {
    const registry = new ParserRegistry();
    const tx = makeTx({ id: "tx-2" });
    registry.register(makeParser(() => false, () => [makeTx()]));
    registry.register(makeParser(() => true, () => [tx]));

    const result = registry.parse(makeEmail());
    expect(result).toEqual([tx]);
  });

  test("falls through to next parser when parse returns null", () => {
    const registry = new ParserRegistry();
    const tx = makeTx({ id: "tx-2" });
    registry.register(makeParser(() => true, () => null));
    registry.register(makeParser(() => true, () => [tx]));

    const result = registry.parse(makeEmail());
    expect(result).toEqual([tx]);
  });

  test("falls through to next parser when parse returns empty array", () => {
    const registry = new ParserRegistry();
    const tx = makeTx({ id: "tx-2" });
    registry.register(makeParser(() => true, () => []));
    registry.register(makeParser(() => true, () => [tx]));

    const result = registry.parse(makeEmail());
    expect(result).toEqual([tx]);
  });

  test("falls through to fallback when no regex parser matches", () => {
    const registry = new ParserRegistry();
    const tx = makeTx({ source: "ai" });
    registry.register(makeParser(() => false, () => null));
    registry.setFallback(makeParser(() => true, () => [tx]));

    const result = registry.parse(makeEmail());
    expect(result).toEqual([tx]);
  });

  test("falls through to fallback when regex parser canParse but parse fails", () => {
    const registry = new ParserRegistry();
    const tx = makeTx({ source: "ai" });
    registry.register(makeParser(() => true, () => null));
    registry.setFallback(makeParser(() => true, () => [tx]));

    const result = registry.parse(makeEmail());
    expect(result).toEqual([tx]);
  });

  test("returns empty array when fallback also fails", () => {
    const registry = new ParserRegistry();
    registry.register(makeParser(() => false, () => null));
    registry.setFallback(makeParser(() => true, () => null));

    expect(registry.parse(makeEmail())).toEqual([]);
  });

  test("supports multi-transaction emails", () => {
    const registry = new ParserRegistry();
    const txs = [makeTx({ id: "tx-1" }), makeTx({ id: "tx-2" })];
    registry.register(makeParser(() => true, () => txs));

    const result = registry.parse(makeEmail());
    expect(result).toHaveLength(2);
  });
});
