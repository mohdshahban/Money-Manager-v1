import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Plus, FolderKanban, MoreVertical, Pencil, Trash2 } from "lucide-react";
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Projects</h1>
          <p className="text-sm text-muted-foreground">Track site costs, quotes and P&amp;L per client.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> New</Button>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-3xl border bg-card p-10 text-center shadow-[var(--shadow-soft)]">
          <FolderKanban className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No projects yet. Create your first site to start tracking labour and materials.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {projects.map((p, i) => {
            const t = totals.get(p.id) ?? { spent: 0, income: 0 };
            const quoted = Number(p.quoted_amount) || 0;
            const profit = (Number(p.quoted_amount) || 0) + t.income - t.spent;
            const budgetUsed = p.budget > 0 ? Math.min(100, (t.spent / Number(p.budget)) * 100) : 0;
            return (
              <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: p.id }}
                  className="block cursor-pointer rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)] transition-all hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color ?? "#6366F1" }} />
                        <h3 className="truncate font-semibold">{p.name}</h3>
                      </div>
                      {p.client_name && <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.client_name}</p>}
                    </div>
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{p.status}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onSelect={() => setEditing(p)}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setDeleting(p)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                    <Stat label="Quoted" value={formatCurrency(quoted, currency)} />
                    <Stat label="Spent" value={formatCurrency(t.spent, currency)} />
                    <Stat label="P/L" value={formatCurrency(profit, currency)} tone={profit >= 0 ? "pos" : "neg"} />
                  </div>
                  {p.budget > 0 && (
                    <div className="mt-3">
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${budgetUsed}%`, background: budgetUsed > 90 ? "hsl(var(--destructive))" : "var(--gradient-primary)" }} />
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">{budgetUsed.toFixed(0)}% of budget used</p>
                    </div>
                  )}
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
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
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
              <div className="grid gap-2"><Label>Internal budget</Label><Input type="number" step="0.01" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></div>
            </div>
            <div className="grid gap-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={create.isPending}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {editing && (
        <EditProjectQuick
          project={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            await update.mutateAsync({ id: editing.id, ...patch });
            toast.success("Project updated");
            setEditing(null);
          }}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the project and its P&amp;L data. Continue?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                await remove.mutateAsync(deleting.id);
                toast.success("Project deleted");
                setDeleting(null);
              }}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-semibold tabular-nums ${tone === "pos" ? "text-emerald-600" : tone === "neg" ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

function EditProjectQuick({ project, onClose, onSave }: { project: Project; onClose: () => void; onSave: (patch: Partial<Project>) => Promise<void> }) {
  const [form, setForm] = useState({
    name: project.name,
    client_name: project.client_name ?? "",
    quoted_amount: String(project.quoted_amount ?? ""),
    status: project.status,
    start_date: project.start_date ?? "",
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Edit project</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2"><Label>Project name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid gap-2"><Label>Client name</Label><Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2"><Label>Quoted amount (₹)</Label><Input type="number" step="0.01" value={form.quoted_amount} onChange={(e) => setForm({ ...form, quoted_amount: e.target.value })} /></div>
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
          <div className="grid gap-2"><Label>Start date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={async () => {
              await onSave({
                name: form.name,
                client_name: form.client_name || null,
                quoted_amount: parseFloat(form.quoted_amount) || 0,
                status: form.status,
                start_date: form.start_date || null,
              });
            }}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}