-- Optional Partner module per project.
-- Existing projects with partner activity are enabled automatically.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS partner_module_enabled BOOLEAN NOT NULL DEFAULT false;

UPDATE public.projects p
SET partner_module_enabled = true
WHERE EXISTS (
  SELECT 1
  FROM public.transactions t
  LEFT JOIN public.accounts a_from ON a_from.id = t.account_id
  LEFT JOIN public.accounts a_to ON a_to.id = t.to_account_id
  WHERE t.project_id = p.id
    AND t.deleted_at IS NULL
    AND (
      COALESCE(t.tags, '{}') && ARRAY['partner-advance','partner-spend']::text[]
      OR a_from.type = 'partner_float'
      OR a_to.type = 'partner_float'
    )
);
