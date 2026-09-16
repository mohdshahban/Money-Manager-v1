import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listAccounts from "./tools/list-accounts";
import listTransactions from "./tools/list-transactions";
import createTransaction from "./tools/create-transaction";
import batchCreateTransactions from "./tools/batch-create-transactions";
import listCategories from "./tools/list-categories";
import listProjects from "./tools/list-projects";
import updateTransaction from "./tools/update-transaction";
import deleteTransaction from "./tools/delete-transaction";
import projectSpendingSummary from "./tools/project-spending-summary";
import monthlySpendingSummary from "./tools/monthly-spending-summary";
import searchTransactions from "./tools/search-transactions";

// The OAuth issuer must be the direct Supabase host (see app-mcp-server-authoring).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "moneta-mcp",
  title: "Moneta — Money Manager",
  version: "0.3.0",
  instructions:
    "Tools for the signed-in Moneta user. Read, search, summarize, create, batch-create, update, and delete money-manager transactions, and access accounts, categories, and interior-design projects. Prefer project_spending_summary for project totals, monthly_spending_summary for month-level analysis, search_transactions for text/tag lookup, and batch_create_transactions to save multiple extracted expenses in one call. All calls act as the authenticated user under RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listAccounts,
    listTransactions,
    searchTransactions,
    projectSpendingSummary,
    monthlySpendingSummary,
    createTransaction,
    batchCreateTransactions,
    updateTransaction,
    deleteTransaction,
    listCategories,
    listProjects,
  ],
});
