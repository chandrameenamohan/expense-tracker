import { describe, expect, test } from "bun:test";
import { loanParser } from "../../src/parser/loan";
import type { RawEmail } from "../../src/types";

function makeEmail(overrides: Partial<RawEmail> = {}): RawEmail {
  return {
    messageId: "msg-loan-1",
    from: "alerts@hdfcbank.net",
    subject: "EMI debit notification",
    date: new Date("2024-06-15"),
    bodyText: "",
    ...overrides,
  };
}

describe("loanParser.canParse", () => {
  test("detects EMI in subject", () => {
    expect(loanParser.canParse(makeEmail({ subject: "EMI debit from your account" }))).toBe(true);
  });

  test("detects loan repayment in subject", () => {
    expect(loanParser.canParse(makeEmail({ subject: "Loan repayment confirmation" }))).toBe(true);
  });

  test("detects home loan in subject", () => {
    expect(loanParser.canParse(makeEmail({ subject: "Home Loan EMI debited" }))).toBe(true);
  });

  test("detects personal loan in subject", () => {
    expect(loanParser.canParse(makeEmail({ subject: "Personal Loan instalment debited" }))).toBe(true);
  });

  test("detects EMI in body", () => {
    expect(loanParser.canParse(makeEmail({ subject: "Alert", bodyText: "Your EMI of Rs.15,000 has been debited" }))).toBe(true);
  });

  test("detects loan account in body", () => {
    expect(loanParser.canParse(makeEmail({ subject: "Alert", bodyText: "Loan account 12345678 debited" }))).toBe(true);
  });

  test("rejects unrelated email", () => {
    expect(loanParser.canParse(makeEmail({ subject: "Your order has shipped", bodyText: "Track your package" }))).toBe(false);
  });
});

describe("loanParser.parse", () => {
  test("parses HDFC EMI notification", () => {
    const email = makeEmail({
      from: "alerts@hdfcbank.net",
      subject: "EMI debit notification",
      bodyText: "Your EMI of Rs.25,450.00 has been debited from A/C XX1234 on 15-06-2024. Loan A/C: HDFC12345678. EMI No. 24 of 120.",
    });
    const result = loanParser.parse(email);
    expect(result).toHaveLength(1);
    const tx = result![0];
    expect(tx.amount).toBe(25450);
    expect(tx.direction).toBe("debit");
    expect(tx.type).toBe("loan");
    expect(tx.account).toBe("XX1234");
    expect(tx.bank).toBe("HDFC");
    expect(tx.reference).toBe("HDFC12345678");
    expect(tx.source).toBe("regex");
  });

  test("parses ICICI home loan EMI", () => {
    const email = makeEmail({
      from: "alerts@icicibank.com",
      subject: "Home Loan EMI debited",
      bodyText: "Dear Customer, Rs.35,000 debited towards Home Loan EMI. Loan Account No.: ICHL987654. Account XX5678.",
    });
    const result = loanParser.parse(email);
    expect(result).toHaveLength(1);
    const tx = result![0];
    expect(tx.amount).toBe(35000);
    expect(tx.merchant).toBe("Home Loan");
    expect(tx.bank).toBe("ICICI");
    expect(tx.reference).toBe("ICHL987654");
  });

  test("parses SBI personal loan", () => {
    const email = makeEmail({
      from: "alerts@sbi.co.in",
      subject: "Personal Loan instalment debited",
      bodyText: "INR 12,500.50 debited for Personal Loan instalment from account XX9876 on 01 Jun 2024.",
    });
    const result = loanParser.parse(email);
    expect(result).toHaveLength(1);
    const tx = result![0];
    expect(tx.amount).toBe(12500.5);
    expect(tx.merchant).toBe("Personal Loan");
    expect(tx.bank).toBe("SBI");
  });

  test("parses car loan EMI", () => {
    const email = makeEmail({
      from: "alerts@axisbank.com",
      subject: "Car Loan EMI debited",
      bodyText: "Rs.18,200 debited for Car Loan EMI from A/C XX4321.",
    });
    const result = loanParser.parse(email);
    expect(result).toHaveLength(1);
    expect(result![0].merchant).toBe("Car Loan");
    expect(result![0].bank).toBe("Axis");
  });

  test("parses education loan", () => {
    const email = makeEmail({
      from: "alerts@kotak.com",
      subject: "Education Loan payment confirmation",
      bodyText: "₹8,500 debited towards Education Loan repayment. Loan No. KTK123456.",
    });
    const result = loanParser.parse(email);
    expect(result).toHaveLength(1);
    expect(result![0].merchant).toBe("Education Loan");
    expect(result![0].bank).toBe("Kotak");
  });

  test("parses Bajaj Finance EMI", () => {
    const email = makeEmail({
      from: "noreply@bajajfinserv.in",
      subject: "EMI debit confirmation",
      bodyText: "Your EMI of Rs.5,999 has been debited from your account XX7890. Loan account: BAF001234.",
    });
    const result = loanParser.parse(email);
    expect(result).toHaveLength(1);
    expect(result![0].bank).toBe("Bajaj Finance");
    expect(result![0].reference).toBe("BAF001234");
  });

  test("extracts EMI number as reference when no loan account", () => {
    const email = makeEmail({
      bodyText: "Rs.10,000 EMI debited. EMI No. 5 of 24. Account XX1111.",
    });
    const result = loanParser.parse(email);
    expect(result).toHaveLength(1);
    expect(result![0].reference).toBe("5 of 24");
  });

  test("returns null for no amount", () => {
    const email = makeEmail({
      subject: "EMI reminder",
      bodyText: "Your EMI is due tomorrow. Please ensure sufficient balance.",
    });
    expect(loanParser.parse(email)).toBeNull();
  });

  test("defaults merchant to Loan EMI for generic EMI", () => {
    const email = makeEmail({
      bodyText: "Rs.15,000 EMI debited from A/C XX2222.",
    });
    const result = loanParser.parse(email);
    expect(result).toHaveLength(1);
    expect(result![0].merchant).toBe("Loan EMI");
  });

  test("always sets direction to debit", () => {
    const email = makeEmail({
      bodyText: "Rs.20,000 EMI debited from A/C XX3333.",
    });
    const result = loanParser.parse(email);
    expect(result![0].direction).toBe("debit");
  });

  test("sets type to loan", () => {
    const email = makeEmail({
      bodyText: "Rs.20,000 EMI debited from A/C XX3333.",
    });
    const result = loanParser.parse(email);
    expect(result![0].type).toBe("loan");
  });

  test("extracts date from body text", () => {
    const email = makeEmail({
      bodyText: "Rs.10,000 EMI debited on 25-12-2024 from A/C XX4444.",
    });
    const result = loanParser.parse(email);
    expect(result).toHaveLength(1);
    // parsed date from body
    expect(result![0].date.getFullYear()).toBe(2024);
  });

  test("falls back to email date if no date in body", () => {
    const email = makeEmail({
      date: new Date("2024-03-01"),
      bodyText: "Rs.10,000 EMI debited from A/C XX5555.",
    });
    const result = loanParser.parse(email);
    expect(result![0].date).toEqual(new Date("2024-03-01"));
  });
});
