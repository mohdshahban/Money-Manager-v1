// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// Netlify sets NETLIFY=true during its build. On Netlify we emit a Netlify
// Function server (dist/ = static assets, .netlify/functions-internal = SSR).
// Everywhere else (Lovable preview + publish) the default Cloudflare target is
// kept untouched.
const isNetlify = process.env.NETLIFY === "true" || process.env.NETLIFY === "1";

// Host-provided env vars (Netlify/Vercel project environment variables) must win
// over the committed .env, so the same code can point at any Supabase project
// without editing files. Only keys actually present are overridden.
const HOST_ENV_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PROJECT_ID",
] as const;

const hostEnvDefine = Object.fromEntries(
  HOST_ENV_KEYS.filter((key) => !!process.env[key]).map((key) => [
    `import.meta.env.${key}`,
    JSON.stringify(process.env[key]),
  ]),
);

// MCP tools run on the server and historically read the non-VITE names from
// process.env. Vercel is configured with the VITE_* variables used by the app,
// so mirror those values into the server-side names at build time. This keeps
// the MCP tools and the web app pointed at the same Supabase project.
const serverSupabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serverSupabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const serverSupabaseProjectId = process.env.SUPABASE_PROJECT_ID ?? process.env.VITE_SUPABASE_PROJECT_ID;

const serverEnvDefine = {
  ...(serverSupabaseUrl ? { "process.env.SUPABASE_URL": JSON.stringify(serverSupabaseUrl) } : {}),
  ...(serverSupabaseKey ? { "process.env.SUPABASE_PUBLISHABLE_KEY": JSON.stringify(serverSupabaseKey) } : {}),
  ...(serverSupabaseProjectId ? { "process.env.SUPABASE_PROJECT_ID": JSON.stringify(serverSupabaseProjectId) } : {}),
};

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  ...(isNetlify ? { nitro: { preset: "netlify" } } : {}),
  vite: {
    plugins: [mcpPlugin()],
    define: {
      ...hostEnvDefine,
      ...serverEnvDefine,
    },
  },
});
