import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { endOfDay, endOfMonth, endOfWeek, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { Download, LayoutList, Search, Table2, X } from "lucide-react";
import { useTransactions, useAccounts, useCategories, useProjects, useSoftDeleteTx, useMutateEntity, type Transaction } from "@/hooks/useFinance";
import { useProfile } from "@/hooks/useProfile";
import { formatCurrency } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TransactionDialog } from "@/components/app/TransactionDialog";
import { TransactionCollection, type TransactionViewMode } from "@/components/app/TransactionCollection";
import { exportCSV, exportExcel, exportPDF } from "@/lib/exports";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/transactions")({ component: TxPage });

function TxPage() {
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "USD";
  const { data: txs = [] } = useTransactions();
  const { data: accounts = [] } = useAccounts();
  const { data: cats = [] } = useCategories();
  const { data: projects = [] } = useProjects();
  const softDelete = useSoftDeleteTx();
  const { update } = useMutateEntity<Transaction>("transactions", ["transactions"]);

  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [payFilter, setPayFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<TransactionViewMode>("list");

  const allTags = useMemo(() => Array.from(new Set(txs.flatMap((t) => t.tags ?? []))).sort(), [txs]);
  const payModes = useMemo(() => Array.from(new Set(txs.map((t) => t.payment_method).filter(Boolean) as string[])).sort(), [txs]);
  const rootCats = useMemo(() => cats.filter((c) => !c.parent_id), [cats]);

  const dateBounds = useMemo(() => {
    const now = new Date();
    if (dateRange === "today") return { from: startOfDay(now), to: endOfDay(now) };
    if (dateRange === "week") return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    if (dateRange === "month") return { from: startOfMonth(now), to: endOfMonth(now) };
    if (dateRange === "custom") return { from: customFrom ? startOfDay(new Date(customFrom)) : null, to: customTo ? endOfDay(new Date(customTo)) : null };
    return { from: null as Date | null, to: null as Date | null };
  }, [dateRange, customFrom, customTo]);

  const filtered = useMemo(() => {
    const min = parseFloat(minAmt);
    const max = parseFloat(maxAmt);
    const query = q.trim().toLowerCase();
    return txs.filter((t) => {
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (tagFilter !== "all" && !(t.tags ?? []).includes(tagFilter)) return false;
      if (projectFilter !== "all") {
        if (projectFilter === "__unassigned") { if (t.project_id) return false; }
        else if (t.project_id !== projectFilter) return false;
      }
      if (payFilter !== "all" && (t.payment_method ?? "") !== payFilter) return false;
      if (catFilter !== "all") {
        const c = cats.find((x) => x.id === t.category_id);
        const root = c?.parent_id ?? c?.id ?? null;
        if (root !== catFilter) return false;
      }
      if (dateBounds.from && new Date(t.occurred_at) < dateBounds.from) return false;
      if (dateBounds.to && new Date(t.occurred_at) > dateBounds.to) return false;
      if (!Number.isNaN(min) && Number(t.amount) < min) return false;
      if (!Number.isNaN(max) && Number(t.amount) > max) return false;
      if (!query) return true;
      const cat = cats.find((c) => c.id === t.category_id)?.name ?? "";
      const acc = accounts.find((a) => a.id === t.account_id)?.name ?? "";
      const project = projects.find((p) => p.id === t.project_id)?.name ?? "";
      return [t.vendor, t.notes, cat, acc, project, String(t.amount), (t.tags ?? []).join(" ")].join(" ").toLowerCase().includes(query);
    });
  }, [txs, q, typeFilter, tagFilter, projectFilter, payFilter, catFilter, dateBounds, minAmt, maxAmt, cats, accounts, projects]);

  const activeCount = [typeFilter !== "all", tagFilter !== "all", projectFilter !== "all", payFilter !== "all", catFilter !== "all", dateRange !== "all", !!(minAmt || maxAmt), !!q].filter(Boolean).length;
  const fIncome = filtered.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const fExpense = filtered.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const net = fIncome - fExpense;
  const summaryLabel = activeCount > 0 ? "filtered" : "all-time";

  const clearAll = () => {
    setQ(""); setTypeFilter("all"); setTagFilter("all"); setProjectFilter("all"); setPayFilter("all"); setCatFilter("all");
    setDateRange("all"); setCustomFrom(""); setCustomTo(""); setMinAmt(""); setMaxAmt("");
  };

  const doExport = async (fmt: "csv" | "xlsx" | "pdf") => {
    if (filtered.length === 0) return toast.info("Nothing to export");
    try {
      if (fmt === "csv") exportCSV(filtered, cats, accounts);
      else if (fmt === "xlsx") await exportExcel(filtered, cats, accounts);
      else await exportPDF(filtered, cats, accounts, currency);
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Money activity</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Transactions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Search, filter and edit every payment from one place.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden rounded-xl border bg-card p-1 md:flex">
            <Button type="button" variant={view === "list" ? "secondary" : "ghost"} size="sm" className="h-8 gap-1.5" onClick={() => setView("list")}><LayoutList className="h-4 w-4" /> List</Button>
            <Button type="button" variant={view === "table" ? "secondary" : "ghost"} size="sm" className="h-8 gap-1.5" onClick={() => setView("table")}><Table2 className="h-4 w-4" /> Table</Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1.5"><Download className="h-4 w-4" /> Export</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => doExport("csv")}>CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("xlsx")}>Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("pdf")}>PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label={`Income · ${summaryLabel}`} value={formatCurrency(fIncome, currency)} tone="success" />
        <SummaryCard label={`Expense · ${summaryLabel}`} value={formatCurrency(fExpense, currency)} tone="primary" />
        <SummaryCard label={`Net · ${summaryLabel}`} value={formatCurrency(net, currency)} tone={net >= 0 ? "success" : "primary"} />
      </div>

      <div className="sticky top-0 z-20 -mx-2 rounded-2xl border bg-background/92 p-3 shadow-[var(--shadow-soft)] backdrop-blur-xl lg:top-2">
        <div className="grid gap-2 xl:grid-cols-[minmax(260px,1.5fr)_repeat(4,minmax(150px,0.75fr))]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vendor, project, category, tag, amount…" className="pl-9" />
          </div>
          <Select value={projectFilter} onValueChange={setProjectFilter}><SelectTrigger><SelectValue placeholder="All projects" /></SelectTrigger><SelectContent><SelectItem value="all">All projects</SelectItem><SelectItem value="__unassigned">Unassigned / General</SelectItem>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem><SelectItem value="income">Income</SelectItem><SelectItem value="expense">Expense</SelectItem><SelectItem value="transfer">Transfer</SelectItem></SelectContent></Select>
          <Select value={catFilter} onValueChange={setCatFilter}><SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{rootCats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
          <Select value={dateRange} onValueChange={setDateRange}><SelectTrigger><SelectValue placeholder="All dates" /></SelectTrigger><SelectContent><SelectItem value="all">All dates</SelectItem><SelectItem value="today">Today</SelectItem><SelectItem value="week">This week</SelectItem><SelectItem value="month">This month</SelectItem><SelectItem value="custom">Custom range</SelectItem></SelectContent></Select>
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(150px,1fr))_auto]">
          <Select value={tagFilter} onValueChange={setTagFilter}><SelectTrigger><SelectValue placeholder="All tags" /></SelectTrigger><SelectContent><SelectItem value="all">All tags</SelectItem>{allTags.map((tag) => <SelectItem key={tag} value={tag}>#{tag}</SelectItem>)}</SelectContent></Select>
          <Select value={payFilter} onValueChange={setPayFilter}><SelectTrigger><SelectValue placeholder="All payment modes" /></SelectTrigger><SelectContent><SelectItem value="all">All payment modes</SelectItem>{payModes.map((mode) => <SelectItem key={mode} value={mode}>{mode}</SelectItem>)}</SelectContent></Select>
          <Input type="number" placeholder="Min amount" value={minAmt} onChange={(e) => setMinAmt(e.target.value)} />
          <Input type="number" placeholder="Max amount" value={maxAmt} onChange={(e) => setMaxAmt(e.target.value)} />
          {activeCount > 0 ? <Button variant="ghost" size="sm" className="gap-1.5 self-center" onClick={clearAll}><X className="h-4 w-4" /> Clear {activeCount}</Button> : <div />}
        </div>

        {dateRange === "custom" && (
          <div className="mt-2 grid max-w-md grid-cols-2 gap-2">
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{filtered.length} transaction{filtered.length === 1 ? "" : "s"}{activeCount ? ` · ${activeCount} active filter${activeCount === 1 ? "" : "s"}` : ""}</p>
        <div className="flex items-center gap-1 md:hidden">
          <Button variant={view === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setView("list")}><LayoutList className="h-4 w-4" /></Button>
          <Button variant={view === "table" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setView("table")}><Table2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <TransactionCollection
        transactions={filtered}
        categories={cats}
        accounts={accounts}
        projects={projects}
        currency={currency}
        view={view}
        emptyMessage="No transactions match these filters."
        onEdit={(tx) => { setEditing(tx); setOpen(true); }}
        onDelete={(tx) => softDelete.mutate(tx.id)}
        onFavorite={(tx) => update.mutate({ id: tx.id, favorite: !tx.favorite })}
        onTagClick={(tag) => setTagFilter(tag)}
      />

      <TransactionDialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setEditing(null); }} editing={editing} />
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: "success" | "primary" }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone === "success" ? "text-[color:var(--success)]" : "text-primary"}`}>{value}</p>
    </div>
  );
}
