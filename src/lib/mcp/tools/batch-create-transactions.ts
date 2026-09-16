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
  name: "batch_create_transactions",
  title: "Batch create transactions",
  description:
    "Create multiple income/expense transactions in a single call. Useful when extracting many rows from a receipt or screenshot.",
  inputSchema: {
    transactions: z
      .array(
        z.object({
          type: z.enum(["income", "expense"]).describe("Transaction type."),
          amount: z.number().positive().describe("Positive amount."),
          account_id: z.string().uuid().describe("Account this transaction belongs to."),
          category_id: z.string().uuid().optional(),
          project_id: z.string().uuid().optional(),
          note: z.string().max(500).optional().describe("Free-text note stored on the transaction."),
          occurred_at: z.string().optional().describe("ISO date/time (defaults to now)."),
        }),
      )
      .min(1)
      .max(100)
      .describe("Array of transactions to insert (1-100)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const userId = ctx.getUserId();
    const now = new Date().toISOString();
    const rows = input.transactions.map((t) => ({
      user_id: userId,
      type: t.type,
      amount: t.amount,
      account_id: t.account_id,
      category_id: t.category_id ?? null,
      project_id: t.project_id ?? null,
      notes: t.note ?? null,
      occurred_at: t.occurred_at ?? now,
    }));
    const { data, error } = await db(ctx).from("transactions").insert(rows).select();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created ${data?.length ?? 0} transactions` }],
      structuredContent: { transactions: data },
    };
  },
});