/** Direction of money flow */
export type TransactionDirection = "debit" | "credit";

/** How the transaction was parsed */
export type TransactionSource = "regex" | "ai";

/** Transaction type based on payment method */
export type TransactionType =
  | "upi"
  | "credit_card"
  | "bank_transfer"
  | "sip"
  | "loan";

/** A parsed financial transaction */
export interface Transaction {
  id: string;
  emailMessageId: string;
  date: Date;
  amount: number;
  currency: string;
  direction: TransactionDirection;
  type: TransactionType;
  merchant: string;
  account: string;
  bank: string;
  reference?: string;
  description?: string;
  category?: string;
  source: TransactionSource;
  confidence?: number;
  needsReview: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Raw email fetched from Gmail */
export interface RawEmail {
  messageId: string;
  from: string;
  subject: string;
  date: Date;
  bodyText: string;
  bodyHtml?: string;
  fetchedAt?: Date;
}

/** A transaction parser module */
export interface Parser {
  canParse(email: RawEmail): boolean;
  parse(email: RawEmail): Transaction[] | null;
}

/** An expense category */
export interface Category {
  name: string;
  parent?: string;
  description?: string;
}

/** A user correction to AI categorization */
export interface CategoryCorrection {
  id: number;
  merchant: string;
  description?: string;
  originalCategory: string;
  correctedCategory: string;
  createdAt: Date;
}

/** Key-value sync state entry */
export interface SyncState {
  key: string;
  value: string;
  updatedAt: Date;
}
