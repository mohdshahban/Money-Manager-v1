import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Trash2, Edit3, X, Pencil, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProjects, useTransactions, useCategories, useAccounts, useMutateEntity, useSoftDeleteTx, type Project, type Transaction } from "@/hooks/useFinance";
import { useProfile } from "@/hooks/useProfile";
import { formatCurrency } from "@/lib/format";
import { TransactionDialog } from "@/components/app/TransactionDialog";
import { ReceiptIndicator } from "@/components/app/ReceiptIndicator";
import { toast } from "sonner";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";

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

  const project = projects.find((p) => p.id === projectId);
  const projectTxs = useMemo(() => txs.filter((tx) => tx.project_id === projectId), [txs, projectId]);

  const [catFilter, setCatFilter] = useState<string>("all");
  const [payFilter, setPayFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string>("all");

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
      const root = c?.parent_id ?? c?.id ?? null;
      if (root !== catFilter) return false;
    }
    if (payFilter !== "all" && (t.payment_method ?? "") !== payFilter) return false;
    if (dateBounds.from && new Date(t.occurred_at) < dateBounds.from) return false;
    if (dateBounds.to && new Date(t.occurred_at) > dateBounds.to) return false;
    if (tagFilter !== "all" && !(t.tags ?? []).includes(tagFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${t.vendor ?? ""} ${t.notes ?? ""} ${(t.tags ?? []).join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [projectTxs, catFilter, payFilter, dateBounds, categories, tagFilter, search]);

  const activeFilters = (catFilter !== "all" ? 1 : 0) + (payFilter !== "all" ? 1 : 0) + (dateRange !== "all" ? 1 : 0) + (tagFilter !== "all" ? 1 : 0) + (search ? 1 : 0);
  const clearAll = () => { setCatFilter("all"); setPayFilter("all"); setDateRange("all"); setCustomFrom(""); setCustomTo(""); setTagFilter("all"); setSearch(""); };

  const stats = useMemo(() => {
    let spent = 0, income = 0;
    const byCategory = new Map<string, number>();
    const bySub = new Map<string, Map<string, number>>();
    const byTag = new Map<string, number>();
    for (const tx of projectTxs) {
      if (tx.type === "expense") {
        spent += Number(tx.amount);
        const cat = categories.find((c) => c.id === tx.category_id);
        const rootId = cat?.parent_id ?? cat?.id ?? "uncat";
        byCategory.set(rootId, (byCategory.get(rootId) ?? 0) + Number(tx.amount));
        const subId = cat?.parent_id ? cat.id : "__direct";
        const subMap = bySub.get(rootId) ?? new Map<string, number>();
        subMap.set(subId, (subMap.get(subId) ?? 0) + Number(tx.amount));
        bySub.set(rootId, subMap);
        const tags = tx.tags ?? [];
        if (tags.length === 0) byTag.set("untagged", (byTag.get("untagged") ?? 0) + Number(tx.amount));
        else for (const tg of tags) byTag.set(tg, (byTag.get(tg) ?? 0) + Number(tx.amount));
      } else if (tx.type === "income") income += Number(tx.amount);
    }
    return { spent, income, byCategory, bySub, byTag };
  }, [projectTxs, categories]);

  if (!project) {
    return (
      <div className="grid place-items-center py-20 text-center">
        <p className="text-muted-foreground">Project not found.</p>
        <Link to="/projects" className="mt-3 text-sm text-primary underline">Back to projects</Link>
      </div>
    );
  }

  const quoted = Number(project.quoted_amount) || 0;
  const remaining = quoted - stats.spent;
  const budget = Number(project.budget) || 0;
  const budgetPct = budget > 0 ? Math.min(100, (stats.spent / budget) * 100) : 0;
  const quotedPct = quoted > 0 ? Math.min(100, (stats.spent / quoted) * 100) : 0;
  const statusTone = project.status === "active" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
    : project.status === "completed" ? "bg-blue-500/10 text-blue-600 border-blue-500/30"
    : project.status === "on_hold" ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
    : project.status === "cancelled" ? "bg-destructive/10 text-destructive border-destructive/30"
    : "bg-muted text-muted-foreground border-border";

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-2">
        <Link to="/projects" className="grid h-9 w-9 place-items-center rounded-full border hover:bg-muted"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-bold tracking-tight md:text-3xl">{project.name}</h1>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusTone}`}>{project.status.replace("_", " ")}</span>
          </div>
          {(project.client_name || project.site_address) && (
            <p className="text-sm text-muted-foreground">{project.client_name}{project.client_name && project.site_address ? " · " : ""}{project.site_address}</p>
          )}
          {quoted > 0 && (
            <p className="mt-0.5 text-sm"><span className="text-muted-foreground">Quoted </span><span className="font-semibold tabular-nums">{formatCurrency(quoted, currency)}</span></p>
          )}
        </div>
        <Button variant="outline" size="icon" onClick={() => setEditOpen(true)}><Edit3 className="h-4 w-4" /></Button>
        <Button variant="outline" size="icon" onClick={async () => {
          if (!confirm("Delete this project? Transactions remain but lose the project tag.")) return;
          await removeProject.mutateAsync(project.id);
          toast.success("Project deleted");
          nav({ to: "/projects" });
        }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total spent" value={formatCurrency(stats.spent, currency)} tone="neg" />
        <StatCard label="Total income" value={formatCurrency(stats.income, currency)} tone="pos" />
        <StatCard label="Total remaining" value={formatCurrency(quoted - stats.income, currency)} tone={quoted - stats.income > 0 ? "neg" : "pos"} />
        <StatCard label="Savings / Remaining" value={formatCurrency(remaining, currency)} tone={remaining >= 0 ? "pos" : "neg"} />
        <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Budget used</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{quoted > 0 ? `${quotedPct.toFixed(0)}%` : "—"}</p>
          {quoted > 0 && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${quotedPct}%`, background: quotedPct > 90 ? "hsl(var(--destructive))" : "var(--gradient-primary)" }} />
            </div>
          )}
        </div>
      </div>

      {budget > 0 && (
        <div className="rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)]">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">Budget usage</span>
            <span className="tabular-nums text-muted-foreground">{formatCurrency(stats.spent, currency)} / {formatCurrency(budget, currency)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full transition-all" style={{ width: `${budgetPct}%`, background: budgetPct > 90 ? "hsl(var(--destructive))" : "var(--gradient-primary)" }} />
          </div>
        </div>
      )}

      <div className="rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)]">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Spend by category</h3>
        {stats.byCategory.size === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses tagged yet.</p>
        ) : (
          <ul className="grid gap-2">
            {[...stats.byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([catId, amt]) => {
              const cat = categories.find((c) => c.id === catId);
              const pct = stats.spent > 0 ? (amt / stats.spent) * 100 : 0;
              const subs = [...(stats.bySub.get(catId) ?? new Map()).entries()]
                .filter(([sid]) => sid !== "__direct")
                .sort((a, b) => (b[1] as number) - (a[1] as number));
              return (
                <li key={catId}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: cat?.color ?? "#64748B" }} />
                      {cat?.name ?? "Uncategorised"}
                    </span>
                    <span className="tabular-nums text-muted-foreground">{formatCurrency(amt, currency)} · {pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: cat?.color ?? "var(--gradient-primary)" }} />
                  </div>
                  {subs.length > 0 && (
                    <ul className="mt-2 grid gap-1.5 border-l pl-3">
                      {subs.map(([sid, samt]) => {
                        const sub = categories.find((c) => c.id === sid);
                        const spct = amt > 0 ? ((samt as number) / amt) * 100 : 0;
                        return (
                          <li key={sid as string}>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{sub?.name ?? "Other"}</span>
                              <span className="tabular-nums text-muted-foreground">{formatCurrency(samt as number, currency)} · {spct.toFixed(0)}%</span>
                            </div>
                            <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full opacity-70" style={{ width: `${spct}%`, background: sub?.color ?? cat?.color ?? "var(--gradient-primary)" }} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)]">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Spend by tag</h3>
        {stats.byTag.size === 0 ? (
          <p className="text-sm text-muted-foreground">No tagged expenses yet.</p>
        ) : (
          <ul className="grid gap-2">
            {[...stats.byTag.entries()].sort((a, b) => b[1] - a[1]).map(([tg, amt]) => {
              const pct = stats.spent > 0 ? (amt / stats.spent) * 100 : 0;
              return (
                <li key={tg}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <button type="button" onClick={() => setTagFilter(tg === "untagged" ? "all" : tg)} className="text-left font-medium text-primary hover:underline">{tg === "untagged" ? "Untagged" : `#${tg}`}</button>
                    <span className="tabular-nums text-muted-foreground">{formatCurrency(amt, currency)} · {pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--gradient-primary)" }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)]">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Transactions ({filteredTxs.length}{activeFilters > 0 ? ` of ${projectTxs.length}` : ""})</h3>
          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={clearAll}><X className="h-3 w-3" /> Clear</Button>
          )}
        </div>
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <Input placeholder="Search vendor, note or tag…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger><SelectValue placeholder="All tags" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {allTags.length === 0 && <SelectItem value="__na" disabled>No tags yet</SelectItem>}
              {allTags.map((tg) => <SelectItem key={tg} value={tg}>#{tg}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
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
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        )}
        {filteredTxs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tag transactions with this project to see them here.</p>
        ) : (
          <ul className="grid gap-1">
            {filteredTxs.map((tx) => {
              const cat = categories.find((c) => c.id === tx.category_id);
              const parent = cat?.parent_id ? categories.find((c) => c.id === cat.parent_id) : null;
              const acc = accounts.find((a) => a.id === tx.account_id);
              const sign = tx.type === "income" ? "+" : tx.type === "expense" ? "−" : "";
              const color = tx.type === "income" ? "text-[color:var(--success)]" : tx.type === "expense" ? "text-primary" : "text-secondary";
              return (
                <li key={tx.id} className="group flex items-start gap-3 rounded-xl p-2 hover:bg-muted/50">
                  <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-semibold text-white" style={{ background: cat?.color ?? "var(--muted-foreground)" }}>
                    {(cat?.name ?? tx.type).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 break-words text-sm font-medium">{tx.vendor || tx.notes || cat?.name || "Transaction"}</p>
                    <p className="line-clamp-2 break-words text-xs text-muted-foreground">
                      {parent ? `${parent.name} · ${cat?.name}` : cat?.name ?? tx.type} · {acc?.name ?? "—"}{tx.payment_method ? ` · ${tx.payment_method}` : ""} · {new Date(tx.occurred_at).toLocaleString()}
                    </p>
                    <ReceiptIndicator receiptPath={tx.receipt_path} />
                    {(tx.tags?.length ?? 0) > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {tx.tags!.map((tg) => (
                          <button
                            key={tg}
                            type="button"
                            onClick={() => setTagFilter(tg)}
                            className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20"
                          >#{tg}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className={`shrink-0 pt-0.5 text-sm font-semibold tabular-nums ${color}`}>{sign}{formatCurrency(Number(tx.amount), currency)}</p>
                  <div className="flex shrink-0 items-center gap-0.5 pt-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateTx.mutate({ id: tx.id, favorite: !tx.favorite })} aria-label="Favorite">
                      <Star className={`h-4 w-4 ${tx.favorite ? "fill-[color:var(--warning)] text-[color:var(--warning)]" : ""}`} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingTx(tx); setTxOpen(true); }} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => softDeleteTx.mutate(tx.id)} aria-label="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <TransactionDialog open={txOpen} onOpenChange={(o) => { setTxOpen(o); if (!o) setEditingTx(null); }} editing={editingTx} />

      <EditProjectDialog open={editOpen} onOpenChange={setEditOpen} project={project} onSave={async (patch) => {
        await updateProject.mutateAsync({ id: project.id, ...patch });
        toast.success("Project updated");
      }} />
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tone === "pos" ? "text-emerald-600" : tone === "neg" ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

function EditProjectDialog({ open, onOpenChange, project, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; project: Project; onSave: (patch: Partial<Project>) => Promise<void> }) {
  const [form, setForm] = useState({
    name: project.name,
    client_name: project.client_name ?? "",
    site_address: project.site_address ?? "",
    quoted_amount: String(project.quoted_amount ?? ""),
    budget: String(project.budget ?? ""),
    status: project.status,
    notes: project.notes ?? "",
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Edit project</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2"><Label>Client</Label><Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Project["status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["planning", "active", "on_hold", "completed", "cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2"><Label>Site address</Label><Input value={form.site_address} onChange={(e) => setForm({ ...form, site_address: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2"><Label>Quoted amount</Label><Input type="number" step="0.01" value={form.quoted_amount} onChange={(e) => setForm({ ...form, quoted_amount: e.target.value })} /></div>
            <div className="grid gap-2"><Label>Budget</Label><Input type="number" step="0.01" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></div>
          </div>
          <div className="grid gap-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={async () => {
              await onSave({
                name: form.name,
                client_name: form.client_name || null,
                site_address: form.site_address || null,
                quoted_amount: parseFloat(form.quoted_amount) || 0,
                budget: parseFloat(form.budget) || 0,
                status: form.status,
                notes: form.notes || null,
              });
              onOpenChange(false);
            }}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}