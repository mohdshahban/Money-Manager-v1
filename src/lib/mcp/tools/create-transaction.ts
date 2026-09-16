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
  name: "create_transaction",
  title: "Create transaction",
  description: "Add an income or expense transaction for the signed-in user.",
  inputSchema: {
    type: z.enum(["income", "expense"]).describe("Transaction type."),
    amount: z.number().positive().describe("Positive amount in the user's default currency."),
    account_id: z.string().uuid().describe("Account this transaction belongs to."),
    category_id: z.string().uuid().optional(),
    project_id: z.string().uuid().optional(),
    note: z.string().max(500).optional().describe("Free-text note stored on the transaction."),
    occurred_at: z.string().optional().describe("ISO date/time (defaults to now)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await db(ctx)
      .from("transactions")
      .insert({
        user_id: ctx.getUserId(),
        type: input.type,
        amount: input.amount,
        account_id: input.account_id,
        category_id: input.category_id ?? null,
        project_id: input.project_id ?? null,
        notes: input.note ?? null,
        occurred_at: input.occurred_at ?? new Date().toISOString(),
      })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created transaction ${data.id}` }],
      structuredContent: { transaction: data },
    };
  },
});