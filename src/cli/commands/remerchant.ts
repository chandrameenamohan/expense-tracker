/**
 * CLI command: remerchant <id> <merchant>
 * Overrides a transaction's merchant name.
 */

import { getTransaction, updateTransactionMerchant } from "../../db";

export function remerchantCommand(args: string[]): void {
  const id = args[0];
  const merchant = args.slice(1).join(" ");

  if (!id || !merchant) {
    console.error("Usage: expense-tracker remerchant <id> <merchant name>");
    process.exitCode = 1;
    return;
  }

  const tx = getTransaction(id);
  if (!tx) {
    console.error(`Transaction not found: ${id}`);
    process.exitCode = 1;
    return;
  }

  const oldMerchant = tx.merchant;

  const updated = updateTransactionMerchant(id, merchant);
  if (!updated) {
    console.error("Failed to update transaction merchant.");
    process.exitCode = 1;
    return;
  }

  console.log(`Updated transaction ${id}:`);
  console.log(`  Merchant:  ${oldMerchant} → ${merchant}`);
}
