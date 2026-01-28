import type { OAuth2Client } from "googleapis-common";
import { google } from "googleapis";
import { withRetry } from "./rate-limit";
import { getConfig } from "../config";

/**
 * Builds the Gmail search query string combining sender and subject filters.
 * Optionally filters by date range using `after:`.
 */
export function buildQuery(afterDate?: Date): string {
  const { senders, subjectKeywords } = getConfig().gmail;
  const fromClause = `{${senders.map((s) => `from:${s}`).join(" ")}}`;
  const subjectClause = `{${subjectKeywords.map((k) => `subject:${k}`).join(" ")}}`;

  let query = `${fromClause} ${subjectClause}`;

  if (afterDate) {
    // Gmail uses YYYY/MM/DD format for date filters
    const y = afterDate.getFullYear();
    const m = String(afterDate.getMonth() + 1).padStart(2, "0");
    const d = String(afterDate.getDate()).padStart(2, "0");
    query += ` after:${y}/${m}/${d}`;
  }

  return query;
}

/**
 * Lists Gmail message IDs matching the transaction query.
 * Returns all matching message IDs (handles pagination internally).
 */
export async function listMessageIds(
  client: OAuth2Client,
  afterDate?: Date,
): Promise<string[]> {
  const gmail = google.gmail({ version: "v1", auth: client });
  const query = buildQuery(afterDate);
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const res = await withRetry(() =>
      gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 500,
        pageToken,
      }),
    );

    if (res.data.messages) {
      for (const msg of res.data.messages) {
        if (msg.id) ids.push(msg.id);
      }
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return ids;
}
