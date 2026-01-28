import { describe, it, expect, beforeEach } from "bun:test";
import { getDb, _resetDb, runMigrations } from "../../src/db";
import {
  insertCategoryCorrection,
  getCorrection,
  getCorrectionsByMerchant,
  getRecentCorrections,
} from "../../src/db";

beforeEach(() => {
  process.env.EXPENSE_TRACKER_DB = ":memory:";
  _resetDb();
  runMigrations();
});

describe("insertCategoryCorrection", () => {
  it("inserts and returns a correction", () => {
    const c = insertCategoryCorrection("Swiggy", "Other", "Food");
    expect(c.id).toBeGreaterThan(0);
    expect(c.merchant).toBe("Swiggy");
    expect(c.originalCategory).toBe("Other");
    expect(c.correctedCategory).toBe("Food");
    expect(c.description).toBeUndefined();
    expect(c.createdAt).toBeInstanceOf(Date);
  });

  it("stores optional description", () => {
    const c = insertCategoryCorrection("Uber", "Other", "Transport", "Uber ride");
    expect(c.description).toBe("Uber ride");
  });
});

describe("getCorrection", () => {
  it("returns null for non-existent ID", () => {
    expect(getCorrection(999)).toBeNull();
  });

  it("returns correction by ID", () => {
    const c = insertCategoryCorrection("Zomato", "Other", "Food");
    const fetched = getCorrection(c.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.merchant).toBe("Zomato");
  });
});

describe("getCorrectionsByMerchant", () => {
  it("returns corrections for a specific merchant", () => {
    insertCategoryCorrection("Swiggy", "Other", "Food");
    insertCategoryCorrection("Swiggy", "Food", "Bills");
    insertCategoryCorrection("Uber", "Other", "Transport");

    const results = getCorrectionsByMerchant("Swiggy");
    expect(results).toHaveLength(2);
    expect(results.every((c) => c.merchant === "Swiggy")).toBe(true);
  });

  it("returns most recent first", () => {
    insertCategoryCorrection("Swiggy", "Other", "Food");
    insertCategoryCorrection("Swiggy", "Food", "Bills");

    const results = getCorrectionsByMerchant("Swiggy");
    expect(results[0].correctedCategory).toBe("Bills");
  });

  it("respects limit", () => {
    insertCategoryCorrection("Swiggy", "Other", "Food");
    insertCategoryCorrection("Swiggy", "Food", "Bills");
    insertCategoryCorrection("Swiggy", "Bills", "Other");

    const results = getCorrectionsByMerchant("Swiggy", 2);
    expect(results).toHaveLength(2);
  });

  it("returns empty array for unknown merchant", () => {
    expect(getCorrectionsByMerchant("Unknown")).toEqual([]);
  });
});

describe("getRecentCorrections", () => {
  it("returns all recent corrections across merchants", () => {
    const baseline = getRecentCorrections().length;
    insertCategoryCorrection("Swiggy", "Other", "Food");
    insertCategoryCorrection("Uber", "Other", "Transport");
    insertCategoryCorrection("Netflix", "Other", "Entertainment");

    const results = getRecentCorrections();
    expect(results).toHaveLength(baseline + 3);
  });

  it("respects limit", () => {
    insertCategoryCorrection("Swiggy", "Other", "Food");
    insertCategoryCorrection("Uber", "Other", "Transport");
    insertCategoryCorrection("Netflix", "Other", "Entertainment");

    const results = getRecentCorrections(2);
    expect(results).toHaveLength(2);
  });
});
