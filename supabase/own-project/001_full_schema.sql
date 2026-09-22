-- =====================================================================
-- Budget Bliss / Moneta — full schema for a NEW, EMPTY Supabase project
-- Run this once in: Supabase Dashboard -> SQL Editor -> New query
-- Safe to re-run (idempotent guards where possible).
-- =====================================================================

-- ---------- helper: updated_at ----------
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- ---------- profiles ----------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  locale TEXT NOT NULL DEFAULT 'en',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  theme TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own profile" ON public.profiles;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP TRIGGER IF EXISTS profiles_updated ON public.profiles;
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- accounts ----------
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'cash',
  icon TEXT DEFAULT 'wallet',
  color TEXT DEFAULT '#4F46E5',
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_limit NUMERIC(14,2),
  currency TEXT NOT NULL DEFAULT 'USD',
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON public.accounts(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own accounts" ON public.accounts;
CREATE POLICY "own accounts" ON public.accounts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS accounts_updated ON public.accounts;
CREATE TRIGGER accounts_updated BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- categories (self-referencing for subcategories) ----------
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  icon TEXT DEFAULT 'tag',
  color TEXT DEFAULT '#64748B',
  monthly_budget NUMERIC(14,2),
  parent_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS categories_user_id_idx ON public.categories(user_id);
CREATE INDEX IF NOT EXISTS categories_parent_id_idx ON public.categories(parent_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own categories" ON public.categories;
CREATE POLICY "own categories" ON public.categories FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- projects (interior-designer module) ----------
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  client_name TEXT,
  client_contact TEXT,
  site_address TEXT,
  quoted_amount NUMERIC NOT NULL DEFAULT 0,
  budget NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  notes TEXT,
  partner_module_enabled BOOLEAN NOT NULL DEFAULT false,
  color TEXT DEFAULT '#6366F1',
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_user_id_idx ON public.projects(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own projects" ON public.projects;
CREATE POLICY "own projects" ON public.projects FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS projects_set_updated_at ON public.projects;
CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- project team register ----------
CREATE TABLE IF NOT EXISTS public.project_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trade TEXT NOT NULL DEFAULT 'Labour',
  payment_basis TEXT NOT NULL DEFAULT 'fixed_contract' CHECK (payment_basis IN ('fixed_contract','service_rate')),
  contract_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  phone TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_team_members_project_idx ON public.project_team_members(project_id);
CREATE INDEX IF NOT EXISTS project_team_members_user_idx ON public.project_team_members(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_team_members_identity_idx
  ON public.project_team_members(project_id, lower(name), lower(trade));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_team_members TO authenticated;
GRANT ALL ON public.project_team_members TO service_role;
ALTER TABLE public.project_team_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own project team members" ON public.project_team_members;
CREATE POLICY "own project team members" ON public.project_team_members FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS project_team_members_updated ON public.project_team_members;
CREATE TRIGGER project_team_members_updated BEFORE UPDATE ON public.project_team_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- project team services ----------
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
CREATE INDEX IF NOT EXISTS project_team_services_member_idx ON public.project_team_services(team_member_id);
CREATE INDEX IF NOT EXISTS project_team_services_project_idx ON public.project_team_services(project_id);
CREATE INDEX IF NOT EXISTS project_team_services_user_idx ON public.project_team_services(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_team_services TO authenticated;
GRANT ALL ON public.project_team_services TO service_role;
ALTER TABLE public.project_team_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own project team services" ON public.project_team_services;
CREATE POLICY "own project team services" ON public.project_team_services FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS project_team_services_updated ON public.project_team_services;
CREATE TRIGGER project_team_services_updated BEFORE UPDATE ON public.project_team_services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- transactions ----------
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense','transfer')),
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  to_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  team_member_id UUID REFERENCES public.project_team_members(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  description TEXT,
  notes TEXT,
  payment_method TEXT,
  tags TEXT[] DEFAULT '{}',
  location TEXT,
  vendor TEXT,
  receipt_path TEXT,
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','pending','cancelled')),
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurring_period TEXT,
  favorite BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_user_occurred_idx ON public.transactions(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS transactions_user_category_idx ON public.transactions(user_id, category_id);
CREATE INDEX IF NOT EXISTS transactions_project_id_idx ON public.transactions(project_id);
CREATE INDEX IF NOT EXISTS transactions_team_member_idx ON public.transactions(team_member_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own tx" ON public.transactions;
CREATE POLICY "own tx" ON public.transactions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS tx_updated ON public.transactions;
CREATE TRIGGER tx_updated BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- materials / inventory ----------
CREATE TABLE IF NOT EXISTS public.material_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pcs',
  category TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
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
CREATE TABLE IF NOT EXISTS public.project_material_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.project_material_purchase_batches(id) ON DELETE CASCADE,
  material_item_id UUID NOT NULL REFERENCES public.material_items(id) ON DELETE RESTRICT,
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.project_material_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.project_material_work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  area_id UUID NOT NULL REFERENCES public.project_material_areas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dimensions TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.project_material_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  area_id UUID NOT NULL REFERENCES public.project_material_areas(id) ON DELETE CASCADE,
  work_item_id UUID REFERENCES public.project_material_work_items(id) ON DELETE SET NULL,
  material_item_id UUID NOT NULL REFERENCES public.material_items(id) ON DELETE RESTRICT,
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS material_items_user_idx ON public.material_items(user_id);
CREATE INDEX IF NOT EXISTS project_material_purchase_batches_project_idx ON public.project_material_purchase_batches(project_id);
CREATE INDEX IF NOT EXISTS project_material_purchase_batches_user_idx ON public.project_material_purchase_batches(user_id);
CREATE INDEX IF NOT EXISTS project_material_purchase_batches_transaction_idx ON public.project_material_purchase_batches(source_transaction_id);
CREATE INDEX IF NOT EXISTS project_material_purchases_project_idx ON public.project_material_purchases(project_id);
CREATE INDEX IF NOT EXISTS project_material_purchases_batch_idx ON public.project_material_purchases(batch_id);
CREATE INDEX IF NOT EXISTS project_material_purchases_item_idx ON public.project_material_purchases(material_item_id);
CREATE INDEX IF NOT EXISTS project_material_areas_project_idx ON public.project_material_areas(project_id);
CREATE INDEX IF NOT EXISTS project_material_work_items_project_idx ON public.project_material_work_items(project_id);
CREATE INDEX IF NOT EXISTS project_material_work_items_area_idx ON public.project_material_work_items(area_id);
CREATE INDEX IF NOT EXISTS project_material_usage_project_idx ON public.project_material_usage(project_id);
CREATE INDEX IF NOT EXISTS project_material_usage_item_idx ON public.project_material_usage(material_item_id);
CREATE INDEX IF NOT EXISTS project_material_usage_area_idx ON public.project_material_usage(area_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_items, public.project_material_purchase_batches,
  public.project_material_purchases, public.project_material_areas, public.project_material_work_items, public.project_material_usage TO authenticated;
GRANT ALL ON public.material_items, public.project_material_purchase_batches,
  public.project_material_purchases, public.project_material_areas, public.project_material_work_items, public.project_material_usage TO service_role;

ALTER TABLE public.material_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_material_purchase_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_material_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_material_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_material_work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_material_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own material items" ON public.material_items;
CREATE POLICY "own material items" ON public.material_items FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own project material purchase batches" ON public.project_material_purchase_batches;
CREATE POLICY "own project material purchase batches" ON public.project_material_purchase_batches FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own project material purchases" ON public.project_material_purchases;
CREATE POLICY "own project material purchases" ON public.project_material_purchases FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own project material areas" ON public.project_material_areas;
CREATE POLICY "own project material areas" ON public.project_material_areas FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own project material work items" ON public.project_material_work_items;
CREATE POLICY "own project material work items" ON public.project_material_work_items FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own project material usage" ON public.project_material_usage;
CREATE POLICY "own project material usage" ON public.project_material_usage FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS material_items_updated ON public.material_items;
CREATE TRIGGER material_items_updated BEFORE UPDATE ON public.material_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS project_material_purchase_batches_updated ON public.project_material_purchase_batches;
CREATE TRIGGER project_material_purchase_batches_updated BEFORE UPDATE ON public.project_material_purchase_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS project_material_purchases_updated ON public.project_material_purchases;
CREATE TRIGGER project_material_purchases_updated BEFORE UPDATE ON public.project_material_purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS project_material_areas_updated ON public.project_material_areas;
CREATE TRIGGER project_material_areas_updated BEFORE UPDATE ON public.project_material_areas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS project_material_work_items_updated ON public.project_material_work_items;
CREATE TRIGGER project_material_work_items_updated BEFORE UPDATE ON public.project_material_work_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS project_material_usage_updated ON public.project_material_usage;
CREATE TRIGGER project_material_usage_updated BEFORE UPDATE ON public.project_material_usage
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- budgets ----------
CREATE TABLE IF NOT EXISTS public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('weekly','monthly','yearly','custom')),
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS budgets_user_id_idx ON public.budgets(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budgets TO authenticated;
GRANT ALL ON public.budgets TO service_role;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own budgets" ON public.budgets;
CREATE POLICY "own budgets" ON public.budgets FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS budgets_updated ON public.budgets;
CREATE TRIGGER budgets_updated BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- signup bootstrap: profile + default accounts + default categories ----------
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.accounts (user_id, name, type, icon, color, opening_balance) VALUES
    (NEW.id, 'Cash', 'cash', 'wallet', '#10B981', 0),
    (NEW.id, 'Bank', 'bank', 'landmark', '#4F46E5', 0);

  INSERT INTO public.categories (user_id, name, type, icon, color) VALUES
    (NEW.id, 'Food', 'expense', 'utensils', '#F59E0B'),
    (NEW.id, 'Transport', 'expense', 'car', '#3B82F6'),
    (NEW.id, 'Shopping', 'expense', 'shopping-bag', '#EC4899'),
    (NEW.id, 'Entertainment', 'expense', 'film', '#8B5CF6'),
    (NEW.id, 'Medical', 'expense', 'heart-pulse', '#EF4444'),
    (NEW.id, 'Bills', 'expense', 'receipt', '#F97316'),
    (NEW.id, 'Rent', 'expense', 'home', '#06B6D4'),
    (NEW.id, 'Education', 'expense', 'graduation-cap', '#6366F1'),
    (NEW.id, 'Travel', 'expense', 'plane', '#14B8A6'),
    (NEW.id, 'Other', 'expense', 'more-horizontal', '#64748B'),
    (NEW.id, 'Salary', 'income', 'briefcase', '#10B981'),
    (NEW.id, 'Business', 'income', 'trending-up', '#22C55E'),
    (NEW.id, 'Investment', 'income', 'line-chart', '#0EA5E9'),
    (NEW.id, 'Gift', 'income', 'gift', '#F43F5E'),
    (NEW.id, 'Other Income', 'income', 'plus-circle', '#84CC16');
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- ---------- storage: private "receipts" bucket + per-user folder policies ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('receipts', 'receipts', false, 10485760,
        ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/heic','application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload their own receipts" ON storage.objects;
CREATE POLICY "Users can upload their own receipts" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Users can view their own receipts" ON storage.objects;
CREATE POLICY "Users can view their own receipts" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Users can update their own receipts" ON storage.objects;
CREATE POLICY "Users can update their own receipts" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Users can delete their own receipts" ON storage.objects;
CREATE POLICY "Users can delete their own receipts" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
