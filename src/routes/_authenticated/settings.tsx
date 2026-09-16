import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
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
import { ChevronRight, Database, Download, FileSpreadsheet, FileText, LogOut, Monitor, Moon, Palette, Pencil, Plug, Plus, Search, ShieldCheck, Sparkles, Sun, Tag, Tags, Trash2, UserRound, WalletCards } from "lucide-react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ICON_CHOICES = [
  "tag", "utensils", "coffee", "shopping-bag", "shopping-cart", "car", "bus", "plane", "train-front", "fuel",
  "home", "building-2", "hammer", "wrench", "paint-roller", "ruler", "hard-hat", "package", "truck", "boxes",
  "users", "user", "briefcase", "receipt", "credit-card", "wallet", "banknote", "piggy-bank", "landmark", "coins",
  "heart-pulse", "pill", "graduation-cap", "book-open", "film", "music", "gamepad-2", "dumbbell", "shirt", "scissors",
  "phone", "wifi", "zap", "droplet", "flame", "lightbulb", "gift", "plane-takeoff", "trending-up", "more-horizontal",
] as const;

type SettingsSection = "profile" | "appearance" | "categories" | "budgets" | "integrations" | "security" | "backup";

const sections: Array<{ id: SettingsSection; label: string; description: string; icon: typeof UserRound }> = [
  { id: "profile", label: "Profile", description: "Identity, currency and timezone", icon: UserRound },
  { id: "appearance", label: "Appearance", description: "Light, dark or system theme", icon: Palette },
  { id: "categories", label: "Categories", description: "Expense and income structure", icon: Tags },
  { id: "budgets", label: "Budgets", description: "Monthly spending targets", icon: WalletCards },
  { id: "integrations", label: "Integrations", description: "ChatGPT, Claude and MCP", icon: Plug },
  { id: "security", label: "Security", description: "Login and password", icon: ShieldCheck },
  { id: "backup", label: "Backup & data", description: "Export and account actions", icon: Database },
];

function CatIcon({ name, className, style }: { name?: string | null; className?: string; style?: CSSProperties }) {
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
  const [active, setActive] = useState<SettingsSection>("profile");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");

  useEffect(() => {
    if (!profile) return;
    setName(profile.full_name ?? "");
    setCurrency(profile.currency ?? "USD");
  }, [profile]);

  const signOut = async () => {
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  };

  const activeTxs = txs.filter((t) => !t.deleted_at);
  const backup = () => {
    exportJSON({ profile, accounts, categories: cats, transactions: txs, budgets }, `moneta-backup-${new Date().toISOString().slice(0, 10)}.json`);
    toast.success("Backup downloaded");
  };
  const csv = () => {
    if (activeTxs.length === 0) return toast.error("No transactions to export");
    exportCSV(activeTxs, cats, accounts); toast.success("CSV downloaded");
  };
  const excel = async () => {
    if (activeTxs.length === 0) return toast.error("No transactions to export");
    await exportExcel(activeTxs, cats, accounts); toast.success("Excel downloaded");
  };

  return (
    <div className="grid gap-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Workspace preferences</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Everything is grouped so you can get in, change one thing, and get out.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-2xl border bg-card p-2 shadow-[var(--shadow-soft)] xl:sticky xl:top-4 xl:self-start">
          <nav className="flex gap-1 overflow-x-auto xl:grid">
            {sections.map(({ id, label, description, icon: Icon }) => (
              <button key={id} type="button" onClick={() => setActive(id)} className={`min-w-max rounded-xl px-3 py-2.5 text-left transition-colors xl:min-w-0 ${active === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                <span className="flex items-center gap-2.5"><Icon className="h-4 w-4 shrink-0" /><span className="text-sm font-medium">{label}</span></span>
                <span className="mt-0.5 hidden pl-6 text-[11px] text-muted-foreground xl:block">{description}</span>
              </button>
            ))}
          </nav>
        </aside>

        <div className="min-w-0">
          {active === "profile" && (
            <Panel title="Profile" description="Basic account details used across Money Manager.">
              <div className="grid gap-4">
                <div className="grid gap-2"><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div className="grid gap-2"><Label>Email</Label><Input value={profile?.email ?? ""} disabled /></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2"><Label>Currency</Label><Select value={currency} onValueChange={setCurrency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="grid gap-2"><Label>Timezone</Label><Input value={profile?.timezone ?? "UTC"} disabled /></div>
                </div>
                <Button onClick={async () => { try { await update.mutateAsync({ full_name: name, currency }); toast.success("Profile saved"); } catch (e) { toast.error((e as Error).message); } }} className="w-fit">Save profile</Button>
              </div>
            </Panel>
          )}

          {active === "appearance" && (
            <Panel title="Appearance" description="Choose how the interface looks on this device.">
              <div className="grid gap-3 sm:grid-cols-3">
                {[{ v: "light", label: "Light", icon: Sun }, { v: "dark", label: "Dark", icon: Moon }, { v: "system", label: "System", icon: Monitor }].map(({ v, label, icon: Icon }) => (
                  <button key={v} onClick={() => setTheme(v as never)} data-active={theme === v} className="rounded-2xl border p-4 text-left transition-all hover:border-primary/40 data-[active=true]:border-primary data-[active=true]:bg-primary/5">
                    <div className="mb-8 flex items-center justify-between"><Icon className="h-5 w-5" /><span className={`h-3 w-3 rounded-full border-2 ${theme === v ? "border-primary bg-primary" : "border-muted-foreground/30"}`} /></div>
                    <p className="font-medium">{label}</p><p className="mt-1 text-xs text-muted-foreground">{v === "system" ? "Follow your device setting" : `Always use ${v} mode`}</p>
                  </button>
                ))}
              </div>
            </Panel>
          )}

          {active === "categories" && <CategoriesSection categories={cats} />}
          {active === "budgets" && <BudgetsSection budgets={budgets} categories={cats} />}

          {active === "integrations" && (
            <Panel title="Integrations" description="Connect AI assistants and external tools to your finance data.">
              <Link to="/connect" className="flex items-center justify-between rounded-2xl border p-4 transition-all hover:border-primary/40 hover:bg-muted/40">
                <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: "var(--gradient-primary)" }}><Sparkles className="h-5 w-5" /></div><div><p className="text-sm font-medium">ChatGPT / Claude MCP</p><p className="mt-0.5 text-xs text-muted-foreground">Read and manage your Money Manager data through an AI assistant.</p></div></div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </Panel>
          )}

          {active === "security" && <PasswordSection />}

          {active === "backup" && (
            <Panel title="Backup & data" description="Export a copy of your finance data or sign out of this device.">
              <div className="grid gap-3 md:grid-cols-3">
                <DataAction icon={<Download className="h-5 w-5" />} title="Full backup" description="Accounts, categories, transactions and budgets as JSON." onClick={backup} />
                <DataAction icon={<FileText className="h-5 w-5" />} title="Transaction CSV" description="A spreadsheet-friendly copy of active transactions." onClick={csv} />
                <DataAction icon={<FileSpreadsheet className="h-5 w-5" />} title="Transaction Excel" description="Export active transactions as an .xlsx workbook." onClick={excel} />
              </div>
              <div className="mt-6 border-t pt-4"><Button variant="outline" onClick={signOut} className="gap-1.5"><LogOut className="h-4 w-4" /> Sign out</Button></div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)] md:p-6"><div className="mb-5"><h2 className="font-semibold">{title}</h2>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>{children}</section>;
}

function DataAction({ icon, title, description, onClick }: { icon: ReactNode; title: string; description: string; onClick: () => void | Promise<void> }) {
  return <button type="button" onClick={() => void onClick()} className="rounded-2xl border p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"><div className="mb-5 grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p></button>;
}

function PasswordSection() {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (pw.length < 6) return toast.error("Password must be at least 6 characters");
    if (pw !== confirm) return toast.error("Passwords do not match");
    setBusy(true);
    try { const { error } = await supabase.auth.updateUser({ password: pw }); if (error) throw error; toast.success("Password updated"); setPw(""); setConfirm(""); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  return <Panel title="Security" description="Change the password used for email sign-in."><div className="grid gap-4"><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>New password</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder="At least 6 characters" /></div><div className="grid gap-2"><Label>Confirm password</Label><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></div></div><Button onClick={save} disabled={busy} className="w-fit">{busy ? "Saving…" : "Update password"}</Button></div></Panel>;
}

function CategoriesSection({ categories }: { categories: Category[] }) {
  const { create, update, remove } = useMutateEntity<Category>("categories", ["categories"]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [color, setColor] = useState("#FF5A5F");
  const [parentId, setParentId] = useState("");
  const [editing, setEditing] = useState<Category | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("tag");
  const [editColor, setEditColor] = useState("#FF5A5F");

  const parents = categories.filter((c) => !c.parent_id);
  const filteredParents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return parents.filter((parent) => {
      if (typeFilter !== "all" && parent.type !== typeFilter) return false;
      if (!q) return true;
      const subs = categories.filter((c) => c.parent_id === parent.id);
      return parent.name.toLowerCase().includes(q) || subs.some((sub) => sub.name.toLowerCase().includes(q));
    });
  }, [categories, parents, query, typeFilter]);

  const startEdit = (c: Category) => { setEditing(c); setEditName(c.name); setEditIcon(c.icon ?? "tag"); setEditColor(c.color ?? "#64748B"); };
  const saveEdit = async () => {
    if (!editing) return;
    const trimmed = editName.trim(); if (!trimmed) return toast.error("Enter a name");
    try { await update.mutateAsync({ id: editing.id, name: trimmed, icon: editIcon, color: editColor } as never); toast.success("Category updated"); setEditing(null); }
    catch (e) { toast.error((e as Error).message); }
  };
  const parentColor = parentId ? parents.find((p) => p.id === parentId)?.color ?? color : color;
  const parentType = parentId ? parents.find((p) => p.id === parentId)?.type ?? type : type;

  return (
    <Panel title="Categories" description="Search and organize income and expense categories without scrolling through one huge list.">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search category or subcategory…" className="pl-9" /></div>
        <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem><SelectItem value="expense">Expense</SelectItem><SelectItem value="income">Income</SelectItem></SelectContent></Select>
        <Button variant="outline" onClick={() => setOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Add category</Button>
      </div>

      <div className="grid gap-2">
        {filteredParents.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No categories match your search.</div> : filteredParents.map((parent) => {
          const q = query.trim().toLowerCase();
          const allSubs = categories.filter((c) => c.parent_id === parent.id);
          const subs = q && !parent.name.toLowerCase().includes(q) ? allSubs.filter((sub) => sub.name.toLowerCase().includes(q)) : allSubs;
          return (
            <details key={parent.id} className="group rounded-xl border bg-background/30" open={!!q}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 [&::-webkit-details-marker]:hidden">
                <div className="flex min-w-0 items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${parent.color ?? "#64748B"}22`, color: parent.color ?? "#64748B" }}><CatIcon name={parent.icon} className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-sm font-medium">{parent.name}</p><p className="text-[11px] text-muted-foreground">{parent.type} · {allSubs.length} subcategor{allSubs.length === 1 ? "y" : "ies"}</p></div></div>
                <div className="flex items-center gap-2" onClick={(e) => e.preventDefault()}><button onClick={() => startEdit(parent)} aria-label={`Edit ${parent.name}`}><Pencil className="h-4 w-4 text-muted-foreground hover:text-primary" /></button><button onClick={() => { if (confirm("Delete category and its subcategories?")) remove.mutate(parent.id); }} aria-label="Delete category"><Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" /></button><ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" /></div>
              </summary>
              {subs.length > 0 && <div className="grid gap-1 border-t px-3 py-2 sm:grid-cols-2 xl:grid-cols-3">{subs.map((sub) => <div key={sub.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-muted/50"><span className="flex min-w-0 items-center gap-2 text-xs"><CatIcon name={sub.icon} className="h-3.5 w-3.5 shrink-0" style={{ color: sub.color ?? undefined }} /><span className="truncate">{sub.name}</span></span><span className="flex items-center gap-2"><button onClick={() => startEdit(sub)} aria-label={`Edit ${sub.name}`}><Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" /></button><button onClick={() => { if (confirm("Delete subcategory?")) remove.mutate(sub.id); }} aria-label="Delete subcategory"><Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" /></button></span></div>)}</div>}
            </details>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-sm"><DialogHeader><DialogTitle>New category</DialogTitle></DialogHeader><div className="grid gap-3"><div className="grid gap-2"><Label>Parent (optional)</Label><Select value={parentId || "__none"} onValueChange={(v) => setParentId(v === "__none" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">Top-level category</SelectItem>{parents.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.type})</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>{!parentId && <><div className="grid gap-2"><Label>Type</Label><Select value={type} onValueChange={(v) => setType(v as "income" | "expense")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="expense">Expense</SelectItem><SelectItem value="income">Income</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label>Color</Label><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20" /></div></>}<Button onClick={async () => { if (!name.trim()) return toast.error("Enter a name"); await create.mutateAsync({ name: name.trim(), type: parentType, color: parentColor, parent_id: parentId || null } as Partial<Category>); toast.success(parentId ? "Subcategory added" : "Category added"); setOpen(false); setName(""); setParentId(""); }}>Add</Button></div></DialogContent></Dialog>

      <Dialog open={!!editing} onOpenChange={(next) => !next && setEditing(null)}><DialogContent className="sm:max-w-sm"><DialogHeader><DialogTitle>{editing?.parent_id ? "Edit subcategory" : "Edit category"}</DialogTitle></DialogHeader><div className="grid gap-3"><div className="grid gap-2"><Label>Name</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></div><div className="grid gap-2"><Label>Icon</Label><div className="grid max-h-52 grid-cols-8 gap-1.5 overflow-y-auto rounded-xl border p-2">{ICON_CHOICES.map((icon) => <button key={icon} type="button" onClick={() => setEditIcon(icon)} aria-label={icon} data-active={editIcon === icon} className="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors data-[active=true]:border-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary"><CatIcon name={icon} className="h-4 w-4" /></button>)}</div></div><div className="grid gap-2"><Label>Color</Label><Input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} className="h-10 w-20" /></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={saveEdit} disabled={update.isPending}>{update.isPending ? "Saving…" : "Save"}</Button></div></div></DialogContent></Dialog>
    </Panel>
  );
}

function BudgetsSection({ budgets, categories }: { budgets: Budget[]; categories: Category[] }) {
  const { create, remove } = useMutateEntity<Budget>("budgets", ["budgets"]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [catId, setCatId] = useState("");
  return (
    <Panel title="Budgets" description="Set monthly targets for all spending or a specific category.">
      {budgets.length === 0 ? <div className="mb-4 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No budgets yet.</div> : <div className="mb-4 grid gap-2 sm:grid-cols-2">{budgets.map((budget) => <div key={budget.id} className="flex items-center justify-between rounded-xl border p-3"><div><p className="text-sm font-medium">{budget.name}</p><p className="text-xs text-muted-foreground">{budget.period} · {categories.find((c) => c.id === budget.category_id)?.name ?? "All categories"}</p></div><div className="flex items-center gap-3"><p className="text-sm font-semibold tabular-nums">{Number(budget.amount).toFixed(2)}</p><button onClick={() => remove.mutate(budget.id)} aria-label="Delete budget"><Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" /></button></div></div>)}</div>}
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> New budget</Button>
      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-sm"><DialogHeader><DialogTitle>New budget</DialogTitle></DialogHeader><div className="grid gap-3"><div className="grid gap-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div><div className="grid gap-2"><Label>Amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div><div className="grid gap-2"><Label>Category (optional)</Label><Select value={catId || "__all"} onValueChange={(value) => setCatId(value === "__all" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all">All categories</SelectItem>{categories.filter((c) => c.type === "expense").map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div><Button onClick={async () => { const parsed = parseFloat(amount); if (!name.trim() || !parsed) return toast.error("Enter a name and amount"); await create.mutateAsync({ name: name.trim(), amount: parsed, period: "monthly", category_id: catId || null }); toast.success("Budget added"); setOpen(false); setName(""); setAmount(""); setCatId(""); }}>Add budget</Button></div></DialogContent></Dialog>
    </Panel>
  );
}
