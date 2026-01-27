-- Eval flags: user-annotated ground truth for transactions
CREATE TABLE eval_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  verdict TEXT NOT NULL CHECK (verdict IN ('correct', 'wrong')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_eval_flags_transaction ON eval_flags(transaction_id);
