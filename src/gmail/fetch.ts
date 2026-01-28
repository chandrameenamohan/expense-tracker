import type { OAuth2Client } from "googleapis-common";
import { google } from "googleapis";
import type { RawEmail } from "../types";
import { withRetry } from "./rate-limit";
import { getConfig } from "../config";

/**
 * Extracts a header value from a Gmail message payload.
 */
function getHeader(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string,
): string {
  if (!headers) return "";
  const header = headers.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase(),
  );
  return header?.value ?? "";
}

/**
 * Recursively extracts body parts from a Gmail message payload.
 * Returns plain text and HTML bodies.
 */
function extractBodies(
  payload: {
    mimeType?: string | null;
    body?: { data?: string | null } | null;
    parts?: Array<{
      mimeType?: string | null;
      body?: { data?: string | null } | null;
      parts?: Array<unknown>;
    }> | null;
  } | null,
): { text: string; html: string } {
  const result = { text: "", html: "" };
  if (!payload) return result;

  const decode = (data: string | null | undefined): string => {
    if (!data) return "";
    // Gmail uses URL-safe base64
    return Buffer.from(data, "base64url").toString("utf-8");
  };

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    result.text = decode(payload.body.data);
  } else if (payload.mimeType === "text/html" && payload.body?.data) {
    result.html = decode(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const sub = extractBodies(part as typeof payload);
      if (sub.text && !result.text) result.text = sub.text;
      if (sub.html && !result.html) result.html = sub.html;
    }
  }

  return result;
}

/**
 * Converts a Gmail API message into a RawEmail.
 */
// biome-ignore lint/suspicious/noExplicitAny: Gmail API message shape is complex
function toRawEmail(message: any): RawEmail | null {
  if (!message?.id || !message?.payload) return null;

  const headers = message.payload.headers as
    | Array<{ name?: string | null; value?: string | null }>
    | undefined;
  const from = getHeader(headers, "From");
  const subject = getHeader(headers, "Subject");
  const dateStr = getHeader(headers, "Date");
  const { text, html } = extractBodies(message.payload as Parameters<typeof extractBodies>[0]);

  return {
    messageId: message.id,
    from,
    subject,
    date: dateStr ? new Date(dateStr) : new Date(),
    bodyText: text,
    bodyHtml: html || undefined,
    fetchedAt: new Date(),
  };
}

/** Default batch size for fetching messages */
const BATCH_SIZE = getConfig().gmail.fetchBatchSize;

/**
 * Fetches full message content for a list of message IDs.
 * Processes in batches to avoid overwhelming the API.
 */
export async function fetchMessages(
  client: OAuth2Client,
  messageIds: string[],
  batchSize: number = BATCH_SIZE,
): Promise<RawEmail[]> {
  if (messageIds.length === 0) return [];

  const gmail = google.gmail({ version: "v1", auth: client });
  const results: RawEmail[] = [];

  for (let i = 0; i < messageIds.length; i += batchSize) {
    const batch = messageIds.slice(i, i + batchSize);
    const promises = batch.map((id) =>
      withRetry(() =>
        gmail.users.messages.get({
          userId: "me",
          id,
          format: "full",
        }),
      ),
    );

    const responses = await Promise.all(promises);

    for (const res of responses) {
      const email = toRawEmail(res.data);
      if (email) results.push(email);
    }
  }

  return results;
}

// Exported for testing
export { getHeader, extractBodies, toRawEmail };
