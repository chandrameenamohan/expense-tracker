ALTER TABLE transactions ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_transactions_deleted ON transactions(deleted);
