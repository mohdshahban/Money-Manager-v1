import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { FolderKanban, MoreVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useProjects, useTransactions, useMutateEntity, type Project } from "@/hooks/useFinance";
import { useProfile } from "@/hooks/useProfile";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/projects/")({ component: ProjectsPage });

function ProjectsPage() {
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "USD";
  const { data: projects = [] } = useProjects();
  const { data: txs = [] } = useTransactions();
  const { create, update, remove } = useMutateEntity<Project>("projects", ["projects"]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({ name: "", client_name: "", site_address: "", quoted_amount: "", budget: "", status: "active", notes: "" });

  const totals = useMemo(() => {
    const map = new Map<string, { spent: number; income: number }>();
    for (const tx of txs) {
      if (!tx.project_id) continue;
      const cur = map.get(tx.project_id) ?? { spent: 0, income: 0 };
      if (tx.type === "expense") cur.spent += Number(tx.amount);
      else if (tx.type === "income") cur.income += Number(tx.amount);
      map.set(tx.project_id, cur);
    }
    return map;
  }, [txs]);

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      return [p.name, p.client_name, p.site_address].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [projects, query, statusFilter]);

  const portfolio = useMemo(() => {
    let quoted = 0, spent = 0, received = 0;
    projects.forEach((p) => {
      quoted += Number(p.quoted_amount) || 0;
      const t = totals.get(p.id);
      spent += t?.spent ?? 0;
      received += t?.income ?? 0;
    });
    return { quoted, spent, received, active: projects.filter((p) => p.status === "active").length };
  }, [projects, totals]);

  const submit = async () => {
    if (!form.name) return toast.error("Enter a project name");
    await create.mutateAsync({
      name: form.name,
      client_name: form.client_name || null,
      site_address: form.site_address || null,
      quoted_amount: parseFloat(form.quoted_amount) || 0,
      budget: parseFloat(form.budget) || 0,
      status: form.status as Project["status"],
      notes: form.notes || null,
    });
    toast.success("Project created");
    setOpen(false);
    setForm({ name: "", client_name: "", site_address: "", quoted_amount: "", budget: "", status: "active", notes: "" });
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Client portfolio</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track quote, spend, collections and P&amp;L per site.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> New project</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PortfolioStat label="Active projects" value={String(portfolio.active)} />
        <PortfolioStat label="Total quoted" value={formatCurrency(portfolio.quoted, currency)} />
        <PortfolioStat label="Total spent" value={formatCurrency(portfolio.spent, currency)} tone="neg" />
        <PortfolioStat label="Total received" value={formatCurrency(portfolio.received, currency)} tone="pos" />
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border bg-card p-3 shadow-[var(--shadow-soft)] sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search project, client or site…" className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {["planning", "active", "on_hold", "completed", "cancelled"].map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-3xl border bg-card p-12 text-center shadow-[var(--shadow-soft)]">
          <FolderKanban className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No projects yet. Create your first site to start tracking labour and materials.</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">No projects match these filters.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map((p, i) => {
            const t = totals.get(p.id) ?? { spent: 0, income: 0 };
            const quoted = Number(p.quoted_amount) || 0;
            const projectValue = quoted + t.income;
            const profit = projectValue - t.spent;
            const budgetBase = Number(p.budget) > 0 ? Number(p.budget) : quoted;
            const budgetUsed = budgetBase > 0 ? Math.min(100, (t.spent / budgetBase) * 100) : 0;
            return (
              <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }}>
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: p.id }}
                  className="block h-full rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)] transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color ?? "#6366F1" }} />
                        <h3 className="truncate font-semibold">{p.name}</h3>
                      </div>
                      {p.client_name && <p className="mt-1 truncate text-xs text-muted-foreground">{p.client_name}</p>}
                      {p.site_address && <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">{p.site_address}</p>}
                    </div>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <span className="rounded-full border bg-muted/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{p.status.replace("_", " ")}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onSelect={() => setEditing(p)}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setDeleting(p)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <Stat label="Quoted" value={formatCurrency(quoted, currency)} />
                    <Stat label="Received" value={formatCurrency(t.income, currency)} tone="pos" />
                    <Stat label="Spent" value={formatCurrency(t.spent, currency)} />
                    <Stat label="P/L" value={formatCurrency(profit, currency)} tone={profit >= 0 ? "pos" : "neg"} />
                  </div>

                  <div className="mt-4 border-t pt-3">
                    <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{Number(p.budget) > 0 ? "Budget used" : "Quote consumed"}</span>
                      <span className="tabular-nums">{budgetUsed.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${budgetUsed}%`, background: budgetUsed > 90 ? "hsl(var(--destructive))" : "var(--gradient-primary)" }} />
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2"><Label>Project name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sharma Residence 3BHK" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label>Client</Label><Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["planning", "active", "on_hold", "completed", "cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid gap-2"><Label>Site address</Label><Input value={form.site_address} onChange={(e) => setForm({ ...form, site_address: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label>Quoted amount</Label><Input type="number" step="0.01" value={form.quoted_amount} onChange={(e) => setForm({ ...form, quoted_amount: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Internal budget</Label><Input type="number" step="0.01" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></div>
            </div>
            <div className="grid gap-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="flex justify-end gap-2 pt-1"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submit} disabled={create.isPending}>Create</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      {editing && <EditProjectQuick project={editing} onClose={() => setEditing(null)} onSave={async (patch) => { await update.mutateAsync({ id: editing.id, ...patch }); toast.success("Project updated"); setEditing(null); }} />}

      <AlertDialog open={!!deleting} onOpenChange={(next) => !next && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete "{deleting?.name}"?</AlertDialogTitle><AlertDialogDescription>This removes the project. Existing transactions remain in your account.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => { if (!deleting) return; await remove.mutateAsync(deleting.id); toast.success("Project deleted"); setDeleting(null); }}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PortfolioStat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-xl font-semibold tabular-nums ${tone === "pos" ? "text-[color:var(--success)]" : tone === "neg" ? "text-primary" : ""}`}>{value}</p></div>;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-0.5 text-sm font-semibold tabular-nums ${tone === "pos" ? "text-[color:var(--success)]" : tone === "neg" ? "text-destructive" : ""}`}>{value}</p></div>;
}

function EditProjectQuick({ project, onClose, onSave }: { project: Project; onClose: () => void; onSave: (patch: Partial<Project>) => Promise<void> }) {
  const [form, setForm] = useState({ name: project.name, client_name: project.client_name ?? "", quoted_amount: String(project.quoted_amount ?? ""), status: project.status, start_date: project.start_date ?? "" });
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Edit project</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2"><Label>Project name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid gap-2"><Label>Client name</Label><Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2"><Label>Quoted amount</Label><Input type="number" step="0.01" value={form.quoted_amount} onChange={(e) => setForm({ ...form, quoted_amount: e.target.value })} /></div>
            <div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Project["status"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["planning", "active", "on_hold", "completed", "cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid gap-2"><Label>Start date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
          <div className="flex justify-end gap-2 pt-1"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={async () => onSave({ name: form.name, client_name: form.client_name || null, quoted_amount: parseFloat(form.quoted_amount) || 0, status: form.status, start_date: form.start_date || null })}>Save</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
