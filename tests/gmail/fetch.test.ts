import { describe, expect, test } from "bun:test";
import { getHeader, extractBodies, toRawEmail } from "../../src/gmail/fetch";

describe("getHeader", () => {
  const headers = [
    { name: "From", value: "alerts@hdfcbank.net" },
    { name: "Subject", value: "Transaction Alert" },
    { name: "Date", value: "Mon, 15 Jan 2024 10:30:00 +0530" },
  ];

  test("returns header value by name (case-insensitive)", () => {
    expect(getHeader(headers, "from")).toBe("alerts@hdfcbank.net");
    expect(getHeader(headers, "Subject")).toBe("Transaction Alert");
  });

  test("returns empty string for missing header", () => {
    expect(getHeader(headers, "X-Missing")).toBe("");
  });

  test("returns empty string for undefined headers", () => {
    expect(getHeader(undefined, "From")).toBe("");
  });
});

describe("extractBodies", () => {
  test("extracts plain text body from simple payload", () => {
    const payload = {
      mimeType: "text/plain",
      body: { data: Buffer.from("Hello world").toString("base64url") },
    };
    const { text, html } = extractBodies(payload);
    expect(text).toBe("Hello world");
    expect(html).toBe("");
  });

  test("extracts HTML body from simple payload", () => {
    const payload = {
      mimeType: "text/html",
      body: { data: Buffer.from("<p>Hello</p>").toString("base64url") },
    };
    const { text, html } = extractBodies(payload);
    expect(text).toBe("");
    expect(html).toBe("<p>Hello</p>");
  });

  test("extracts both from multipart payload", () => {
    const payload = {
      mimeType: "multipart/alternative",
      body: {},
      parts: [
        {
          mimeType: "text/plain",
          body: { data: Buffer.from("Plain text").toString("base64url") },
        },
        {
          mimeType: "text/html",
          body: {
            data: Buffer.from("<p>HTML text</p>").toString("base64url"),
          },
        },
      ],
    };
    const { text, html } = extractBodies(payload);
    expect(text).toBe("Plain text");
    expect(html).toBe("<p>HTML text</p>");
  });

  test("returns empty strings for null payload", () => {
    const { text, html } = extractBodies(null);
    expect(text).toBe("");
    expect(html).toBe("");
  });
});

describe("toRawEmail", () => {
  test("converts Gmail message to RawEmail", () => {
    const message = {
      id: "msg123",
      payload: {
        headers: [
          { name: "From", value: "alerts@hdfcbank.net" },
          { name: "Subject", value: "Debit Alert" },
          { name: "Date", value: "2024-01-15T10:30:00Z" },
        ],
        mimeType: "text/plain",
        body: {
          data: Buffer.from("Rs.500 debited").toString("base64url"),
        },
      },
    };

    const email = toRawEmail(message as any);
    expect(email).not.toBeNull();
    expect(email!.messageId).toBe("msg123");
    expect(email!.from).toBe("alerts@hdfcbank.net");
    expect(email!.subject).toBe("Debit Alert");
    expect(email!.bodyText).toBe("Rs.500 debited");
    expect(email!.fetchedAt).toBeInstanceOf(Date);
  });

  test("returns null for message without id", () => {
    const message = { payload: { headers: [] } };
    expect(toRawEmail(message as any)).toBeNull();
  });

  test("returns null for message without payload", () => {
    const message = { id: "msg123" };
    expect(toRawEmail(message as any)).toBeNull();
  });
});
