/**
 * `expense-tracker flag` command.
 * Flag a transaction as correct or wrong for eval dataset building.
 */

import { getTransaction } from "../../db/transactions";
import { insertEvalFlag } from "../../db/eval-flags";

export function flagCommand(args: string[]): void {
  const transactionId = args[0];
  const verdict = args[1] as "correct" | "wrong" | undefined;

  if (!transactionId || !verdict || !["correct", "wrong"].includes(verdict)) {
    console.log("Usage: expense-tracker flag <transaction-id> correct|wrong [--notes \"...\"]");
    process.exitCode = 1;
    return;
  }

  const tx = getTransaction(transactionId);
  if (!tx) {
    console.error(`Transaction not found: ${transactionId}`);
    process.exitCode = 1;
    return;
  }

  let notes: string | undefined;
  const notesIdx = args.indexOf("--notes");
  if (notesIdx !== -1 && args[notesIdx + 1]) {
    notes = args[notesIdx + 1];
  }

  const flag = insertEvalFlag(transactionId, verdict, notes);
  console.log(
    `Flagged transaction ${transactionId} as "${verdict}" (flag #${flag.id})${notes ? ` — ${notes}` : ""}`,
  );
}
