import { getTransaction, updateTransactionCategory, insertCategoryCorrection } from "../../db";
import { isValidCategory, CATEGORIES } from "../../categorizer";

/**
 * CLI command: recategorize <id> <category>
 * Overrides a transaction's category.
 */
export function recategorizeCommand(args: string[]): void {
  const id = args[0];
  const category = args[1];

  if (!id || !category) {
    console.error("Usage: expense-tracker recategorize <id> <category>");
    console.error(`\nValid categories: ${CATEGORIES.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  if (!isValidCategory(category)) {
    console.error(`Invalid category: "${category}"`);
    console.error(`Valid categories: ${CATEGORIES.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const tx = getTransaction(id);
  if (!tx) {
    console.error(`Transaction not found: ${id}`);
    process.exitCode = 1;
    return;
  }

  const oldCategory = tx.category ?? "(none)";

  const updated = updateTransactionCategory(id, category);
  if (!updated) {
    console.error("Failed to update transaction category.");
    process.exitCode = 1;
    return;
  }

  // Record the correction for future AI categorization
  insertCategoryCorrection(
    tx.merchant,
    oldCategory,
    category,
    tx.description,
  );

  console.log(`Updated transaction ${id}:`);
  console.log(`  Merchant:  ${tx.merchant}`);
  console.log(`  Category:  ${oldCategory} → ${category}`);
}
