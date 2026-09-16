import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

export function mcpDb(ctx: ToolContext) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase server environment is not configured");
  }

  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function authError() {
  return { content: [{ type: "text" as const, text: "Not authenticated" }], isError: true as const };
}

export function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}
