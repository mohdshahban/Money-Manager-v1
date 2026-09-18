import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, BarChart3, Edit3, FileText, LayoutList, Pencil, ReceiptText, Search, Star, Table2, Trash2, Users, WalletCards, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjects, useTransactions, useCategories, useAccounts, useMutateEntity, useSoftDeleteTx, type Project, type Transaction } from "@/hooks/useFinance";
import { useProfile } from "@/hooks/useProfile";
import { formatCurrency } from "@/lib/format";
import { TransactionDialog } from "@/components/app/TransactionDialog";
import { TransactionCollection, type TransactionViewMode } from "@/components/app/TransactionCollection";
import { ReceiptIndicator } from "@/components/app/ReceiptIndicator";
import { TeamProjectView } from "@/components/app/TeamProjectView";
import { toast } from "sonner";
import { endOfDay, endOfMonth, endOfWeek, format, startOfDay, startOfMonth, startOfWeek } from "date-fns";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({ component: ProjectDetail });

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const nav = useNavigate();
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "USD";
  const { data: projects = [] } = useProjects();
  const { data: txs = [] } = useTransactions();
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const { update: updateProject, remove: removeProject } = useMutateEntity<Project>("projects", ["projects"]);
  const softDeleteTx = useSoftDeleteTx();
  const { update: updateTx } = useMutateEntity<Transaction>("transactions", ["transactions"]);

  const [editOpen, setEditOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [txOpen, setTxOpen] = useState(false);
  const [view, setView] = useState<TransactionViewMode>("list");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [payFilter, setPayFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const project = projects.find((p) => p.id === projectId);
  const projectTxs = useMemo(() => txs.filter((tx) => tx.project_id === projectId), [txs, projectId]);
  const rootCats = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);
  const payModes = useMemo(() => Array.from(new Set(projectTxs.map((t) => t.payment_method).filter(Boolean) as string[])).sort(), [projectTxs]);
  const allTags = useMemo(() => Array.from(new Set(projectTxs.flatMap((t) => t.tags ?? []))).sort(), [projectTxs]);

  const dateBounds = useMemo(() => {
    const now = new Date();
    if (dateRange === "today") return { from: startOfDay(now), to: endOfDay(now) };
    if (dateRange === "week") return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    if (dateRange === "month") return { from: startOfMonth(now), to: endOfMonth(now) };
    if (dateRange === "custom") return { from: customFrom ? startOfDay(new Date(customFrom)) : null, to: customTo ? endOfDay(new Date(customTo)) : null };
    return { from: null as Date | null, to: null as Date | null };
  }, [dateRange, customFrom, customTo]);

  const filteredTxs = useMemo(() => projectTxs.filter((t) => {
    if (catFilter !== "all") {
      const c = categories.find((x) => x.id === t.category_id);
      if ((c?.parent_id ?? c?.id ?? null) !== catFilter) return false;
    }
    if (payFilter !== "all" && (t.payment_method ?? "") !== payFilter) return false;
    if (tagFilter !== "all" && !(t.tags ?? []).includes(tagFilter)) return false;
    if (dateBounds.from && new Date(t.occurred_at) < dateBounds.from) return false;
    if (dateBounds.to && new Date(t.occurred_at) > dateBounds.to) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const cat = categories.find((c) => c.id === t.category_id)?.name ?? "";
      const acc = accounts.find((a) => a.id === t.account_id)?.name ?? "";
      if (![t.vendor, t.notes, cat, acc, (t.tags ?? []).join(" "), String(t.amount)].join(" ").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [projectTxs, catFilter, payFilter, tagFilter, dateBounds, search, categories, accounts]);

  const stats = useMemo(() => {
    let spent = 0, received = 0;
    const byCategory = new Map<string, number>();
    const bySub = new Map<string, Map<string, number>>();
    const byTag = new Map<string, number>();
    for (const tx of projectTxs) {
      if (tx.type === "expense") {
        const amount = Number(tx.amount);
        spent += amount;
        const cat = categories.find((c) => c.id === tx.category_id);
        const rootId = cat?.parent_id ?? cat?.id ?? "uncat";
        byCategory.set(rootId, (byCategory.get(rootId) ?? 0) + amount);
        const subId = cat?.parent_id ? cat.id : "__direct";
        const subMap = bySub.get(rootId) ?? new Map<string, number>();
        subMap.set(subId, (subMap.get(subId) ?? 0) + amount);
        bySub.set(rootId, subMap);
        if ((tx.tags ?? []).length === 0) byTag.set("untagged", (byTag.get("untagged") ?? 0) + amount);
        else (tx.tags ?? []).forEach((tag) => byTag.set(tag, (byTag.get(tag) ?? 0) + amount));
      } else if (tx.type === "income") received += Number(tx.amount);
    }
    return { spent, received, byCategory, bySub, byTag };
  }, [projectTxs, categories]);

  if (!project) {
    return <div className="grid place-items-center py-20 text-center"><p className="text-muted-foreground">Project not found.</p><Link to="/projects" className="mt-3 text-sm text-primary underline">Back to projects</Link></div>;
  }

  const quoted = Number(project.quoted_amount) || 0;
  const budget = Number(project.budget) || 0;
  const outstanding = quoted - stats.received;
  const projectedMargin = quoted - stats.spent;
  const actualCashMargin = stats.received - stats.spent;
  const budgetBase = budget > 0 ? budget : quoted;
  const budgetPct = budgetBase > 0 ? Math.min(100, (stats.spent / budgetBase) * 100) : 0;
  const statusTone = project.status === "active" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : project.status === "completed" ? "bg-blue-500/10 text-blue-600 border-blue-500/30" : project.status === "on_hold" ? "bg-amber-500/10 text-amber-600 border-amber-500/30" : project.status === "cancelled" ? "bg-destructive/10 text-destructive border-destructive/30" : "bg-muted text-muted-foreground border-border";
  const activeFilters = [catFilter !== "all", payFilter !== "all", tagFilter !== "all", dateRange !== "all", !!search].filter(Boolean).length;
  const clearFilters = () => { setSearch(""); setCatFilter("all"); setPayFilter("all"); setTagFilter("all"); setDateRange("all"); setCustomFrom(""); setCustomTo(""); };
  const paymentTxs = projectTxs.filter((t) => t.type === "income");
  const receiptTxs = projectTxs.filter((t) => !!t.receipt_path);

  const txProps = {
    categories,
    accounts,
    projects,
    currency,
    view,
    onEdit: (tx: Transaction) => { setEditingTx(tx); setTxOpen(true); },
    onDelete: (tx: Transaction) => softDeleteTx.mutate(tx.id),
    onFavorite: (tx: Transaction) => updateTx.mutate({ id: tx.id, favorite: !tx.favorite }),
    onTagClick: (tag: string) => setTagFilter(tag),
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-3">
        <Link to="/projects" className="grid h-9 w-9 place-items-center rounded-full border bg-card hover:bg-muted"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-bold tracking-tight md:text-3xl">{project.name}</h1>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusTone}`}>{project.status.replace("_", " ")}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{project.client_name || "No client name"}{project.site_address ? ` · ${project.site_address}` : ""}</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => setEditOpen(true)}><Edit3 className="h-4 w-4" /></Button>
        <Button variant="outline" size="icon" onClick={async () => { if (!confirm("Delete this project? Existing transactions will remain.")) return; await removeProject.mutateAsync(project.id); toast.success("Project deleted"); nav({ to: "/projects" }); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </div>

      <Tabs defaultValue="overview" className="grid gap-4">
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-2xl border bg-card p-1 sm:w-fit">
          <TabsTrigger value="overview" className="gap-1.5"><WalletCards className="h-4 w-4" /> Overview</TabsTrigger>
          <TabsTrigger value="transactions" className="gap-1.5"><FileText className="h-4 w-4" /> Transactions</TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5"><Users className="h-4 w-4" /> Team</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5"><BarChart3 className="h-4 w-4" /> Analytics</TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5"><WalletCards className="h-4 w-4" /> Payments</TabsTrigger>
          <TabsTrigger value="receipts" className="gap-1.5"><ReceiptText className="h-4 w-4" /> Files & receipts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0 grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Quoted" value={formatCurrency(quoted, currency)} />
            <StatCard label="Received" value={formatCurrency(stats.received, currency)} tone="pos" />
            <StatCard label="Spent" value={formatCurrency(stats.spent, currency)} tone="neg" />
            <StatCard label="Outstanding" value={formatCurrency(outstanding, currency)} tone={outstanding > 0 ? "neg" : "pos"} />
            <StatCard label="Projected margin" value={formatCurrency(projectedMargin, currency)} tone={projectedMargin >= 0 ? "pos" : "neg"} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
              <div className="flex items-center justify-between gap-3">
                <div><h3 className="font-semibold">Budget progress</h3><p className="text-xs text-muted-foreground">{budget > 0 ? "Internal project budget" : "Quote consumed by expenses"}</p></div>
                <p className="text-sm font-semibold tabular-nums">{budgetPct.toFixed(0)}%</p>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all" style={{ width: `${budgetPct}%`, background: budgetPct > 90 ? "hsl(var(--destructive))" : "var(--gradient-primary)" }} /></div>
              <div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{formatCurrency(stats.spent, currency)} spent</span><span>{formatCurrency(budgetBase, currency)} target</span></div>
            </div>
            <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Cash position</p>
              <p className={`mt-2 text-2xl font-semibold tabular-nums ${actualCashMargin >= 0 ? "text-[color:var(--success)]" : "text-primary"}`}>{formatCurrency(actualCashMargin, currency)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Received minus expenses to date</p>
            </div>
          </div>

          {(project.notes || project.start_date || project.end_date) && (
            <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
              <h3 className="mb-3 font-semibold">Project details</h3>
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <div><p className="text-xs text-muted-foreground">Start date</p><p className="mt-1 font-medium">{project.start_date ? format(new Date(project.start_date), "dd MMM yyyy") : "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">End date</p><p className="mt-1 font-medium">{project.end_date ? format(new Date(project.end_date), "dd MMM yyyy") : "—"}</p></div>
                <div className="sm:col-span-3"><p className="text-xs text-muted-foreground">Notes</p><p className="mt-1 whitespace-pre-wrap">{project.notes || "—"}</p></div>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="transactions" className="mt-0 grid gap-4">
          <div className="sticky top-0 z-20 rounded-2xl border bg-background/92 p-3 shadow-[var(--shadow-soft)] backdrop-blur-xl lg:top-2">
            <div className="grid gap-2 xl:grid-cols-[minmax(260px,1.5fr)_repeat(4,minmax(150px,0.75fr))_auto]">
              <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search vendor, note, tag or amount…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <Select value={catFilter} onValueChange={setCatFilter}><SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{rootCats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
              <Select value={payFilter} onValueChange={setPayFilter}><SelectTrigger><SelectValue placeholder="All payment modes" /></SelectTrigger><SelectContent><SelectItem value="all">All payment modes</SelectItem>{payModes.map((mode) => <SelectItem key={mode} value={mode}>{mode}</SelectItem>)}</SelectContent></Select>
              <Select value={tagFilter} onValueChange={setTagFilter}><SelectTrigger><SelectValue placeholder="All tags" /></SelectTrigger><SelectContent><SelectItem value="all">All tags</SelectItem>{allTags.map((tag) => <SelectItem key={tag} value={tag}>#{tag}</SelectItem>)}</SelectContent></Select>
              <Select value={dateRange} onValueChange={setDateRange}><SelectTrigger><SelectValue placeholder="All dates" /></SelectTrigger><SelectContent><SelectItem value="all">All dates</SelectItem><SelectItem value="today">Today</SelectItem><SelectItem value="week">This week</SelectItem><SelectItem value="month">This month</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectContent></Select>
              {activeFilters > 0 ? <Button variant="ghost" size="sm" className="gap-1.5" onClick={clearFilters}><X className="h-4 w-4" /> Clear {activeFilters}</Button> : <div />}
            </div>
            {dateRange === "custom" && <div className="mt-2 grid max-w-md grid-cols-2 gap-2"><Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /><Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></div>}
          </div>
          <div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">{filteredTxs.length} of {projectTxs.length} project transactions</p><div className="flex rounded-xl border bg-card p-1"><Button size="sm" variant={view === "list" ? "secondary" : "ghost"} className="h-8 gap-1.5" onClick={() => setView("list")}><LayoutList className="h-4 w-4" /> List</Button><Button size="sm" variant={view === "table" ? "secondary" : "ghost"} className="h-8 gap-1.5" onClick={() => setView("table")}><Table2 className="h-4 w-4" /> Table</Button></div></div>
          <TransactionCollection transactions={filteredTxs} {...txProps} emptyMessage="No project transactions match these filters." />
        </TabsContent>

        <TabsContent value="team" className="mt-0">\n          <TeamProjectView projectId={projectId} />\n        </TabsContent>\n\n        <TabsContent value="team" className="mt-0">
          <TeamProjectView projectId={projectId} />
        </TabsContent>

        <TabsContent value="analytics" className="mt-0 grid gap-4 xl:grid-cols-2">
          <BreakdownCard title="Spend by category">
            {stats.byCategory.size === 0 ? <Empty text="No expenses yet." /> : [...stats.byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([catId, amount]) => {
              const cat = categories.find((c) => c.id === catId);
              const pct = stats.spent > 0 ? (amount / stats.spent) * 100 : 0;
              const subs = [...(stats.bySub.get(catId) ?? new Map()).entries()].filter(([id]) => id !== "__direct").sort((a, b) => (b[1] as number) - (a[1] as number));
              return <div key={catId} className="grid gap-1.5"><div className="flex justify-between gap-3 text-sm"><span className="flex items-center gap-2 font-medium"><span className="h-2.5 w-2.5 rounded-full" style={{ background: cat?.color ?? "#64748B" }} />{cat?.name ?? "Uncategorised"}</span><span className="tabular-nums text-muted-foreground">{formatCurrency(amount, currency)} · {pct.toFixed(0)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: cat?.color ?? "var(--gradient-primary)" }} /></div>{subs.length > 0 && <div className="ml-4 grid gap-1 border-l pl-3">{subs.map(([id, subAmount]) => <div key={id as string} className="flex justify-between text-xs text-muted-foreground"><span>{categories.find((c) => c.id === id)?.name ?? "Other"}</span><span>{formatCurrency(subAmount as number, currency)}</span></div>)}</div>}</div>;
            })}
          </BreakdownCard>
          <BreakdownCard title="Spend by tag">
            {stats.byTag.size === 0 ? <Empty text="No tagged expenses yet." /> : [...stats.byTag.entries()].sort((a, b) => b[1] - a[1]).map(([tag, amount]) => { const pct = stats.spent > 0 ? (amount / stats.spent) * 100 : 0; return <button type="button" key={tag} onClick={() => tag !== "untagged" && setTagFilter(tag)} className="grid gap-1.5 rounded-xl p-2 text-left hover:bg-muted/50"><div className="flex justify-between gap-3 text-sm"><span className="font-medium text-primary">{tag === "untagged" ? "Untagged" : `#${tag}`}</span><span className="tabular-nums text-muted-foreground">{formatCurrency(amount, currency)} · {pct.toFixed(0)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--gradient-primary)" }} /></div></button>; })}
          </BreakdownCard>
        </TabsContent>

        <TabsContent value="payments" className="mt-0 grid gap-4">
          <div className="grid gap-3 sm:grid-cols-3"><StatCard label="Quoted" value={formatCurrency(quoted, currency)} /><StatCard label="Received" value={formatCurrency(stats.received, currency)} tone="pos" /><StatCard label="Outstanding" value={formatCurrency(outstanding, currency)} tone={outstanding > 0 ? "neg" : "pos"} /></div>
          <TransactionCollection transactions={paymentTxs} {...txProps} emptyMessage="No payments received for this project yet." />
        </TabsContent>

        <TabsContent value="receipts" className="mt-0 grid gap-4">
          <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]"><h3 className="font-semibold">Receipts & attachments</h3><p className="mt-1 text-sm text-muted-foreground">Every transaction with an uploaded receipt is collected here.</p></div>
          {receiptTxs.length === 0 ? <Empty text="No receipts are attached to this project yet." /> : <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{receiptTxs.map((tx) => <div key={tx.id} className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{tx.vendor || tx.notes || "Transaction receipt"}</p><p className="mt-1 text-xs text-muted-foreground">{format(new Date(tx.occurred_at), "dd MMM yyyy, HH:mm")}</p></div><p className="text-sm font-semibold tabular-nums">{formatCurrency(Number(tx.amount), currency)}</p></div><div className="mt-3"><ReceiptIndicator receiptPath={tx.receipt_path} /></div><div className="mt-2 flex justify-end"><Button variant="ghost" size="sm" className="gap-1.5" onClick={() => { setEditingTx(tx); setTxOpen(true); }}><Pencil className="h-3.5 w-3.5" /> Edit transaction</Button></div></div>)}</div>}
        </TabsContent>
      </Tabs>

      <TransactionDialog open={txOpen} onOpenChange={(next) => { setTxOpen(next); if (!next) setEditingTx(null); }} editing={editingTx} />
      <EditProjectDialog open={editOpen} onOpenChange={setEditOpen} project={project} onSave={async (patch) => { await updateProject.mutateAsync({ id: project.id, ...patch }); toast.success("Project updated"); }} />
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-1 text-lg font-semibold tabular-nums ${tone === "pos" ? "text-[color:var(--success)]" : tone === "neg" ? "text-primary" : ""}`}>{value}</p></div>;
}

function BreakdownCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]"><h3 className="mb-4 font-semibold">{title}</h3><div className="grid gap-4">{children}</div></div>;
}

function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">{text}</div>; }

function EditProjectDialog({ open, onOpenChange, project, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; project: Project; onSave: (patch: Partial<Project>) => Promise<void> }) {
  const [form, setForm] = useState({ name: project.name, client_name: project.client_name ?? "", site_address: project.site_address ?? "", quoted_amount: String(project.quoted_amount ?? ""), budget: String(project.budget ?? ""), status: project.status, notes: project.notes ?? "" });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Edit project</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>Client</Label><Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></div><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as Project["status"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["planning", "active", "on_hold", "completed", "cancelled"].map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div></div>
          <div className="grid gap-2"><Label>Site address</Label><Input value={form.site_address} onChange={(e) => setForm({ ...form, site_address: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>Quoted amount</Label><Input type="number" value={form.quoted_amount} onChange={(e) => setForm({ ...form, quoted_amount: e.target.value })} /></div><div className="grid gap-2"><Label>Budget</Label><Input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></div></div>
          <div className="grid gap-2"><Label>Notes</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={async () => { await onSave({ name: form.name, client_name: form.client_name || null, site_address: form.site_address || null, quoted_amount: parseFloat(form.quoted_amount) || 0, budget: parseFloat(form.budget) || 0, status: form.status, notes: form.notes || null }); onOpenChange(false); }}>Save</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
