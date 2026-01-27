import { describe, expect, test } from "bun:test";
import { upiParser } from "../../src/parser/upi";
import type { RawEmail } from "../../src/types";

function makeEmail(overrides: Partial<RawEmail> = {}): RawEmail {
  return {
    messageId: "msg-upi-1",
    from: "alerts@hdfcbank.net",
    subject: "UPI Transaction Alert",
    date: new Date("2025-06-15"),
    bodyText: "Rs.500.00 debited from your a/c XXXX1234 via UPI to merchant@upi on 15/06/2025. UPI Ref No: 123456789012.",
    ...overrides,
  };
}

describe("UPI Parser - canParse", () => {
  test("matches UPI subject", () => {
    expect(upiParser.canParse(makeEmail())).toBe(true);
  });

  test("matches Google Pay subject", () => {
    expect(
      upiParser.canParse(makeEmail({ subject: "Google Pay payment to Shop" })),
    ).toBe(true);
  });

  test("matches PhonePe subject", () => {
    expect(
      upiParser.canParse(makeEmail({ subject: "PhonePe Transaction" })),
    ).toBe(true);
  });

  test("matches UPI ref in body", () => {
    expect(
      upiParser.canParse(
        makeEmail({
          subject: "Transaction Alert",
          bodyText: "UPI Ref No 123456789012",
        }),
      ),
    ).toBe(true);
  });

  test("matches VPA in body", () => {
    expect(
      upiParser.canParse(
        makeEmail({
          subject: "Transaction Alert",
          bodyText: "VPA: merchant@ybl",
        }),
      ),
    ).toBe(true);
  });

  test("does not match non-UPI email", () => {
    expect(
      upiParser.canParse(
        makeEmail({
          subject: "Credit Card Statement",
          bodyText: "Your credit card bill is Rs.5000",
        }),
      ),
    ).toBe(false);
  });
});

describe("UPI Parser - parse", () => {
  test("parses HDFC UPI debit alert", () => {
    const result = upiParser.parse(makeEmail());
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);

    const tx = result![0];
    expect(tx.amount).toBe(500);
    expect(tx.direction).toBe("debit");
    expect(tx.type).toBe("upi");
    expect(tx.bank).toBe("HDFC");
    expect(tx.account).toBe("XXXX1234");
    expect(tx.reference).toBe("123456789012");
    expect(tx.source).toBe("regex");
    expect(tx.needsReview).toBe(false);
    expect(tx.currency).toBe("INR");
    expect(tx.emailMessageId).toBe("msg-upi-1");
  });

  test("parses UPI credit (received money)", () => {
    const result = upiParser.parse(
      makeEmail({
        bodyText:
          "Rs.1,200.50 credited to your a/c XXXX5678 via UPI from sender@upi. UPI Ref No: 987654321098.",
      }),
    );
    expect(result).not.toBeNull();
    const tx = result![0];
    expect(tx.amount).toBe(1200.5);
    expect(tx.direction).toBe("credit");
    expect(tx.reference).toBe("987654321098");
  });

  test("parses Google Pay style email", () => {
    const result = upiParser.parse(
      makeEmail({
        from: "noreply@google.com",
        subject: "You paid ₹350 to Swiggy via Google Pay",
        bodyText:
          "You paid ₹350 to Swiggy on 20/06/2025. UPI transaction ID: 567890123456. Paid to swiggy@paytm.",
      }),
    );
    expect(result).not.toBeNull();
    const tx = result![0];
    expect(tx.amount).toBe(350);
    expect(tx.direction).toBe("debit");
    expect(tx.bank).toBe("Google Pay");
    expect(tx.reference).toBe("567890123456");
  });

  test("parses PhonePe style email", () => {
    const result = upiParser.parse(
      makeEmail({
        from: "noreply@phonepe.com",
        subject: "PhonePe Transaction Successful",
        bodyText:
          "Rs.999.00 paid to Amazon via PhonePe. UPI Ref: 111222333444. VPA: amazon@ybl.",
      }),
    );
    expect(result).not.toBeNull();
    const tx = result![0];
    expect(tx.amount).toBe(999);
    expect(tx.direction).toBe("debit");
    expect(tx.bank).toBe("PhonePe");
  });

  test("extracts merchant from VPA when name pattern fails", () => {
    const result = upiParser.parse(
      makeEmail({
        bodyText:
          "Rs.200.00 debited via UPI. VPA: shopkeeper@oksbi. UPI Ref No: 444555666777.",
      }),
    );
    expect(result).not.toBeNull();
    const tx = result![0];
    expect(tx.merchant).toBe("shopkeeper@oksbi");
  });

  test("returns null when no amount found", () => {
    const result = upiParser.parse(
      makeEmail({
        bodyText: "UPI transaction completed successfully. UPI Ref No: 123456.",
      }),
    );
    expect(result).toBeNull();
  });

  test("handles Indian number format with commas", () => {
    const result = upiParser.parse(
      makeEmail({
        bodyText:
          "Rs.1,50,000.00 debited from a/c XXXX9999 via UPI. UPI Ref No: 999888777666.",
      }),
    );
    expect(result).not.toBeNull();
    expect(result![0].amount).toBe(150000);
  });

  test("parses SBI UPI alert", () => {
    const result = upiParser.parse(
      makeEmail({
        from: "alerts@sbi.co.in",
        subject: "SBI UPI Transaction",
        bodyText:
          "INR 750.00 debited from your a/c XXXX4321 on 01/07/2025 via UPI to merchant@upi. UPI Ref: 222333444555.",
      }),
    );
    expect(result).not.toBeNull();
    const tx = result![0];
    expect(tx.amount).toBe(750);
    expect(tx.bank).toBe("SBI");
    expect(tx.account).toBe("XXXX4321");
  });

  test("each parse generates unique transaction id", () => {
    const r1 = upiParser.parse(makeEmail());
    const r2 = upiParser.parse(makeEmail());
    expect(r1![0].id).not.toBe(r2![0].id);
  });

  test("sets source to regex", () => {
    const result = upiParser.parse(makeEmail());
    expect(result![0].source).toBe("regex");
  });

  test("uses email date as fallback when no date in body", () => {
    const result = upiParser.parse(
      makeEmail({
        date: new Date("2025-03-01"),
        bodyText:
          "Rs.100 debited via UPI to shop@upi. UPI Ref No: 111111111111.",
      }),
    );
    expect(result).not.toBeNull();
    expect(result![0].date).toEqual(new Date("2025-03-01"));
  });
});
