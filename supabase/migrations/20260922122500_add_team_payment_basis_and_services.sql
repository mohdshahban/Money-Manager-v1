-- Team payment basis and service-wise contractor rates.
-- Existing members remain fixed-contract by default.

ALTER TABLE public.project_team_members
  ADD COLUMN IF NOT EXISTS payment_basis TEXT NOT NULL DEFAULT 'fixed_contract';

ALTER TABLE public.project_team_members
  DROP CONSTRAINT IF EXISTS project_team_members_payment_basis_check;

ALTER TABLE public.project_team_members
  ADD CONSTRAINT project_team_members_payment_basis_check
  CHECK (payment_basis IN ('fixed_contract','service_rate'));

CREATE TABLE IF NOT EXISTS public.project_team_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES public.project_team_members(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  location TEXT,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit TEXT NOT NULL DEFAULT 'sqft',
  rate NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (rate >= 0),
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_team_services_member_idx
  ON public.project_team_services(team_member_id);
CREATE INDEX IF NOT EXISTS project_team_services_project_idx
  ON public.project_team_services(project_id);
CREATE INDEX IF NOT EXISTS project_team_services_user_idx
  ON public.project_team_services(user_id);

ALTER TABLE public.project_team_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own project team services" ON public.project_team_services;
CREATE POLICY "own project team services" ON public.project_team_services FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_team_services TO authenticated;
GRANT ALL ON public.project_team_services TO service_role;

DROP TRIGGER IF EXISTS project_team_services_updated ON public.project_team_services;
CREATE TRIGGER project_team_services_updated BEFORE UPDATE ON public.project_team_services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
