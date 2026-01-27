import { describe, it, expect } from "bun:test";
import { sipParser } from "../../src/parser/sip";
import type { RawEmail } from "../../src/types";

function makeEmail(overrides: Partial<RawEmail> = {}): RawEmail {
  return {
    messageId: "test-sip-001",
    from: "alerts@hdfcbank.com",
    subject: "SIP Debit Confirmation",
    date: new Date("2025-01-15"),
    bodyText: "",
    ...overrides,
  };
}

describe("sipParser", () => {
  describe("canParse", () => {
    it("detects SIP in subject", () => {
      expect(sipParser.canParse(makeEmail({ subject: "SIP Debit Alert" }))).toBe(true);
    });

    it("detects mutual fund in subject", () => {
      expect(sipParser.canParse(makeEmail({ subject: "Mutual Fund Purchase Confirmation" }))).toBe(true);
    });

    it("detects systematic investment in subject", () => {
      expect(sipParser.canParse(makeEmail({ subject: "Systematic Investment Plan processed" }))).toBe(true);
    });

    it("detects NAV applied in subject", () => {
      expect(sipParser.canParse(makeEmail({ subject: "NAV Applied for your purchase" }))).toBe(true);
    });

    it("detects units allotted in subject", () => {
      expect(sipParser.canParse(makeEmail({ subject: "Units Allotted for your SIP" }))).toBe(true);
    });

    it("detects SIP in body", () => {
      expect(sipParser.canParse(makeEmail({ subject: "Transaction Alert", bodyText: "Your SIP of Rs.5000 has been debited" }))).toBe(true);
    });

    it("detects folio number in body", () => {
      expect(sipParser.canParse(makeEmail({ subject: "Transaction", bodyText: "Folio No: 12345678 Amount Rs.5000" }))).toBe(true);
    });

    it("rejects unrelated email", () => {
      expect(sipParser.canParse(makeEmail({ subject: "Your order has shipped", bodyText: "Your Amazon order is on its way" }))).toBe(false);
    });
  });

  describe("parse", () => {
    it("parses basic SIP debit notification", () => {
      const email = makeEmail({
        subject: "SIP Debit Confirmation",
        bodyText: "Your SIP of Rs.5,000.00 in scheme name HDFC Mid Cap Opportunities Fund has been debited from a/c xx1234. Folio No: 12345678",
      });
      const result = sipParser.parse(email);
      expect(result).toHaveLength(1);
      const tx = result![0];
      expect(tx.amount).toBe(5000);
      expect(tx.direction).toBe("debit");
      expect(tx.type).toBe("sip");
      expect(tx.merchant).toBe("HDFC Mid Cap Opportunities Fund");
      expect(tx.account).toBe("xx1234");
      expect(tx.reference).toBe("12345678");
      expect(tx.bank).toBe("HDFC");
      expect(tx.source).toBe("regex");
    });

    it("parses ICICI SIP email", () => {
      const email = makeEmail({
        from: "alerts@icicibank.com",
        subject: "Mutual Fund SIP Debit",
        bodyText: "Rs.10,000 debited from your ICICI Bank account xx5678 for SIP investment in ICICI Prudential Bluechip Fund. Folio No: 98765432",
      });
      const result = sipParser.parse(email);
      expect(result).toHaveLength(1);
      expect(result![0].amount).toBe(10000);
      expect(result![0].bank).toBe("ICICI");
      expect(result![0].reference).toBe("98765432");
    });

    it("parses SBI mutual fund confirmation", () => {
      const email = makeEmail({
        from: "donotreply@sbimf.com",
        subject: "Purchase Confirmation - SBI Small Cap Fund",
        bodyText: "Your purchase of INR 2,500 in scheme name SBI Small Cap Fund Direct Growth has been confirmed. Folio No: 55667788. NAV applied: Rs.125.45 on 15-Jan-2025.",
        date: new Date("2025-01-15"),
      });
      const result = sipParser.parse(email);
      expect(result).toHaveLength(1);
      expect(result![0].amount).toBe(2500);
      expect(result![0].merchant).toBe("SBI Small Cap Fund");
      expect(result![0].reference).toBe("55667788");
      expect(result![0].bank).toBe("SBI");
    });

    it("parses Axis mutual fund SIP", () => {
      const email = makeEmail({
        from: "alerts@axisbank.com",
        subject: "SIP Installment Debited",
        bodyText: "SIP installment of ₹3,000 debited from Axis Bank a/c xxx789 for scheme name Axis Long Term Equity Fund. Folio No: 11223344",
      });
      const result = sipParser.parse(email);
      expect(result).toHaveLength(1);
      expect(result![0].amount).toBe(3000);
      expect(result![0].bank).toBe("Axis");
      expect(result![0].account).toBe("xxx789");
    });

    it("parses Kotak SIP email", () => {
      const email = makeEmail({
        from: "alerts@kotak.com",
        subject: "Systematic Investment Plan Processed",
        bodyText: "Your Systematic Investment Plan of Rs 7,500 in Kotak Flexi Cap Fund has been processed. Folio number: 44556677. Account xx4321.",
      });
      const result = sipParser.parse(email);
      expect(result).toHaveLength(1);
      expect(result![0].amount).toBe(7500);
      expect(result![0].bank).toBe("Kotak");
      expect(result![0].reference).toBe("44556677");
    });

    it("parses CAMS confirmation", () => {
      const email = makeEmail({
        from: "donotreply@camsonline.com",
        subject: "Units Allotted - CAMS",
        bodyText: "Units allotted for your SIP purchase of Rs.15,000 in scheme name Parag Parikh Flexi Cap Fund Direct Growth. Folio No: 99887766. NAV applied Rs.55.23 on 10/01/2025.",
      });
      const result = sipParser.parse(email);
      expect(result).toHaveLength(1);
      expect(result![0].amount).toBe(15000);
      expect(result![0].bank).toBe("CAMS");
      expect(result![0].reference).toBe("99887766");
    });

    it("parses KFintech confirmation", () => {
      const email = makeEmail({
        from: "donotreply@kfintech.com",
        subject: "Mutual Fund Purchase Confirmation",
        bodyText: "Your mutual fund purchase of Rs.1,000 in scheme name Nippon India Growth Fund. Folio No: 33445566. KFintech transaction reference.",
      });
      const result = sipParser.parse(email);
      expect(result).toHaveLength(1);
      expect(result![0].amount).toBe(1000);
      expect(result![0].bank).toBe("KFintech");
    });

    it("parses Zerodha/Coin SIP", () => {
      const email = makeEmail({
        from: "no-reply@zerodha.com",
        subject: "SIP Order Executed",
        bodyText: "Your SIP investment of Rs.5,000 in scheme name Mirae Asset Large Cap Fund via Zerodha Coin. Folio No: 77889900. A/c xx9876.",
      });
      const result = sipParser.parse(email);
      expect(result).toHaveLength(1);
      expect(result![0].amount).toBe(5000);
      expect(result![0].bank).toBe("Zerodha");
    });

    it("returns null for email with no amount", () => {
      const email = makeEmail({
        subject: "SIP Registration Confirmed",
        bodyText: "Your SIP has been registered for HDFC Mid Cap Fund. Folio No: 12345678",
      });
      expect(sipParser.parse(email)).toBeNull();
    });

    it("always sets direction to debit", () => {
      const email = makeEmail({
        subject: "SIP Debit",
        bodyText: "Rs.5,000 debited for SIP in scheme name Test Fund. Folio No: 11111111",
      });
      const result = sipParser.parse(email);
      expect(result![0].direction).toBe("debit");
    });

    it("sets type to sip", () => {
      const email = makeEmail({
        subject: "Mutual Fund SIP",
        bodyText: "Rs.2,000 for SIP in scheme name Some Fund. Folio No: 22222222",
      });
      const result = sipParser.parse(email);
      expect(result![0].type).toBe("sip");
    });

    it("parses date from body", () => {
      const email = makeEmail({
        subject: "SIP Confirmation",
        bodyText: "Rs.5,000 for SIP in scheme name Test Fund on 20 Jan 2025. Folio No: 33333333",
        date: new Date("2025-01-15"),
      });
      const result = sipParser.parse(email);
      expect(result![0].date.getFullYear()).toBe(2025);
    });

    it("uses email date as fallback", () => {
      const email = makeEmail({
        subject: "SIP Debit",
        bodyText: "Rs.5,000 for SIP in scheme name Test Fund. Folio No: 44444444",
        date: new Date("2025-02-01"),
      });
      const result = sipParser.parse(email);
      expect(result![0].date).toEqual(new Date("2025-02-01"));
    });

    it("parses Groww SIP", () => {
      const email = makeEmail({
        from: "no-reply@groww.in",
        subject: "SIP Executed Successfully",
        bodyText: "Your SIP of Rs.500 in scheme name Quant Active Fund via Groww has been executed. Folio No: 66778899.",
      });
      const result = sipParser.parse(email);
      expect(result).toHaveLength(1);
      expect(result![0].amount).toBe(500);
      expect(result![0].bank).toBe("Groww");
    });

    it("detects BSE order in body", () => {
      expect(sipParser.canParse(makeEmail({
        subject: "Order Confirmation",
        bodyText: "BSE order placed for mutual fund purchase of Rs.5000",
      }))).toBe(true);
    });
  });
});
