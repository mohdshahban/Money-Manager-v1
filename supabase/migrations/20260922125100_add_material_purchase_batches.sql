-- Group multiple material line items under one site purchase / receipt.

CREATE TABLE IF NOT EXISTS public.project_material_purchase_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'Other Material',
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_material_purchase_batches_project_idx
  ON public.project_material_purchase_batches(project_id);
CREATE INDEX IF NOT EXISTS project_material_purchase_batches_user_idx
  ON public.project_material_purchase_batches(user_id);
CREATE INDEX IF NOT EXISTS project_material_purchase_batches_transaction_idx
  ON public.project_material_purchase_batches(source_transaction_id);

ALTER TABLE public.project_material_purchase_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own project material purchase batches" ON public.project_material_purchase_batches;
CREATE POLICY "own project material purchase batches"
  ON public.project_material_purchase_batches FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_material_purchase_batches TO authenticated;
GRANT ALL ON public.project_material_purchase_batches TO service_role;

DROP TRIGGER IF EXISTS project_material_purchase_batches_updated ON public.project_material_purchase_batches;
CREATE TRIGGER project_material_purchase_batches_updated
  BEFORE UPDATE ON public.project_material_purchase_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.project_material_purchases
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.project_material_purchase_batches(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS project_material_purchases_batch_idx
  ON public.project_material_purchases(batch_id);

-- Preserve existing material quantity records as one-item batches.
WITH source AS (
  SELECT
    p.id AS purchase_id,
    gen_random_uuid() AS batch_id,
    p.user_id,
    p.project_id,
    COALESCE(NULLIF(TRIM(i.category), ''), 'Existing Purchase') AS category,
    p.purchased_at,
    p.source_transaction_id,
    p.notes
  FROM public.project_material_purchases p
  LEFT JOIN public.material_items i ON i.id = p.material_item_id
  WHERE p.batch_id IS NULL
),
inserted AS (
  INSERT INTO public.project_material_purchase_batches (
    id, user_id, project_id, category, purchased_at, source_transaction_id, notes
  )
  SELECT batch_id, user_id, project_id, category, purchased_at, source_transaction_id, notes
  FROM source
  RETURNING id
)
UPDATE public.project_material_purchases p
SET batch_id = source.batch_id
FROM source
WHERE p.id = source.purchase_id;
