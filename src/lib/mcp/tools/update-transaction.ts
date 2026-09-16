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
  name: "update_transaction",
  title: "Update transaction",
  description: "Update fields on an existing transaction owned by the signed-in user. Only provided fields are changed.",
  inputSchema: {
    id: z.string().uuid().describe("ID of the transaction to update."),
    type: z.enum(["income", "expense"]).optional(),
    amount: z.number().positive().optional(),
    account_id: z.string().uuid().optional(),
    category_id: z.string().uuid().nullable().optional(),
    project_id: z.string().uuid().nullable().optional(),
    note: z.string().max(500).nullable().optional().describe("Free-text note stored on the transaction."),
    occurred_at: z.string().optional().describe("ISO date/time."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const patch: Record<string, unknown> = {};
    if (input.type !== undefined) patch.type = input.type;
    if (input.amount !== undefined) patch.amount = input.amount;
    if (input.account_id !== undefined) patch.account_id = input.account_id;
    if (input.category_id !== undefined) patch.category_id = input.category_id;
    if (input.project_id !== undefined) patch.project_id = input.project_id;
    if (input.note !== undefined) patch.notes = input.note;
    if (input.occurred_at !== undefined) patch.occurred_at = input.occurred_at;
    if (Object.keys(patch).length === 0) {
      return { content: [{ type: "text", text: "No fields to update" }], isError: true };
    }
    const { data, error } = await db(ctx)
      .from("transactions")
      .update(patch)
      .eq("id", input.id)
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Updated transaction ${data.id}` }],
      structuredContent: { transaction: data },
    };
  },
});