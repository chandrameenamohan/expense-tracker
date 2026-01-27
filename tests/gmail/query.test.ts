import { describe, expect, test } from "bun:test";
import { buildQuery } from "../../src/gmail/query";

describe("buildQuery", () => {
  test("includes sender filter with all known banks", () => {
    const query = buildQuery();
    expect(query).toContain("from:(");
    expect(query).toContain("alerts@hdfcbank.net");
    expect(query).toContain("alerts@icicibank.com");
    expect(query).toContain("alerts@axisbank.com");
    expect(query).toContain("alerts@sbicard.com");
  });

  test("includes subject keywords", () => {
    const query = buildQuery();
    expect(query).toContain("subject:(");
    expect(query).toContain("transaction");
    expect(query).toContain("debit");
    expect(query).toContain("credit");
    expect(query).toContain("payment");
    expect(query).toContain("UPI");
    expect(query).toContain("EMI");
    expect(query).toContain("SIP");
  });

  test("does not include after clause when no date provided", () => {
    const query = buildQuery();
    expect(query).not.toContain("after:");
  });

  test("includes after clause with correct date format", () => {
    const date = new Date("2024-03-15T00:00:00Z");
    const query = buildQuery(date);
    expect(query).toContain("after:2024/03/15");
  });

  test("pads single-digit month and day", () => {
    const date = new Date("2024-01-05T00:00:00Z");
    const query = buildQuery(date);
    expect(query).toContain("after:2024/01/05");
  });
});
