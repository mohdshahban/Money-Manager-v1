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
  name: "delete_transaction",
  title: "Delete transaction",
  description: "Delete a transaction owned by the signed-in user. Soft-delete by default (recoverable); pass hard=true to permanently remove.",
  inputSchema: {
    id: z.string().uuid().describe("ID of the transaction to delete."),
    hard: z.boolean().optional().describe("If true, permanently delete instead of soft-delete."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const client = db(ctx);
    if (input.hard) {
      const { error } = await client.from("transactions").delete().eq("id", input.id);
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      return { content: [{ type: "text", text: `Permanently deleted transaction ${input.id}` }] };
    }
    const { data, error } = await client
      .from("transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", input.id)
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Deleted transaction ${data.id}` }],
      structuredContent: { transaction: data },
    };
  },
});