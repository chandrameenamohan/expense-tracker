export { getDb, getDbPath, closeDb, _resetDb, _setDb } from "./connection";
export { runMigrations } from "./migrate";
export {
  insertRawEmail,
  insertRawEmails,
  getRawEmail,
  getAllRawEmails,
  getRawEmailsByIds,
  rawEmailExists,
} from "./raw-emails";
export {
  getSyncState,
  setSyncState,
  getLastSyncTimestamp,
  setLastSyncTimestamp,
  getTotalSyncedCount,
  incrementTotalSyncedCount,
  getLastMessageId,
  setLastMessageId,
  getAllSyncState,
} from "./sync-state";
export {
  insertTransaction,
  insertTransactions,
  getTransaction,
  getTransactionsByEmail,
  listTransactions,
  updateTransactionMerchant,
  updateTransactionCategory,
  updateTransactionReview,
  deleteTransaction,
  softDeleteTransaction,
  deleteAllTransactions,
  countTransactions,
} from "./transactions";
export type { ListTransactionsOptions } from "./transactions";
export {
  getReviewQueue,
  getReviewQueueCount,
  resolveReview,
  flagForReview,
} from "./review-queue";
export type { ReviewQueueOptions } from "./review-queue";
export {
  insertCategoryCorrection,
  getCorrection,
  getCorrectionsByMerchant,
  getRecentCorrections,
} from "./category-corrections";
export {
  insertEvalFlag,
  getEvalFlag,
  getEvalFlagsByTransaction,
  getAllEvalFlags,
} from "./eval-flags";
export type { EvalFlag } from "./eval-flags";
export {
  markAsDuplicate,
  getDuplicatesFor,
  getDuplicateOf,
} from "./duplicate-groups";
export type { DuplicateGroup } from "./duplicate-groups";
