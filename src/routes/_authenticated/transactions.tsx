import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { Search, Trash2, Pencil, Star, Download, X } from "lucide-react";
import { useTransactions, useAccounts, useCategories, useProjects, useSoftDeleteTx, useMutateEntity, type Transaction } from "@/hooks/useFinance";
import { useProfile } from "@/hooks/useProfile";
import { formatCurrency } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TransactionDialog } from "@/components/app/TransactionDialog";
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
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [payFilter, setPayFilter] = useState<string>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [minAmt, setMinAmt] = useState<string>("");
  const [maxAmt, setMaxAmt] = useState<string>("");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [open, setOpen] = useState(false);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    txs.forEach((t) => (t.tags ?? []).forEach((tag) => s.add(tag)));
    return Array.from(s).sort();
  }, [txs]);

  const payModes = useMemo(() => {
    const s = new Set<string>();
    txs.forEach((t) => { if (t.payment_method) s.add(t.payment_method); });
    return Array.from(s).sort();
  }, [txs]);

  const rootCats = useMemo(() => cats.filter((c) => !c.parent_id), [cats]);

  const dateBounds = useMemo(() => {
    const now = new Date();
    if (dateRange === "today") return { from: startOfDay(now), to: endOfDay(now) };
    if (dateRange === "week") return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    if (dateRange === "month") return { from: startOfMonth(now), to: endOfMonth(now) };
    if (dateRange === "custom") {
      return {
        from: customFrom ? startOfDay(new Date(customFrom)) : null,
        to: customTo ? endOfDay(new Date(customTo)) : null,
      };
    }
    return { from: null as Date | null, to: null as Date | null };
  }, [dateRange, customFrom, customTo]);

  const filtered = useMemo(() => {
    const min = parseFloat(minAmt);
    const max = parseFloat(maxAmt);
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
      if (!q) return true;
      const cat = cats.find((c) => c.id === t.category_id)?.name ?? "";
      const acc = accounts.find((a) => a.id === t.account_id)?.name ?? "";
      const hay = [t.vendor, t.notes, cat, acc, String(t.amount), (t.tags ?? []).join(" ")].join(" ").toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [txs, q, typeFilter, tagFilter, projectFilter, payFilter, catFilter, dateBounds, minAmt, maxAmt, cats, accounts]);

  const activeCount =
    (typeFilter !== "all" ? 1 : 0) +
    (tagFilter !== "all" ? 1 : 0) +
    (projectFilter !== "all" ? 1 : 0) +
    (payFilter !== "all" ? 1 : 0) +
    (catFilter !== "all" ? 1 : 0) +
    (dateRange !== "all" ? 1 : 0) +
    (minAmt || maxAmt ? 1 : 0) +
    (q ? 1 : 0);

  const clearAll = () => {
    setQ(""); setTypeFilter("all"); setTagFilter("all"); setProjectFilter("all");
    setPayFilter("all"); setCatFilter("all"); setDateRange("all");
    setCustomFrom(""); setCustomTo(""); setMinAmt(""); setMaxAmt("");
  };

  const grouped = useMemo(() => {
    const g = new Map<string, Transaction[]>();
    filtered.forEach((t) => {
      const k = format(new Date(t.occurred_at), "yyyy-MM-dd");
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(t);
    });
    return Array.from(g.entries());
  }, [filtered]);

  const fIncome = filtered.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const fExpense = filtered.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const summaryLabel = activeCount > 0 ? "filtered" : "all-time";

  const doExport = async (fmt: "csv" | "xlsx" | "pdf") => {
    if (filtered.length === 0) return toast.info("Nothing to export");
    try {
      if (fmt === "csv") exportCSV(filtered, cats, accounts);
      else if (fmt === "xlsx") await exportExcel(filtered, cats, accounts);
      else await exportPDF(filtered, cats, accounts, currency);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Transactions</h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-4 w-4" /> Export</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => doExport("csv")}>CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={() => doExport("xlsx")}>Excel (.xlsx)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => doExport("pdf")}>PDF</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]">
          <p className="text-xs text-muted-foreground">Income · {summaryLabel}</p>
          <p className="mt-1 text-xl font-semibold text-[color:var(--success)]">{formatCurrency(fIncome, currency)}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]">
          <p className="text-xs text-muted-foreground">Expense · {summaryLabel}</p>
          <p className="mt-1 text-xl font-semibold text-primary">{formatCurrency(fExpense, currency)}</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_160px_160px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vendor, category, tag, amount…" className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger><SelectValue placeholder="All tags" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tags</SelectItem>
            {allTags.map((tg) => <SelectItem key={tg} value={tg}>#{tg}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger><SelectValue placeholder="All projects" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            <SelectItem value="__unassigned">Unassigned / General</SelectItem>
            {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {rootCats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={payFilter} onValueChange={setPayFilter}>
          <SelectTrigger><SelectValue placeholder="All payment modes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payment modes</SelectItem>
            {payModes.length === 0 && <SelectItem value="__na" disabled>None recorded</SelectItem>}
            {payModes.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger><SelectValue placeholder="All dates" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All dates</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This week</SelectItem>
            <SelectItem value="month">This month</SelectItem>
            <SelectItem value="custom">Custom range</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {dateRange === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
        <Input type="number" placeholder="Min amount" value={minAmt} onChange={(e) => setMinAmt(e.target.value)} />
        <Input type="number" placeholder="Max amount" value={maxAmt} onChange={(e) => setMaxAmt(e.target.value)} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{filtered.length} transaction{filtered.length === 1 ? "" : "s"}{activeCount > 0 ? ` · ${activeCount} filter${activeCount === 1 ? "" : "s"} active` : ""}</p>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={clearAll}>
            <X className="h-3 w-3" /> Clear all filters
          </Button>
        )}
      </div>

      {allTags.length > 0 && (
        <div className="-mt-2 flex flex-wrap gap-1.5">
          <button
            onClick={() => setTagFilter("all")}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${tagFilter === "all" ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >All</button>
          {allTags.map((tg) => (
            <button
              key={tg}
              onClick={() => setTagFilter(tg === tagFilter ? "all" : tg)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${tagFilter === tg ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >#{tg}</button>
          ))}
        </div>
      )}

      <div className="grid gap-4">
        {grouped.length === 0 && (
          <div className="rounded-3xl border bg-card p-10 text-center text-sm text-muted-foreground">No transactions yet — tap + to add one.</div>
        )}
        {grouped.map(([day, list]) => {
          const dayTotal = list.reduce((s, t) => s + (t.type === "expense" ? -Number(t.amount) : t.type === "income" ? Number(t.amount) : 0), 0);
          return (
            <motion.div key={day} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border bg-card p-4 shadow-[var(--shadow-soft)]">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">{format(new Date(day), "EEE, MMM d")}</p>
                <p className={`text-sm tabular-nums ${dayTotal >= 0 ? "text-[color:var(--success)]" : "text-primary"}`}>{dayTotal >= 0 ? "+" : ""}{formatCurrency(dayTotal, currency)}</p>
              </div>
              <ul className="grid gap-1">
                {list.map((t) => {
                  const cat = cats.find((c) => c.id === t.category_id);
                  const acc = accounts.find((a) => a.id === t.account_id);
                  const sign = t.type === "income" ? "+" : t.type === "expense" ? "−" : "";
                  const color = t.type === "income" ? "text-[color:var(--success)]" : t.type === "expense" ? "text-primary" : "text-secondary";
                  return (
                    <li key={t.id} className="group flex items-start gap-3 rounded-xl p-2 hover:bg-muted/50">
                      <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white text-xs font-semibold" style={{ background: cat?.color ?? "var(--muted-foreground)" }}>
                        {(cat?.name ?? t.type).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 break-words text-sm font-medium">{t.vendor || t.notes || cat?.name || "Transaction"}</p>
                        <p className="line-clamp-2 break-words text-xs text-muted-foreground">{cat?.name ?? t.type} · {acc?.name ?? "—"} · {format(new Date(t.occurred_at), "HH:mm")}</p>
                        {(t.tags?.length ?? 0) > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {t.tags!.map((tg) => (
                              <button
                                key={tg}
                                onClick={() => setTagFilter(tg)}
                                className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20"
                              >#{tg}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className={`shrink-0 pt-0.5 text-sm font-semibold tabular-nums ${color}`}>{sign}{formatCurrency(Number(t.amount), currency)}</p>
                      <div className="flex shrink-0 items-center gap-0.5 pt-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => update.mutate({ id: t.id, favorite: !t.favorite })} aria-label="Favorite">
                          <Star className={`h-4 w-4 ${t.favorite ? "fill-[color:var(--warning)] text-[color:var(--warning)]" : ""}`} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(t); setOpen(true); }} aria-label="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => softDelete.mutate(t.id)} aria-label="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          );
        })}
      </div>

      <TransactionDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }} editing={editing} />
    </div>
  );
}