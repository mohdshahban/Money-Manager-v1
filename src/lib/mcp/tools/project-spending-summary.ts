import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authError, mcpDb, toolError } from "../db";

type TxRow = {
  id: string;
  type: "income" | "expense" | "transfer";
  amount: number | string;
  category_id: string | null;
  tags: string[] | null;
  occurred_at: string;
};

type CategoryRow = { id: string; name: string; parent_id: string | null };

export default defineTool({
  name: "project_spending_summary",
  title: "Project spending summary",
  description: "Summarize one project with total expenses, income, remaining quoted/budget amounts, category breakdown, tag breakdown, and transaction count. Optionally restrict to a date range.",
  inputSchema: {
    project_id: z.string().uuid().describe("Project UUID. Use list_projects first if only the project name is known."),
    from: z.string().optional().describe("Optional ISO date/time lower bound (inclusive)."),
    to: z.string().optional().describe("Optional ISO date/time upper bound (inclusive)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return authError();

    try {
      const db = mcpDb(ctx);
      const projectQuery = db
        .from("projects")
        .select("id,name,client_name,quoted_amount,budget,status")
        .eq("id", input.project_id)
        .maybeSingle();

      let txQuery = db
        .from("transactions")
        .select("id,type,amount,category_id,tags,occurred_at")
        .eq("project_id", input.project_id)
        .is("deleted_at", null)
        .order("occurred_at", { ascending: false });
      if (input.from) txQuery = txQuery.gte("occurred_at", input.from);
      if (input.to) txQuery = txQuery.lte("occurred_at", input.to);

      const categoriesQuery = db.from("categories").select("id,name,parent_id").eq("archived", false);
      const [projectResult, txResult, categoryResult] = await Promise.all([projectQuery, txQuery, categoriesQuery]);

      if (projectResult.error) return toolError(projectResult.error.message);
      if (!projectResult.data) return toolError("Project not found or not accessible");
      if (txResult.error) return toolError(txResult.error.message);
      if (categoryResult.error) return toolError(categoryResult.error.message);

      const transactions = (txResult.data ?? []) as TxRow[];
      const categories = (categoryResult.data ?? []) as CategoryRow[];
      const categoryMap = new Map(categories.map((c) => [c.id, c]));

      let totalSpent = 0;
      let totalIncome = 0;
      const categoryTotals = new Map<string, number>();
      const tagTotals = new Map<string, number>();

      for (const tx of transactions) {
        const amount = Number(tx.amount) || 0;
        if (tx.type === "expense") {
          totalSpent += amount;
          const cat = tx.category_id ? categoryMap.get(tx.category_id) : undefined;
          const parent = cat?.parent_id ? categoryMap.get(cat.parent_id) : undefined;
          const label = cat ? (parent ? `${parent.name} / ${cat.name}` : cat.name) : "Uncategorised";
          categoryTotals.set(label, (categoryTotals.get(label) ?? 0) + amount);
          const tags = tx.tags ?? [];
          if (tags.length === 0) tagTotals.set("Untagged", (tagTotals.get("Untagged") ?? 0) + amount);
          for (const tag of tags) tagTotals.set(tag, (tagTotals.get(tag) ?? 0) + amount);
        } else if (tx.type === "income") {
          totalIncome += amount;
        }
      }

      const project = projectResult.data;
      const quotedAmount = Number(project.quoted_amount) || 0;
      const budget = Number(project.budget) || 0;
      const categoryBreakdown = [...categoryTotals.entries()]
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount);
      const tagBreakdown = [...tagTotals.entries()]
        .map(([tag, amount]) => ({ tag, amount }))
        .sort((a, b) => b.amount - a.amount);

      const summary = {
        project: {
          id: project.id,
          name: project.name,
          client_name: project.client_name,
          status: project.status,
          quoted_amount: quotedAmount,
          budget,
        },
        range: { from: input.from ?? null, to: input.to ?? null },
        transaction_count: transactions.length,
        total_spent: totalSpent,
        total_income: totalIncome,
        net_cash_flow: totalIncome - totalSpent,
        quoted_remaining_after_spend: quotedAmount - totalSpent,
        budget_remaining: budget > 0 ? budget - totalSpent : null,
        category_breakdown: categoryBreakdown,
        tag_breakdown: tagBreakdown,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(summary) }],
        structuredContent: { summary },
      };
    } catch (error) {
      return toolError(error instanceof Error ? error.message : "Failed to build project spending summary");
    }
  },
});
