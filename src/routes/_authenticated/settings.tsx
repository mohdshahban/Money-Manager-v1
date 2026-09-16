import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useUpdateProfile } from "@/hooks/useProfile";
import { useTheme } from "@/hooks/useTheme";
import { useAccounts, useCategories, useTransactions, useBudgets, useMutateEntity, type Category, type Budget } from "@/hooks/useFinance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exportJSON, exportCSV, exportExcel } from "@/lib/exports";
import { CURRENCIES } from "@/lib/format";
import { toast } from "sonner";
import { LogOut, Moon, Sun, Monitor, Plus, Trash2, Sparkles, ChevronRight, Download, FileText, FileSpreadsheet, Pencil, Tag } from "lucide-react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ICON_CHOICES = [
  "tag", "utensils", "coffee", "shopping-bag", "shopping-cart", "car", "bus", "plane", "train-front", "fuel",
  "home", "building-2", "hammer", "wrench", "paint-roller", "ruler", "hard-hat", "package", "truck", "boxes",
  "users", "user", "briefcase", "receipt", "credit-card", "wallet", "banknote", "piggy-bank", "landmark", "coins",
  "heart-pulse", "pill", "graduation-cap", "book-open", "film", "music", "gamepad-2", "dumbbell", "shirt", "scissors",
  "phone", "wifi", "zap", "droplet", "flame", "lightbulb", "gift", "plane-takeoff", "trending-up", "more-horizontal",
] as const;

function CatIcon({ name, className, style }: { name?: string | null; className?: string; style?: React.CSSProperties }) {
  const icon = (name ?? "tag") as IconName;
  return <DynamicIcon name={icon} className={className} style={style} fallback={() => <Tag className={className} style={style} />} />;
}

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  const nav = useNavigate();
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const { theme, setTheme } = useTheme();

  const { data: accounts = [] } = useAccounts();
  const { data: cats = [] } = useCategories();
  const { data: txs = [] } = useTransactions({ includeDeleted: true });
  const { data: budgets = [] } = useBudgets();

  const [name, setName] = useState(profile?.full_name ?? "");
  const [currency, setCurrency] = useState(profile?.currency ?? "USD");

  const signOut = async () => {
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  };

  const backup = () => {
    exportJSON({ profile, accounts, categories: cats, transactions: txs, budgets }, `moneta-backup-${new Date().toISOString().slice(0, 10)}.json`);
    toast.success("Backup downloaded");
  };

  const activeTxs = txs.filter((t) => !t.deleted_at);

  const csv = () => {
    if (activeTxs.length === 0) return toast.error("No transactions to export");
    exportCSV(activeTxs, cats, accounts);
    toast.success("CSV downloaded");
  };

  const excel = async () => {
    if (activeTxs.length === 0) return toast.error("No transactions to export");
    await exportExcel(activeTxs, cats, accounts);
    toast.success("Excel downloaded");
  };

  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Settings</h1>

      <Section title="Profile">
        <div className="grid gap-4">
          <div className="grid gap-2"><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid gap-2"><Label>Email</Label><Input value={profile?.email ?? ""} disabled /></div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Timezone</Label>
              <Input value={profile?.timezone ?? "UTC"} disabled />
            </div>
          </div>
          <Button onClick={async () => {
            try {
              await update.mutateAsync({ full_name: name, currency });
              toast.success("Profile saved");
            } catch (e) { toast.error((e as Error).message); }
          }} className="w-fit">Save profile</Button>
        </div>
      </Section>

      <Section title="Appearance">
        <div className="flex flex-wrap gap-2">
          {[{ v: "light", i: <Sun className="h-4 w-4" /> }, { v: "dark", i: <Moon className="h-4 w-4" /> }, { v: "system", i: <Monitor className="h-4 w-4" /> }].map((o) => (
            <button key={o.v} onClick={() => setTheme(o.v as never)} className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm capitalize transition-all data-[active=true]:border-primary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground" data-active={theme === o.v}>
              {o.i}{o.v}
            </button>
          ))}
        </div>
      </Section>

      <CategoriesSection categories={cats} />
      <BudgetsSection budgets={budgets} categories={cats} />

      <PasswordSection />

      <Section title="AI assistants">
        <Link to="/connect" className="flex items-center justify-between rounded-xl border p-3 transition-colors hover:bg-accent">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full text-white" style={{ background: "var(--gradient-primary)" }}>
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium">Connect ChatGPT or Claude</p>
              <p className="text-xs text-muted-foreground">Let an assistant manage your money in Moneta</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </Section>

      <Section title="Data & backup">
        <p className="mb-3 text-xs text-muted-foreground">Download a full backup of your data, or export your transactions as a spreadsheet.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={backup} className="gap-1.5"><Download className="h-4 w-4" />Full backup (JSON)</Button>
          <Button variant="outline" onClick={csv} className="gap-1.5"><FileText className="h-4 w-4" />Transactions (CSV)</Button>
          <Button variant="outline" onClick={excel} className="gap-1.5"><FileSpreadsheet className="h-4 w-4" />Transactions (Excel)</Button>
          <Button variant="outline" onClick={signOut} className="gap-1.5"><LogOut className="h-4 w-4" />Sign out</Button>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)]">
      <h3 className="mb-4 text-sm font-semibold text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function PasswordSection() {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (pw.length < 6) return toast.error("Password must be at least 6 characters");
    if (pw !== confirm) return toast.error("Passwords do not match");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      toast.success("Password updated");
      setPw(""); setConfirm("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Login password">
      <div className="grid gap-4">
        <p className="text-xs text-muted-foreground">Set or change the password you use to sign in with your email.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>New password</Label>
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder="At least 6 characters" />
          </div>
          <div className="grid gap-2">
            <Label>Confirm password</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        <Button onClick={save} disabled={busy} className="w-fit">{busy ? "Saving…" : "Update password"}</Button>
      </div>
    </Section>
  );
}

function CategoriesSection({ categories }: { categories: Category[] }) {
  const { create, update, remove } = useMutateEntity<Category>("categories", ["categories"]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [color, setColor] = useState("#FF5A5F");
  const [parentId, setParentId] = useState<string>("");
  const [editing, setEditing] = useState<Category | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("tag");
  const [editColor, setEditColor] = useState("#FF5A5F");

  const startEdit = (c: Category) => {
    setEditing(c);
    setEditName(c.name);
    setEditIcon(c.icon ?? "tag");
    setEditColor(c.color ?? "#64748B");
  };

  const saveEdit = async () => {
    if (!editing) return;
    const trimmed = editName.trim();
    if (!trimmed) return toast.error("Enter a name");
    try {
      await update.mutateAsync({ id: editing.id, name: trimmed, icon: editIcon, color: editColor } as never);
      toast.success("Category updated");
      setEditing(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const parents = categories.filter((c) => !c.parent_id);
  const parentColor = parentId ? parents.find((p) => p.id === parentId)?.color ?? color : color;
  const parentType = parentId ? parents.find((p) => p.id === parentId)?.type ?? type : type;

  return (
    <Section title="Categories">
      <div className="mb-3 grid gap-3">
        {parents.map((p) => {
          const subs = categories.filter((c) => c.parent_id === p.id);
          return (
            <div key={p.id} className="rounded-2xl border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${p.color ?? "#64748B"}22`, color: p.color ?? "#64748B" }}>
                    <CatIcon name={p.icon} className="h-4 w-4" />
                  </span>
                  {p.name}
                  <span className="text-xs font-normal text-muted-foreground">· {p.type}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => startEdit(p)} aria-label={`Edit ${p.name}`}><Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" /></button>
                  <button onClick={() => { if (confirm("Delete category and its subcategories?")) remove.mutate(p.id); }} aria-label="Delete"><Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" /></button>
                </div>
              </div>
              {subs.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 pl-4">
                  {subs.map((s) => (
                    <div key={s.id} className="group flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs">
                      <CatIcon name={s.icon} className="h-3 w-3" style={{ color: s.color ?? undefined }} />
                      <span>{s.name}</span>
                      <button onClick={() => startEdit(s)} aria-label={`Edit ${s.name}`}><Pencil className="h-3 w-3 text-muted-foreground hover:text-primary" /></button>
                      <button onClick={() => { if (confirm("Delete subcategory?")) remove.mutate(s.id); }} aria-label="Delete"><Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> New category / subcategory</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>New category</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>Parent (optional — for sub-items like labour names)</Label>
              <Select value={parentId || "__none"} onValueChange={(v) => setParentId(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Top-level" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Top-level category</SelectItem>
                  {parents.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.type})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            {!parentId && (
              <>
                <div className="grid gap-2">
                  <Label>Type</Label>
                  <Select value={type} onValueChange={(v) => setType(v as never)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="expense">Expense</SelectItem><SelectItem value="income">Income</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2"><Label>Color</Label><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20 cursor-pointer" /></div>
              </>
            )}
            <Button onClick={async () => {
              if (!name) return;
              await create.mutateAsync({ name, type: parentType, color: parentColor, parent_id: parentId || null } as Partial<Category>);
              toast.success(parentId ? "Subcategory added" : "Category added");
              setOpen(false); setName(""); setParentId("");
            }}>Add</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{editing?.parent_id ? "Edit subcategory" : "Edit category"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2"><Label>Name</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
            <div className="grid gap-2">
              <Label>Icon</Label>
              <div className="grid max-h-52 grid-cols-8 gap-1.5 overflow-y-auto rounded-xl border p-2">
                {ICON_CHOICES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setEditIcon(n)}
                    aria-label={n}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors data-[active=true]:border-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                    data-active={editIcon === n}
                  >
                    <CatIcon name={n} className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2"><Label>Color</Label><Input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} className="h-10 w-20 cursor-pointer" /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={saveEdit} disabled={update.isPending}>{update.isPending ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function BudgetsSection({ budgets, categories }: { budgets: Budget[]; categories: Category[] }) {
  const { create, remove } = useMutateEntity<Budget>("budgets", ["budgets"]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [catId, setCatId] = useState<string>("");

  return (
    <Section title="Budgets">
      {budgets.length === 0 ? <p className="mb-3 text-sm text-muted-foreground">No budgets yet.</p> : (
        <ul className="mb-3 grid gap-2">
          {budgets.map((b) => (
            <li key={b.id} className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">{b.name}</p>
                <p className="text-xs text-muted-foreground">{b.period} · {categories.find((c) => c.id === b.category_id)?.name ?? "All categories"}</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold tabular-nums">{Number(b.amount).toFixed(2)}</p>
                <button onClick={() => remove.mutate(b.id)} aria-label="Delete"><Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> New budget</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>New budget</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="grid gap-2"><Label>Amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="grid gap-2">
              <Label>Category (optional)</Label>
              <Select value={catId} onValueChange={setCatId}>
                <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
                <SelectContent>{categories.filter((c) => c.type === "expense").map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={async () => {
              const amt = parseFloat(amount);
              if (!name || !amt) return;
              await create.mutateAsync({ name, amount: amt, period: "monthly", category_id: catId || null });
              toast.success("Budget added"); setOpen(false); setName(""); setAmount(""); setCatId("");
            }}>Add</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Section>
  );
}