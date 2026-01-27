import { describe, expect, test } from "bun:test";
import { creditCardParser } from "../../src/parser/credit-card";
import type { RawEmail } from "../../src/types";

function makeEmail(overrides: Partial<RawEmail> = {}): RawEmail {
  return {
    messageId: "msg-cc-1",
    from: "alerts@hdfcbank.net",
    subject: "Credit Card Transaction Alert",
    date: new Date("2025-06-15"),
    bodyText:
      "Rs.2,500.00 spent on your HDFC Bank Credit Card ending XX1234 at Amazon India on 15/06/2025.",
    ...overrides,
  };
}

describe("Credit Card Parser - canParse", () => {
  test("matches credit card subject", () => {
    expect(creditCardParser.canParse(makeEmail())).toBe(true);
  });

  test("matches card transaction subject", () => {
    expect(
      creditCardParser.canParse(
        makeEmail({ subject: "Card Transaction Alert" }),
      ),
    ).toBe(true);
  });

  test("matches card used subject", () => {
    expect(
      creditCardParser.canParse(
        makeEmail({ subject: "Your card has been used" }),
      ),
    ).toBe(true);
  });

  test("matches card ending subject", () => {
    expect(
      creditCardParser.canParse(
        makeEmail({ subject: "Alert: Card ending 1234" }),
      ),
    ).toBe(true);
  });

  test("matches credit card in body", () => {
    expect(
      creditCardParser.canParse(
        makeEmail({
          subject: "Transaction Alert",
          bodyText: "Your credit card XX5678 was used for Rs.1000",
        }),
      ),
    ).toBe(true);
  });

  test("matches card number pattern in body", () => {
    expect(
      creditCardParser.canParse(
        makeEmail({
          subject: "Alert",
          bodyText: "Card no. XX9876 charged Rs.500",
        }),
      ),
    ).toBe(true);
  });

  test("does not match UPI email", () => {
    expect(
      creditCardParser.canParse(
        makeEmail({
          subject: "UPI Transaction Alert",
          bodyText: "Rs.500 debited via UPI. UPI Ref No: 123456789",
        }),
      ),
    ).toBe(false);
  });
});

describe("Credit Card Parser - parse", () => {
  test("parses HDFC credit card debit", () => {
    const result = creditCardParser.parse(makeEmail());
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);

    const tx = result![0];
    expect(tx.amount).toBe(2500);
    expect(tx.direction).toBe("debit");
    expect(tx.type).toBe("credit_card");
    expect(tx.bank).toBe("HDFC");
    expect(tx.account).toBe("XX1234");
    expect(tx.merchant).toBe("Amazon India");
    expect(tx.source).toBe("regex");
    expect(tx.needsReview).toBe(false);
    expect(tx.currency).toBe("INR");
    expect(tx.emailMessageId).toBe("msg-cc-1");
  });

  test("parses ICICI credit card alert", () => {
    const result = creditCardParser.parse(
      makeEmail({
        from: "alerts@icicibank.com",
        subject: "ICICI Bank Credit Card Alert",
        bodyText:
          "INR 8,999.00 charged on your ICICI Bank Credit Card no. XX5678 at Flipkart on 20/06/2025.",
      }),
    );
    expect(result).not.toBeNull();
    const tx = result![0];
    expect(tx.amount).toBe(8999);
    expect(tx.bank).toBe("ICICI");
    expect(tx.account).toBe("XX5678");
    expect(tx.merchant).toBe("Flipkart");
  });

  test("parses SBI card transaction", () => {
    const result = creditCardParser.parse(
      makeEmail({
        from: "alerts@sbi.co.in",
        subject: "SBI Card Transaction",
        bodyText:
          "Rs.3,200.00 spent on your SBI Credit Card ending 9012 at BigBasket on 01/07/2025.",
      }),
    );
    expect(result).not.toBeNull();
    const tx = result![0];
    expect(tx.amount).toBe(3200);
    expect(tx.bank).toBe("SBI");
    expect(tx.account).toBe("XX9012");
    expect(tx.merchant).toBe("BigBasket");
  });

  test("parses Axis Bank credit card alert", () => {
    const result = creditCardParser.parse(
      makeEmail({
        from: "alerts@axisbank.com",
        subject: "Card Transaction Alert",
        bodyText:
          "Rs.1,499.00 debited from your Axis Bank Credit Card XX4567 at Myntra on 10/07/2025.",
      }),
    );
    expect(result).not.toBeNull();
    const tx = result![0];
    expect(tx.amount).toBe(1499);
    expect(tx.bank).toBe("Axis");
    expect(tx.account).toBe("XX4567");
  });

  test("parses Amex card transaction", () => {
    const result = creditCardParser.parse(
      makeEmail({
        from: "alerts@americanexpress.com",
        subject: "American Express Card Used",
        bodyText:
          "Rs.15,000.00 charged on your American Express Card ending 3456 at MakeMyTrip on 05/07/2025.",
      }),
    );
    expect(result).not.toBeNull();
    const tx = result![0];
    expect(tx.amount).toBe(15000);
    expect(tx.bank).toBe("Amex");
    expect(tx.account).toBe("XX3456");
  });

  test("parses credit/refund transaction", () => {
    const result = creditCardParser.parse(
      makeEmail({
        bodyText:
          "Rs.500.00 refund credited to your HDFC Bank Credit Card XX1234 on 18/06/2025.",
      }),
    );
    expect(result).not.toBeNull();
    const tx = result![0];
    expect(tx.amount).toBe(500);
    expect(tx.direction).toBe("credit");
  });

  test("returns null when no amount found", () => {
    const result = creditCardParser.parse(
      makeEmail({
        bodyText: "Your credit card statement is ready for viewing.",
      }),
    );
    expect(result).toBeNull();
  });

  test("handles Indian number format", () => {
    const result = creditCardParser.parse(
      makeEmail({
        bodyText:
          "Rs.1,25,000.00 spent on your HDFC Credit Card XX1234 at Tanishq on 12/07/2025.",
      }),
    );
    expect(result).not.toBeNull();
    expect(result![0].amount).toBe(125000);
  });

  test("generates unique transaction IDs", () => {
    const r1 = creditCardParser.parse(makeEmail());
    const r2 = creditCardParser.parse(makeEmail());
    expect(r1![0].id).not.toBe(r2![0].id);
  });

  test("uses email date as fallback", () => {
    const result = creditCardParser.parse(
      makeEmail({
        date: new Date("2025-03-01"),
        bodyText:
          "Rs.750 spent on your HDFC Credit Card XX1234 at Swiggy.",
      }),
    );
    expect(result).not.toBeNull();
    expect(result![0].date).toEqual(new Date("2025-03-01"));
  });

  test("sets source to regex", () => {
    const result = creditCardParser.parse(makeEmail());
    expect(result![0].source).toBe("regex");
  });
});
