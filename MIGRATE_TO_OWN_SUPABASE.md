# Migrating Budget Bliss to your own Supabase project (`moneymanager`)

Target project: `https://pnjweffyxavkwpwouduw.supabase.co`
The current Lovable Cloud backend is **not** touched by anything in this guide.

---

## 1. What will be created in the new project

Run `supabase/own-project/001_full_schema.sql` in **SQL Editor -> New query**.
It creates exactly this and nothing else:

### Tables (schema `public`)
| Table | Key columns |
| --- | --- |
| `profiles` | `id` (= auth user), email, full_name, avatar_url, currency, locale, timezone, theme |
| `accounts` | user_id, name, type, icon, color, opening_balance, credit_limit, currency, archived |
| `categories` | user_id, name, type (income/expense), icon, color, monthly_budget, `parent_id` (subcategories), archived |
| `projects` | user_id, name, client_name, client_contact, site_address, quoted_amount, budget, status, start_date, end_date, notes, color, archived |
| `transactions` | user_id, amount, type (income/expense/transfer), category_id, account_id, to_account_id, project_id, occurred_at, description, notes, payment_method, tags[], location, vendor, receipt_path, status, is_recurring, recurring_period, favorite, deleted_at |
| `budgets` | user_id, name, amount, period, category_id, start_date, end_date |

### Foreign keys
- `profiles.id`, `accounts.user_id`, `categories.user_id`, `projects.user_id`, `transactions.user_id`, `budgets.user_id` -> `auth.users(id)` ON DELETE CASCADE
- `categories.parent_id` -> `categories(id)` CASCADE
- `transactions.category_id` -> `categories(id)` SET NULL
- `transactions.account_id`, `transactions.to_account_id` -> `accounts(id)` SET NULL
- `transactions.project_id` -> `projects(id)` SET NULL
- `budgets.category_id` -> `categories(id)` CASCADE

### Indexes
`accounts(user_id)`, `categories(user_id)`, `categories(parent_id)`, `projects(user_id)`,
`transactions(user_id, occurred_at DESC)`, `transactions(user_id, category_id)`,
`transactions(project_id)`, `budgets(user_id)`

### RLS
RLS enabled on all six tables; one `FOR ALL TO authenticated` owner policy per table
(`auth.uid() = user_id`, and `auth.uid() = id` on `profiles`). No `anon` access anywhere.
Grants: full CRUD to `authenticated`, `ALL` to `service_role`.

### Functions & triggers
- `public.set_updated_at()` + `BEFORE UPDATE` triggers on profiles, accounts, projects, transactions, budgets
- `public.handle_new_user()` (SECURITY DEFINER) + `AFTER INSERT ON auth.users` trigger — creates the profile, the Cash/Bank accounts, and the 15 default categories for each new signup

### Storage
- Private bucket `receipts` (10 MB limit, images + PDF)
- Four `storage.objects` policies restricting each user to their own `<user_id>/...` folder

### Not migrated (does not exist)
No Edge Functions. No cron jobs. No custom auth tables — auth uses Supabase Auth's own `auth.users`.
Secrets: the only backend secret in use was `LOVABLE_API_KEY` (Lovable AI), which is not referenced by
any app code, so nothing to recreate. `SUPABASE_*` values come from your new project.

---

## 2. Data that needs to be migrated

Schema-only right now — the SQL creates **no rows**. Existing data lives in the Lovable Cloud
database and must be copied per table, in this order (parents first):

1. `auth.users` (users + passwords). Passwords cannot be exported from Lovable Cloud, so either
   (a) users sign up again, or (b) users use "Forgot password" after you import their emails.
2. `profiles`
3. `accounts`
4. `categories` (parents first, then rows with `parent_id`)
5. `projects`
6. `transactions`
7. `budgets`
8. Storage: files under the `receipts` bucket, keeping the `<user_id>/...` path.

Because every row is keyed by `user_id`, the copy is only meaningful once the matching user IDs
exist in the new project. If you want, I can export the current data to CSV per table once the
Lovable Cloud backend is resumed — tell me and I'll generate the files.

---

## 3. Auth configuration in the new project

**Authentication -> URL configuration**
- Site URL: your production URL (e.g. `https://your-site.netlify.app`)
- Redirect URLs: add `https://your-site.netlify.app/**` and `http://localhost:8080/**`

**Authentication -> Providers**
- Email: enabled (confirm email on/off as you prefer)
- Google: enable and paste your Google Cloud OAuth **Client ID + Secret**.
  In Google Cloud Console -> Credentials -> Web application, set the authorized redirect URI to:
  `https://pnjweffyxavkwpwouduw.supabase.co/auth/v1/callback`

The app now calls Supabase Auth directly (no Lovable auth broker):
`supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + returnTo } })`
plus `signInWithPassword`, `signUp`, `resetPasswordForEmail`, `updateUser`, `signOut`,
and persisted sessions via `localStorage`. No hard-coded URLs anywhere.

---

## 4. Point the app at the new project

The Supabase client is created from env vars with `@supabase/supabase-js`, so switching backends
is configuration only. Set these on your host (Netlify: **Site configuration -> Environment
variables**, scope *All*):

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://pnjweffyxavkwpwouduw.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | your project's anon / publishable key |
| `VITE_SUPABASE_PROJECT_ID` | `pnjweffyxavkwpwouduw` |
| `SUPABASE_URL` | same as `VITE_SUPABASE_URL` |
| `SUPABASE_PUBLISHABLE_KEY` | same anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | your service-role key (server only) |

Then redeploy. The Lovable editor preview keeps using Lovable Cloud, so you can compare both.

---

## 5. Order of operations

1. Run `supabase/own-project/001_full_schema.sql` in the new project.
2. Configure Auth URLs + Google provider.
3. Set the env vars on your host and redeploy.
4. Sign up / sign in and confirm a transaction saves.
5. Only after that is confirmed working, decide what to do with the old backend.
