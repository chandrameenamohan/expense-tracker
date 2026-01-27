import { describe, test, expect } from "bun:test";
import { bankTransferParser } from "../../src/parser/bank-transfer";
import type { RawEmail } from "../../src/types";

function makeEmail(overrides: Partial<RawEmail> = {}): RawEmail {
  return {
    messageId: "test-msg-001",
    from: "alerts@hdfcbank.net",
    subject: "NEFT Transaction Alert",
    date: new Date("2025-01-15"),
    bodyText: "",
    ...overrides,
  };
}

describe("bankTransferParser", () => {
  describe("canParse", () => {
    test("detects NEFT in subject", () => {
      expect(bankTransferParser.canParse(makeEmail({ subject: "NEFT credit to your account" }))).toBe(true);
    });

    test("detects RTGS in subject", () => {
      expect(bankTransferParser.canParse(makeEmail({ subject: "RTGS Transaction Alert" }))).toBe(true);
    });

    test("detects IMPS in subject", () => {
      expect(bankTransferParser.canParse(makeEmail({ subject: "IMPS debit from your account" }))).toBe(true);
    });

    test("detects fund transfer in subject", () => {
      expect(bankTransferParser.canParse(makeEmail({ subject: "Fund Transfer Successful" }))).toBe(true);
    });

    test("detects salary credit in subject", () => {
      expect(bankTransferParser.canParse(makeEmail({ subject: "Salary Credit Notification" }))).toBe(true);
    });

    test("detects account credited in subject", () => {
      expect(bankTransferParser.canParse(makeEmail({ subject: "Your a/c credited with Rs.50,000" }))).toBe(true);
    });

    test("detects NEFT in body", () => {
      expect(bankTransferParser.canParse(makeEmail({
        subject: "Transaction Alert",
        bodyText: "Your account has been credited via NEFT ref HDFC12345",
      }))).toBe(true);
    });

    test("does not match unrelated emails", () => {
      expect(bankTransferParser.canParse(makeEmail({
        subject: "Your order has been shipped",
        bodyText: "Track your package",
      }))).toBe(false);
    });
  });

  describe("parse", () => {
    test("parses NEFT credit", () => {
      const result = bankTransferParser.parse(makeEmail({
        subject: "NEFT Credit Alert",
        bodyText: "Rs. 25,000.00 credited to your a/c XX1234 via NEFT ref HDFC0012345 from Acme Corp on 15-01-2025",
      }));

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      const tx = result![0];
      expect(tx.amount).toBe(25000);
      expect(tx.direction).toBe("credit");
      expect(tx.type).toBe("bank_transfer");
      expect(tx.account).toBe("XX1234");
      expect(tx.reference).toBe("HDFC0012345");
      expect(tx.bank).toBe("HDFC");
    });

    test("parses RTGS debit", () => {
      const result = bankTransferParser.parse(makeEmail({
        from: "alerts@icicibank.com",
        subject: "RTGS Transaction Alert",
        bodyText: "INR 1,50,000 debited from a/c XX5678 via RTGS ref ICIC0098765 on 10/01/2025",
      }));

      expect(result).not.toBeNull();
      const tx = result![0];
      expect(tx.amount).toBe(150000);
      expect(tx.direction).toBe("debit");
      expect(tx.type).toBe("bank_transfer");
      expect(tx.reference).toBe("ICIC0098765");
      expect(tx.bank).toBe("ICICI");
    });

    test("parses IMPS transfer", () => {
      const result = bankTransferParser.parse(makeEmail({
        from: "alerts@sbi.co.in",
        subject: "IMPS Debit Alert",
        bodyText: "₹5,000 has been debited from your account XX9876 via IMPS txn SBIN0054321",
      }));

      expect(result).not.toBeNull();
      const tx = result![0];
      expect(tx.amount).toBe(5000);
      expect(tx.direction).toBe("debit");
      expect(tx.reference).toBe("SBIN0054321");
      expect(tx.bank).toBe("SBI");
    });

    test("parses salary credit", () => {
      const result = bankTransferParser.parse(makeEmail({
        subject: "Salary Credit Notification",
        bodyText: "Your salary of Rs. 85,000.00 has been credited to your a/c XX1234 on 01-01-2025",
      }));

      expect(result).not.toBeNull();
      const tx = result![0];
      expect(tx.amount).toBe(85000);
      expect(tx.direction).toBe("credit");
      expect(tx.merchant).toBe("Salary");
      expect(tx.type).toBe("bank_transfer");
    });

    test("parses fund transfer with sender", () => {
      const result = bankTransferParser.parse(makeEmail({
        subject: "Fund Transfer Alert",
        bodyText: "Rs. 10,000 credited to a/c XX4321 from John Doe via NEFT ref NEFT12345",
      }));

      expect(result).not.toBeNull();
      const tx = result![0];
      expect(tx.amount).toBe(10000);
      expect(tx.direction).toBe("credit");
      expect(tx.merchant).toBe("John Doe");
    });

    test("returns null when no amount found", () => {
      const result = bankTransferParser.parse(makeEmail({
        subject: "NEFT Alert",
        bodyText: "Your NEFT transaction has been processed",
      }));
      expect(result).toBeNull();
    });

    test("detects Axis bank", () => {
      const result = bankTransferParser.parse(makeEmail({
        from: "alerts@axisbank.com",
        subject: "NEFT Credit",
        bodyText: "Rs. 5,000 credited to a/c XX1111",
      }));

      expect(result).not.toBeNull();
      expect(result![0].bank).toBe("Axis");
    });

    test("detects Kotak bank", () => {
      const result = bankTransferParser.parse(makeEmail({
        from: "alerts@kotak.com",
        subject: "IMPS Alert",
        bodyText: "Rs. 3,000 debited from a/c XX2222",
      }));

      expect(result).not.toBeNull();
      expect(result![0].bank).toBe("Kotak");
    });

    test("handles account debited subject", () => {
      const result = bankTransferParser.parse(makeEmail({
        subject: "Your account debited with Rs.15,000",
        bodyText: "A/c XX3333 debited Rs. 15,000 via NEFT ref TEST123",
      }));

      expect(result).not.toBeNull();
      const tx = result![0];
      expect(tx.amount).toBe(15000);
      expect(tx.direction).toBe("debit");
    });

    test("sets source to regex", () => {
      const result = bankTransferParser.parse(makeEmail({
        subject: "NEFT Credit",
        bodyText: "Rs. 1,000 credited to a/c XX1234",
      }));

      expect(result).not.toBeNull();
      expect(result![0].source).toBe("regex");
    });

    test("sets needsReview to false", () => {
      const result = bankTransferParser.parse(makeEmail({
        subject: "NEFT Credit",
        bodyText: "Rs. 1,000 credited to a/c XX1234",
      }));

      expect(result).not.toBeNull();
      expect(result![0].needsReview).toBe(false);
    });
  });
});
