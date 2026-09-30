-- Simple review flag for transactions.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS transactions_needs_review_idx
  ON public.transactions(user_id, needs_review)
  WHERE deleted_at IS NULL;
