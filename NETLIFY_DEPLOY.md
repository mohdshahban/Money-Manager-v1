# Deploying to Netlify

This app is a TanStack Start SSR app. On Netlify it builds to:

- `dist/` — static client assets (the publish directory)
- `.netlify/functions-internal/` — the SSR / API / MCP server function

Both are produced by `npm run build`; `netlify.toml` already wires it up.
The Lovable preview and Lovable publish targets are unchanged.

## Steps

1. Push this project to GitHub (Lovable → GitHub).
2. In Netlify: **Add new site → Import an existing project** and pick the repo.
   Build command and publish directory are read from `netlify.toml`.
3. Add environment variables under **Site configuration → Environment variables**
   (Scope: *All*, including "Builds"):

   | Variable | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | `https://pnjweffyxavkwpwouduw.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | your `moneymanager` anon / publishable key |
   | `VITE_SUPABASE_PROJECT_ID` | `pnjweffyxavkwpwouduw` |
   | `SUPABASE_URL` | same as `VITE_SUPABASE_URL` |
   | `SUPABASE_PUBLISHABLE_KEY` | same publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | your `moneymanager` service-role key (server only) |

   `vite.config.ts` gives these host-provided values precedence over the
   committed `.env` (which stays pointed at the Lovable preview backend), so the
   Netlify build talks to your own Supabase project with no code changes.
   Authentication runs entirely on `@supabase/supabase-js` — no Lovable Cloud
   auth dependency remains.
4. Deploy. Netlify serves every route through the SSR function, so deep links
   and refreshes work — no `_redirects` file needed.

## After deploying

- Add the Netlify URL to your backend auth settings as an allowed
  **Site URL / Redirect URL**, otherwise email + Google sign-in bounce back.
- The MCP endpoint becomes `https://<your-site>.netlify.app/mcp`.

## Custom domain

Netlify → **Domain management → Add a domain**. If the domain is registered at
Hostinger, point its nameservers (or an `A` / `CNAME` record) at Netlify as
shown in that panel — the app itself keeps running on Netlify.

## Local production test

```bash
npm run build
npx netlify dev
```
