import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authError, mcpDb, toolError } from "../db";

type TxRow = {
  id: string;
  type: "income" | "expense" | "transfer";
  amount: number | string;
  account_id: string | null;
  category_id: string | null;
  project_id: string | null;
  vendor: string | null;
  notes: string | null;
  payment_method: string | null;
  tags: string[] | null;
  receipt_path: string | null;
  occurred_at: string;
};

export default defineTool({
  name: "search_transactions",
  title: "Search transactions",
  description: "Search the signed-in user's active transactions by text, tag, type, project, or date range and return human-readable account/category/project names.",
  inputSchema: {
    text: z.string().max(200).optional().describe("Case-insensitive text to match against vendor, notes, payment method, and tags."),
    tag: z.string().max(100).optional().describe("Exact tag to match, without the # prefix."),
    type: z.enum(["income", "expense", "transfer"]).optional(),
    project_id: z.string().uuid().optional(),
    from: z.string().optional().describe("Optional ISO date/time lower bound (inclusive)."),
    to: z.string().optional().describe("Optional ISO date/time upper bound (inclusive)."),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum results to return. Defaults to 25."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return authError();

    try {
      const db = mcpDb(ctx);
      let txQuery = db
        .from("transactions")
        .select("id,type,amount,account_id,category_id,project_id,vendor,notes,payment_method,tags,receipt_path,occurred_at")
        .is("deleted_at", null)
        .order("occurred_at", { ascending: false })
        .limit(1000);
      if (input.type) txQuery = txQuery.eq("type", input.type);
      if (input.project_id) txQuery = txQuery.eq("project_id", input.project_id);
      if (input.from) txQuery = txQuery.gte("occurred_at", input.from);
      if (input.to) txQuery = txQuery.lte("occurred_at", input.to);

      const [txResult, categoryResult, accountResult, projectResult] = await Promise.all([
        txQuery,
        db.from("categories").select("id,name,parent_id").eq("archived", false),
        db.from("accounts").select("id,name").eq("archived", false),
        db.from("projects").select("id,name").eq("archived", false),
      ]);

      if (txResult.error) return toolError(txResult.error.message);
      if (categoryResult.error) return toolError(categoryResult.error.message);
      if (accountResult.error) return toolError(accountResult.error.message);
      if (projectResult.error) return toolError(projectResult.error.message);

      const categoryRows = (categoryResult.data ?? []) as Array<{ id: string; name: string; parent_id: string | null }>;
      const categoryMap = new Map(categoryRows.map((c) => [c.id, c]));
      const accountMap = new Map(((accountResult.data ?? []) as Array<{ id: string; name: string }>).map((a) => [a.id, a.name]));
      const projectMap = new Map(((projectResult.data ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));
      const text = input.text?.trim().toLowerCase();
      const exactTag = input.tag?.trim().replace(/^#/, "").toLowerCase();

      const filtered = ((txResult.data ?? []) as TxRow[]).filter((tx) => {
        const tags = tx.tags ?? [];
        if (exactTag && !tags.some((tag) => tag.toLowerCase() === exactTag)) return false;
        if (text) {
          const haystack = [tx.vendor, tx.notes, tx.payment_method, ...tags].filter(Boolean).join(" ").toLowerCase();
          if (!haystack.includes(text)) return false;
        }
        return true;
      });

      const results = filtered.slice(0, input.limit ?? 25).map((tx) => {
        const category = tx.category_id ? categoryMap.get(tx.category_id) : undefined;
        const parent = category?.parent_id ? categoryMap.get(category.parent_id) : undefined;
        return {
          id: tx.id,
          type: tx.type,
          amount: Number(tx.amount) || 0,
          occurred_at: tx.occurred_at,
          vendor: tx.vendor,
          notes: tx.notes,
          payment_method: tx.payment_method,
          tags: tx.tags ?? [],
          receipt_attached: Boolean(tx.receipt_path),
          account: tx.account_id ? accountMap.get(tx.account_id) ?? null : null,
          category: category ? (parent ? `${parent.name} / ${category.name}` : category.name) : null,
          project: tx.project_id ? projectMap.get(tx.project_id) ?? null : null,
          project_id: tx.project_id,
        };
      });

      const response = {
        result_count: results.length,
        matched_before_limit: filtered.length,
        filters: {
          text: input.text ?? null,
          tag: input.tag ?? null,
          type: input.type ?? null,
          project_id: input.project_id ?? null,
          from: input.from ?? null,
          to: input.to ?? null,
        },
        transactions: results,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
        structuredContent: response,
      };
    } catch (error) {
      return toolError(error instanceof Error ? error.message : "Failed to search transactions");
    }
  },
});
