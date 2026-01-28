import { describe, expect, test } from "bun:test";
import {
  createParserPipeline,
  parseEmail,
  parseEmails,
} from "../../src/parser/pipeline";
import type { RawEmail, Transaction } from "../../src/types";
import type { SpawnFn } from "../../src/parser/ai-fallback";

/** Mock spawn that returns a valid AI response based on the Subject line in the prompt */
function mockSpawn(): SpawnFn {
  return (args: string[]) => {
    const prompt = args[args.indexOf("-p") + 1] || "";
    // Extract the Subject line from the prompt template
    const subjectMatch = prompt.match(/Subject:\s*(.+)/);
    const subject = subjectMatch ? subjectMatch[1] : "";

    let type = "bank_transfer";
    let merchant = "Unknown";
    if (/credit\s*card/i.test(subject)) { type = "credit_card"; merchant = "Amazon"; }
    else if (/emi|loan/i.test(subject)) { type = "loan"; merchant = "Home Loan EMI"; }
    else if (/sip|mutual\s*fund/i.test(subject)) { type = "sip"; merchant = "HDFC Flexi Cap Fund"; }
    else if (/neft|rtgs|imps/i.test(subject)) { type = "bank_transfer"; merchant = "John Doe"; }
    else if (/upi/i.test(subject)) { type = "upi"; merchant = "merchant@upi"; }

    const response = {
      transactions: [{
        amount: 500,
        direction: "debit",
        type,
        merchant,
        confidence: 0.95,
      }],
    };
    return {
      exitCode: 0,
      stdout: JSON.stringify(response),
      stderr: "",
    };
  };
}

function makeEmail(overrides: Partial<RawEmail> = {}): RawEmail {
  return {
    messageId: "msg-1",
    from: "alerts@hdfcbank.net",
    subject: "Transaction Alert",
    date: new Date("2025-01-15"),
    bodyText: "Some generic text",
    ...overrides,
  };
}

describe("createParserPipeline", () => {
  test("returns a ParserRegistry with all parsers registered", () => {
    const pipeline = createParserPipeline();
    // Should not throw
    expect(pipeline).toBeDefined();
  });

  test("parses a UPI email", () => {
    const pipeline = createParserPipeline(mockSpawn());
    const email = makeEmail({
      subject: "UPI transaction alert",
      bodyText:
        "Dear Customer, Rs.500.00 has been debited from your account XXXX1234 via UPI to merchant@upi on 15-01-2025. UPI Ref: 501234567890.",
      from: "alerts@hdfcbank.net",
    });
    const txs = pipeline.parse(email);
    expect(txs.length).toBeGreaterThan(0);
    expect(txs[0].type).toBe("upi");
    expect(txs[0].source).toBe("ai");
  });

  test("parses a credit card email", () => {
    const pipeline = createParserPipeline(mockSpawn());
    const email = makeEmail({
      subject: "Credit Card Transaction Alert",
      bodyText:
        "Your HDFC Bank Credit Card XXXX5678 has been used for Rs.2,500.00 at Amazon on 15-01-2025.",
      from: "alerts@hdfcbank.net",
    });
    const txs = pipeline.parse(email);
    expect(txs.length).toBeGreaterThan(0);
    expect(txs[0].type).toBe("credit_card");
    expect(txs[0].source).toBe("ai");
  });

  test("parses a bank transfer email", () => {
    const pipeline = createParserPipeline(mockSpawn());
    const email = makeEmail({
      subject: "NEFT Transaction Confirmation",
      bodyText:
        "Rs.10,000.00 has been debited from your account XXXX9876 via NEFT transfer to John Doe on 15-01-2025. Ref: NEFT123456.",
      from: "alerts@hdfcbank.net",
    });
    const txs = pipeline.parse(email);
    expect(txs.length).toBeGreaterThan(0);
    expect(txs[0].type).toBe("bank_transfer");
  });

  test("parses a SIP email", () => {
    const pipeline = createParserPipeline(mockSpawn());
    const email = makeEmail({
      subject: "SIP Installment Confirmation",
      bodyText:
        "Your SIP installment of Rs.5,000.00 for scheme name HDFC Flexi Cap Fund has been debited from account XXXX4321 on 15-01-2025. Folio: 12345678.",
      from: "alerts@hdfcbank.net",
    });
    const txs = pipeline.parse(email);
    expect(txs.length).toBeGreaterThan(0);
    expect(txs[0].type).toBe("sip");
  });

  test("parses a loan EMI email", () => {
    const pipeline = createParserPipeline(mockSpawn());
    const email = makeEmail({
      subject: "EMI Debit Notification",
      bodyText:
        "Dear Customer, EMI of Rs.15,000.00 for your home loan account HL001234 has been debited from account XXXX5555 on 15-01-2025.",
      from: "alerts@hdfcbank.net",
    });
    const txs = pipeline.parse(email);
    expect(txs.length).toBeGreaterThan(0);
    expect(txs[0].type).toBe("loan");
  });

  test("returns empty array for unrecognized email when AI returns nothing", () => {
    const noOpSpawn = () => ({
      exitCode: 0,
      stdout: JSON.stringify({ transactions: [] }),
      stderr: "",
    });
    const pipeline = createParserPipeline(noOpSpawn);
    const email = makeEmail({
      subject: "Welcome to our newsletter",
      bodyText: "Thanks for subscribing!",
      from: "newsletter@example.com",
    });
    const txs = pipeline.parse(email);
    expect(txs).toEqual([]);
  });
});

describe("parseEmail", () => {
  test("delegates to pipeline.parse", () => {
    const pipeline = createParserPipeline(mockSpawn());
    const email = makeEmail({
      subject: "UPI transaction alert",
      bodyText:
        "Rs.500.00 debited from XXXX1234 via UPI to shop@upi on 15-01-2025. UPI Ref: 501234567890.",
      from: "alerts@hdfcbank.net",
    });
    const txs = parseEmail(pipeline, email);
    expect(txs.length).toBeGreaterThan(0);
  });
});

describe("parseEmails", () => {
  test("parses multiple emails and returns flat array", () => {
    const pipeline = createParserPipeline(mockSpawn());
    const emails = [
      makeEmail({
        messageId: "msg-1",
        subject: "UPI transaction alert",
        bodyText:
          "Rs.500.00 debited from XXXX1234 via UPI to shop@upi on 15-01-2025. UPI Ref: 501234567890.",
        from: "alerts@hdfcbank.net",
      }),
      makeEmail({
        messageId: "msg-2",
        subject: "Credit Card Transaction Alert",
        bodyText:
          "Your HDFC Bank Credit Card XXXX5678 has been used for Rs.2,500.00 at Amazon on 15-01-2025.",
        from: "alerts@hdfcbank.net",
      }),
    ];
    const txs = parseEmails(pipeline, emails);
    expect(txs.length).toBeGreaterThanOrEqual(2);
  });

  test("returns empty array for empty input", () => {
    const pipeline = createParserPipeline();
    expect(parseEmails(pipeline, [])).toEqual([]);
  });
});
