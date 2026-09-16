import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function db(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_transactions",
  title: "List transactions",
  description: "List the signed-in user's recent transactions with optional filters (type, date range, project).",
  inputSchema: {
    limit: z.number().int().min(1).max(200).optional().describe("Max rows (default 50)."),
    type: z.enum(["income", "expense", "transfer"]).optional(),
    from: z.string().optional().describe("ISO date lower bound (inclusive)."),
    to: z.string().optional().describe("ISO date upper bound (inclusive)."),
    project_id: z.string().uuid().optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = db(ctx).from("transactions").select("*").order("occurred_at", { ascending: false }).limit(input.limit ?? 50);
    if (input.type) q = q.eq("type", input.type);
    if (input.from) q = q.gte("occurred_at", input.from);
    if (input.to) q = q.lte("occurred_at", input.to);
    if (input.project_id) q = q.eq("project_id", input.project_id);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { transactions: data ?? [] },
    };
  },
});