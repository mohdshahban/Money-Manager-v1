import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authError, mcpDb, toolError } from "../db";

type TxRow = {
  id: string;
  type: "income" | "expense" | "transfer";
  amount: number | string;
  category_id: string | null;
  project_id: string | null;
  occurred_at: string;
};

type CategoryRow = { id: string; name: string; parent_id: string | null };
type ProjectRow = { id: string; name: string };

function localYearMonth(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(iso));
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return year && month ? `${year}-${month}` : "";
}

function localDay(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : iso.slice(0, 10);
}

export default defineTool({
  name: "monthly_spending_summary",
  title: "Monthly spending summary",
  description: "Summarize a calendar month in the user's profile timezone with expense, income, net cash flow, category, project, and daily breakdowns. Can optionally be limited to one project.",
  inputSchema: {
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).describe("Month in YYYY-MM format, for example 2026-09."),
    project_id: z.string().uuid().optional().describe("Optional project UUID to summarize only that project."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return authError();

    try {
      const db = mcpDb(ctx);
      const [profileResult, categoryResult, projectResult] = await Promise.all([
        db.from("profiles").select("timezone,currency").maybeSingle(),
        db.from("categories").select("id,name,parent_id").eq("archived", false),
        db.from("projects").select("id,name").eq("archived", false),
      ]);

      if (profileResult.error) return toolError(profileResult.error.message);
      if (categoryResult.error) return toolError(categoryResult.error.message);
      if (projectResult.error) return toolError(projectResult.error.message);

      const timeZone = profileResult.data?.timezone || "UTC";
      const currency = profileResult.data?.currency || "USD";
      const [year, month] = input.month.split("-").map(Number);
      const broadStart = new Date(Date.UTC(year, month - 1, 1) - 24 * 60 * 60 * 1000).toISOString();
      const broadEnd = new Date(Date.UTC(year, month, 1) + 24 * 60 * 60 * 1000).toISOString();

      let txQuery = db
        .from("transactions")
        .select("id,type,amount,category_id,project_id,occurred_at")
        .is("deleted_at", null)
        .gte("occurred_at", broadStart)
        .lt("occurred_at", broadEnd)
        .order("occurred_at", { ascending: true });
      if (input.project_id) txQuery = txQuery.eq("project_id", input.project_id);

      const txResult = await txQuery;
      if (txResult.error) return toolError(txResult.error.message);

      const categories = (categoryResult.data ?? []) as CategoryRow[];
      const projects = (projectResult.data ?? []) as ProjectRow[];
      const categoryMap = new Map(categories.map((c) => [c.id, c]));
      const projectMap = new Map(projects.map((p) => [p.id, p.name]));
      const transactions = ((txResult.data ?? []) as TxRow[]).filter((tx) => localYearMonth(tx.occurred_at, timeZone) === input.month);

      let totalSpent = 0;
      let totalIncome = 0;
      const categoryTotals = new Map<string, number>();
      const projectTotals = new Map<string, number>();
      const dailyTotals = new Map<string, { spent: number; income: number }>();

      for (const tx of transactions) {
        const amount = Number(tx.amount) || 0;
        const day = localDay(tx.occurred_at, timeZone);
        const daily = dailyTotals.get(day) ?? { spent: 0, income: 0 };

        if (tx.type === "expense") {
          totalSpent += amount;
          daily.spent += amount;
          const cat = tx.category_id ? categoryMap.get(tx.category_id) : undefined;
          const parent = cat?.parent_id ? categoryMap.get(cat.parent_id) : undefined;
          const category = cat ? (parent ? `${parent.name} / ${cat.name}` : cat.name) : "Uncategorised";
          categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + amount);
          const project = tx.project_id ? projectMap.get(tx.project_id) ?? "Unknown project" : "No project";
          projectTotals.set(project, (projectTotals.get(project) ?? 0) + amount);
        } else if (tx.type === "income") {
          totalIncome += amount;
          daily.income += amount;
        }
        dailyTotals.set(day, daily);
      }

      const summary = {
        month: input.month,
        timezone: timeZone,
        currency,
        project_id: input.project_id ?? null,
        transaction_count: transactions.length,
        total_spent: totalSpent,
        total_income: totalIncome,
        net_cash_flow: totalIncome - totalSpent,
        category_breakdown: [...categoryTotals.entries()]
          .map(([category, amount]) => ({ category, amount }))
          .sort((a, b) => b.amount - a.amount),
        project_breakdown: [...projectTotals.entries()]
          .map(([project, amount]) => ({ project, amount }))
          .sort((a, b) => b.amount - a.amount),
        daily_breakdown: [...dailyTotals.entries()]
          .map(([date, totals]) => ({ date, ...totals, net: totals.income - totals.spent }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(summary) }],
        structuredContent: { summary },
      };
    } catch (error) {
      return toolError(error instanceof Error ? error.message : "Failed to build monthly spending summary");
    }
  },
});
