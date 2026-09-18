import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, HandCoins, Landmark, Pencil, ReceiptIndianRupee, RotateCcw, ShoppingCart, WalletCards } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TransactionDialog } from "@/components/app/TransactionDialog";
import {
  useAccounts,
  useCategories,
  useMutateEntity,
  useProjects,
  useSoftDeleteTx,
  useTransactions,
  type Account,
  type Category,
  type Transaction,
} from "@/hooks/useFinance";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/format";
import {
  PARTNER_ADVANCE_TAG,
  PARTNER_DRAWING_TAG,
  PARTNER_DRAWINGS_ACCOUNT_TYPE,
  PARTNER_FLOAT_ACCOUNT_TYPE,
  PARTNER_RETURN_TAG,
  PARTNER_SPEND_TAG,
  isPartnerSystemAccountType,
} from "@/lib/partnerLedger";
import { toast } from "sonner";

type ActionMode = "advance" | "expense" | "drawing" | "return";

type Props = {
  projectId: string;
};

function toLocalInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function rootCategory(category: Category | undefined, categories: Category[]) {
  if (!category?.parent_id) return category;
  return categories.find((item) => item.id === category.parent_id) ?? category;
}

export function PartnerProjectView({ projectId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "USD";
  const { data: projects = [] } = useProjects();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: allTx = [] } = useTransactions();
  const { create: createTx, update: updateTx } = useMutateEntity<Transaction>("transactions", ["transactions", "accounts"]);
  const softDeleteTx = useSoftDeleteTx();

  const project = projects.find((item) => item.id === projectId);
  const floatAccount = accounts.find((item) => item.type === PARTNER_FLOAT_ACCOUNT_TYPE) ?? null;
  const drawingsAccount = accounts.find((item) => item.type === PARTNER_DRAWINGS_ACCOUNT_TYPE) ?? null;
  const normalAccounts = accounts.filter((item) => !isPartnerSystemAccountType(item.type));

  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [partnerShare, setPartnerShare] = useState(50);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(`money-manager:partner-share:${projectId}`) : null;
    const parsed = stored ? Number(stored) : 50;
    setPartnerShare(Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 50);
  }, [projectId]);

  const savePartnerShare = (value: number) => {
    const next = Math.min(100, Math.max(0, value || 0));
    setPartnerShare(next);
    if (typeof window !== "undefined") window.localStorage.setItem(`money-manager:partner-share:${projectId}`, String(next));
  };

  const ensurePartnerAccounts = async () => {
    if (!user) throw new Error("You must be signed in");
    let nextFloat = floatAccount;
    let nextDrawings = drawingsAccount;

    if (nextFloat && nextDrawings) return { float: nextFloat, drawings: nextDrawings };

    setSettingUp(true);
    try {
      const rows: Array<Record<string, unknown>> = [];
      if (!nextFloat) {
        rows.push({
          user_id: user.id,
          name: "Partner Float",
          type: PARTNER_FLOAT_ACCOUNT_TYPE,
          icon: "wallet-cards",
          color: "#0EA5E9",
          opening_balance: 0,
          currency,
          archived: false,
        });
      }
      if (!nextDrawings) {
        rows.push({
          user_id: user.id,
          name: "Partner Drawings",
          type: PARTNER_DRAWINGS_ACCOUNT_TYPE,
          icon: "hand-coins",
          color: "#F59E0B",
          opening_balance: 0,
          currency,
          archived: false,
        });
      }

      if (rows.length > 0) {
        const { data, error } = await supabase.from("accounts").insert(rows as never).select("*");
        if (error) throw error;
        for (const account of (data ?? []) as unknown as Account[]) {
          if (account.type === PARTNER_FLOAT_ACCOUNT_TYPE) nextFloat = account;
          if (account.type === PARTNER_DRAWINGS_ACCOUNT_TYPE) nextDrawings = account;
        }
        await qc.invalidateQueries({ queryKey: ["accounts"] });
      }

      if (!nextFloat || !nextDrawings) throw new Error("Could not initialize partner tracking accounts");
      return { float: nextFloat, drawings: nextDrawings };
    } finally {
      setSettingUp(false);
    }
  };

  const projectTxs = useMemo(() => allTx.filter((tx) => tx.project_id === projectId), [allTx, projectId]);

  const ledger = useMemo(() => {
    if (!floatAccount || !drawingsAccount) {
      return { advances: [] as Transaction[], expenses: [] as Transaction[], drawings: [] as Transaction[], returns: [] as Transaction[] };
    }
    const advances = projectTxs.filter((tx) => tx.type === "transfer" && tx.to_account_id === floatAccount.id);
    const expenses = projectTxs.filter((tx) => tx.type === "expense" && tx.account_id === floatAccount.id);
    const drawings = projectTxs.filter((tx) => tx.type === "transfer" && tx.account_id === floatAccount.id && tx.to_account_id === drawingsAccount.id);
    const returns = projectTxs.filter((tx) => tx.type === "transfer" && tx.account_id === floatAccount.id && tx.to_account_id !== drawingsAccount.id);
    return { advances, expenses, drawings, returns };
  }, [projectTxs, floatAccount, drawingsAccount]);

  const totals = useMemo(() => {
    const sum = (rows: Transaction[]) => rows.reduce((value, tx) => value + Number(tx.amount), 0);
    const given = sum(ledger.advances);
    const partnerExpenses = sum(ledger.expenses);
    const drawings = sum(ledger.drawings);
    const returned = sum(ledger.returns);
    const balance = given - partnerExpenses - drawings - returned;
    const allExpenses = projectTxs.filter((tx) => tx.type === "expense").reduce((value, tx) => value + Number(tx.amount), 0);
    const received = projectTxs.filter((tx) => tx.type === "income").reduce((value, tx) => value + Number(tx.amount), 0);
    const directOwnerSpend = Math.max(0, allExpenses - partnerExpenses);
    const quoted = Number(project?.quoted_amount ?? 0);
    const realizedProfit = received - allExpenses;
    const projectedProfit = quoted - allExpenses;
    const partnerEntitlement = projectedProfit * (partnerShare / 100);
    const ownerEntitlement = projectedProfit - partnerEntitlement;
    const partnerStillDue = partnerEntitlement - drawings;
    return {
      given,
      partnerExpenses,
      drawings,
      returned,
      balance,
      allExpenses,
      received,
      directOwnerSpend,
      quoted,
      realizedProfit,
      projectedProfit,
      partnerEntitlement,
      ownerEntitlement,
      partnerStillDue,
    };
  }, [ledger, projectTxs, project, partnerShare]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; amount: number; color: string }>();
    for (const tx of ledger.expenses) {
      const cat = categories.find((item) => item.id === tx.category_id);
      const root = rootCategory(cat, categories);
      const key = root?.id ?? "uncategorised";
      const current = map.get(key) ?? { name: root?.name ?? "Uncategorised", amount: 0, color: root?.color ?? "#64748B" };
      current.amount += Number(tx.amount);
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [ledger.expenses, categories]);

  const ledgerRows = useMemo(() => {
    if (!floatAccount || !drawingsAccount) return [];
    return projectTxs
      .filter((tx) =>
        (tx.type === "expense" && tx.account_id === floatAccount.id) ||
        (tx.type === "transfer" && (tx.account_id === floatAccount.id || tx.to_account_id === floatAccount.id)),
      )
      .map((tx) => {
        let kind: ActionMode = "expense";
        if (tx.type === "transfer" && tx.to_account_id === floatAccount.id) kind = "advance";
        else if (tx.type === "transfer" && tx.account_id === floatAccount.id && tx.to_account_id === drawingsAccount.id) kind = "drawing";
        else if (tx.type === "transfer" && tx.account_id === floatAccount.id) kind = "return";
        return { tx, kind };
      })
      .sort((a, b) => new Date(b.tx.occurred_at).getTime() - new Date(a.tx.occurred_at).getTime());
  }, [projectTxs, floatAccount, drawingsAccount]);

  if (!project) return null;

  const balanceLabel = totals.balance >= 0 ? "Partner holds" : "You owe partner";
  const balanceTone = totals.balance >= 0 ? "text-amber-600" : "text-destructive";

  const openAction = async (mode: ActionMode) => {
    try {
      await ensurePartnerAccounts();
      setActionMode(mode);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <div className="grid gap-5">
      <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Partner ledger</p>
            <h3 className="mt-1 text-xl font-semibold">Project money held and spent by your execution partner</h3>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Money you give the partner is tracked as a transfer, not an expense. Only actual material/labour/project purchases reduce project profit.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => void openAction("advance")} disabled={settingUp}><ArrowUpRight className="h-4 w-4" /> Give to partner</Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void openAction("expense")} disabled={settingUp}><ShoppingCart className="h-4 w-4" /> Partner expense</Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void openAction("drawing")} disabled={settingUp}><HandCoins className="h-4 w-4" /> Partner drawing</Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void openAction("return")} disabled={settingUp}><RotateCcw className="h-4 w-4" /> Money returned</Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Given to partner" value={formatCurrency(totals.given, currency)} icon={<ArrowUpRight className="h-4 w-4" />} />
        <Metric label="Partner expenses" value={formatCurrency(totals.partnerExpenses, currency)} icon={<ShoppingCart className="h-4 w-4" />} />
        <Metric label={balanceLabel} value={formatCurrency(Math.abs(totals.balance), currency)} icon={<WalletCards className="h-4 w-4" />} valueClass={balanceTone} />
        <Metric label="Partner drawings" value={formatCurrency(totals.drawings, currency)} icon={<HandCoins className="h-4 w-4" />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
          <div className="mb-4">
            <h3 className="font-semibold">Project profitability</h3>
            <p className="mt-1 text-xs text-muted-foreground">Partner advances and drawings are transfers, so they are not counted twice as project costs.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <SmallMetric label="Client received" value={formatCurrency(totals.received, currency)} />
            <SmallMetric label="Total actual cost" value={formatCurrency(totals.allExpenses, currency)} />
            <SmallMetric label="Paid directly by you" value={formatCurrency(totals.directOwnerSpend, currency)} />
            <SmallMetric label="Paid by partner" value={formatCurrency(totals.partnerExpenses, currency)} />
            <SmallMetric label="Realized profit so far" value={formatCurrency(totals.realizedProfit, currency)} valueClass={totals.realizedProfit >= 0 ? "text-[color:var(--success)]" : "text-destructive"} />
            <SmallMetric label="Projected final profit" value={formatCurrency(totals.projectedProfit, currency)} valueClass={totals.projectedProfit >= 0 ? "text-[color:var(--success)]" : "text-destructive"} />
          </div>
          <div className="mt-4 rounded-xl bg-muted/45 p-3 text-xs text-muted-foreground">
            Projected final profit = quoted amount ({formatCurrency(totals.quoted, currency)}) minus all actual project expenses. Realized profit uses money received so far.
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold">Profit settlement</h3>
              <p className="mt-1 text-xs text-muted-foreground">Use the partner's agreed profit percentage. This setting is saved on this device.</p>
            </div>
            <div className="w-28">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Partner %</Label>
              <Input className="mt-1 h-9" type="number" min={0} max={100} value={partnerShare} onChange={(e) => savePartnerShare(Number(e.target.value))} />
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            <SettlementRow label="Your projected share" value={formatCurrency(totals.ownerEntitlement, currency)} />
            <SettlementRow label="Partner projected share" value={formatCurrency(totals.partnerEntitlement, currency)} />
            <SettlementRow label="Already taken as drawings" value={formatCurrency(totals.drawings, currency)} />
            <div className="my-1 border-t" />
            <SettlementRow
              label={totals.partnerStillDue >= 0 ? "Partner still due" : "Partner overdrawn"}
              value={formatCurrency(Math.abs(totals.partnerStillDue), currency)}
              strong
              valueClass={totals.partnerStillDue >= 0 ? "text-primary" : "text-destructive"}
            />
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
          <h3 className="font-semibold">Partner spending by category</h3>
          <p className="mt-1 text-xs text-muted-foreground">Material, labour and every other category paid from Partner Float.</p>
          {categoryBreakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No partner expenses recorded yet.</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {categoryBreakdown.map((item) => {
                const pct = totals.partnerExpenses > 0 ? (item.amount / totals.partnerExpenses) * 100 : 0;
                return (
                  <div key={item.name}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 font-medium"><span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />{item.name}</span>
                      <span className="tabular-nums text-muted-foreground">{formatCurrency(item.amount, currency)} · {pct.toFixed(0)}%</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: item.color }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-soft)]">
          <div className="border-b p-5">
            <h3 className="font-semibold">Partner ledger activity</h3>
            <p className="mt-1 text-xs text-muted-foreground">Advances, actual partner expenses, drawings and returned money for this project.</p>
          </div>
          {ledgerRows.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">No partner ledger activity yet.</div>
          ) : (
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 bg-card/95 text-left text-[10px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <tr><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Details</th><th className="px-4 py-3 text-right font-medium">Amount</th><th className="px-4 py-3 text-right font-medium">Edit</th></tr>
                </thead>
                <tbody className="divide-y">
                  {ledgerRows.map(({ tx, kind }) => {
                    const category = categories.find((item) => item.id === tx.category_id);
                    const source = accounts.find((item) => item.id === tx.account_id);
                    const destination = accounts.find((item) => item.id === tx.to_account_id);
                    const detail = kind === "expense"
                      ? [rootCategory(category, categories)?.name, category?.parent_id ? category.name : null, tx.vendor, tx.notes].filter(Boolean).join(" · ")
                      : [source?.name, destination?.name, tx.notes].filter(Boolean).join(" → ");
                    return (
                      <tr key={tx.id} className="hover:bg-muted/35">
                        <td className="whitespace-nowrap px-4 py-3"><p className="font-medium">{format(new Date(tx.occurred_at), "dd MMM yyyy")}</p><p className="text-xs text-muted-foreground">{format(new Date(tx.occurred_at), "HH:mm")}</p></td>
                        <td className="px-4 py-3"><LedgerBadge kind={kind} /></td>
                        <td className="max-w-[380px] px-4 py-3 text-muted-foreground">{detail || "—"}</td>
                        <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${kind === "advance" ? "text-[color:var(--success)]" : "text-primary"}`}>{formatCurrency(Number(tx.amount), currency)}</td>
                        <td className="px-4 py-2 text-right"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingTx(tx); setEditOpen(true); }}><Pencil className="h-4 w-4" /></Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <PartnerActionDialog
        open={!!actionMode}
        mode={actionMode}
        onOpenChange={(open) => !open && setActionMode(null)}
        normalAccounts={normalAccounts}
        categories={categories}
        projectId={projectId}
        currency={currency}
        ensureAccounts={ensurePartnerAccounts}
        submitting={createTx.isPending || settingUp}
        onCreate={async (payload) => {
          try {
            await createTx.mutateAsync(payload);
            toast.success(actionSuccess(actionMode));
            setActionMode(null);
          } catch (error) {
            toast.error((error as Error).message);
          }
        }}
      />

      <TransactionDialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditingTx(null);
        }}
        editing={editingTx}
      />
    </div>
  );
}

function actionSuccess(mode: ActionMode | null) {
  if (mode === "advance") return "Money given to partner recorded";
  if (mode === "expense") return "Partner expense recorded";
  if (mode === "drawing") return "Partner drawing recorded";
  if (mode === "return") return "Returned money recorded";
  return "Partner ledger updated";
}

function Metric({ label, value, icon, valueClass = "" }: { label: string; value: string; icon: React.ReactNode; valueClass?: string }) {
  return <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]"><div className="flex items-center gap-2 text-muted-foreground">{icon}<p className="text-[10px] uppercase tracking-wide">{label}</p></div><p className={`mt-2 text-xl font-semibold tabular-nums ${valueClass}`}>{value}</p></div>;
}

function SmallMetric({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return <div className="rounded-xl bg-muted/45 p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-1 text-base font-semibold tabular-nums ${valueClass}`}>{value}</p></div>;
}

function SettlementRow({ label, value, strong = false, valueClass = "" }: { label: string; value: string; strong?: boolean; valueClass?: string }) {
  return <div className={`flex items-center justify-between gap-3 text-sm ${strong ? "font-semibold" : ""}`}><span className="text-muted-foreground">{label}</span><span className={`tabular-nums ${valueClass}`}>{value}</span></div>;
}

function LedgerBadge({ kind }: { kind: ActionMode }) {
  const meta = {
    advance: { label: "Given", className: "bg-emerald-500/10 text-emerald-600" },
    expense: { label: "Expense", className: "bg-primary/10 text-primary" },
    drawing: { label: "Drawing", className: "bg-amber-500/10 text-amber-700" },
    return: { label: "Returned", className: "bg-blue-500/10 text-blue-600" },
  }[kind];
  return <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${meta.className}`}>{meta.label}</span>;
}

function PartnerActionDialog({
  open,
  mode,
  onOpenChange,
  normalAccounts,
  categories,
  projectId,
  currency,
  ensureAccounts,
  submitting,
  onCreate,
}: {
  open: boolean;
  mode: ActionMode | null;
  onOpenChange: (open: boolean) => void;
  normalAccounts: Account[];
  categories: Category[];
  projectId: string;
  currency: string;
  ensureAccounts: () => Promise<{ float: Account; drawings: Account }>;
  submitting: boolean;
  onCreate: (payload: Partial<Transaction>) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subCategoryId, setSubCategoryId] = useState("");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => toLocalInputValue(new Date()));

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setAccountId(normalAccounts[0]?.id ?? "");
    setCategoryId("");
    setSubCategoryId("");
    setVendor("");
    setNotes("");
    setOccurredAt(toLocalInputValue(new Date()));
  }, [open, mode, normalAccounts]);

  if (!mode) return null;

  const parentCategories = categories.filter((item) => item.type === "expense" && !item.parent_id);
  const subCategories = categories.filter((item) => item.parent_id === categoryId);
  const title = mode === "advance" ? "Give money to partner" : mode === "expense" ? "Record partner expense" : mode === "drawing" ? "Record partner drawing" : "Record money returned";
  const accountLabel = mode === "advance" ? "From account" : mode === "return" ? "Return to account" : null;

  const submit = async () => {
    const value = Number(amount);
    if (!value || value <= 0) return toast.error("Enter a valid amount");
    if ((mode === "advance" || mode === "return") && !accountId) return toast.error("Select an account");
    if (mode === "expense" && !categoryId) return toast.error("Select an expense category");

    const system = await ensureAccounts();
    const occurred_at = new Date(occurredAt).toISOString();

    if (mode === "advance") {
      await onCreate({
        type: "transfer",
        amount: value,
        account_id: accountId,
        to_account_id: system.float.id,
        category_id: null,
        project_id: projectId,
        notes: notes || "Money given to execution partner",
        vendor: "Execution Partner",
        tags: [PARTNER_ADVANCE_TAG],
        occurred_at,
        status: "paid",
      });
      return;
    }

    if (mode === "expense") {
      await onCreate({
        type: "expense",
        amount: value,
        account_id: system.float.id,
        to_account_id: null,
        category_id: subCategoryId || categoryId,
        project_id: projectId,
        notes: notes || null,
        vendor: vendor || null,
        payment_method: "Partner Float",
        tags: [PARTNER_SPEND_TAG],
        occurred_at,
        status: "paid",
      });
      return;
    }

    if (mode === "drawing") {
      await onCreate({
        type: "transfer",
        amount: value,
        account_id: system.float.id,
        to_account_id: system.drawings.id,
        category_id: null,
        project_id: projectId,
        notes: notes || "Partner profit advance / drawing",
        vendor: "Execution Partner",
        tags: [PARTNER_DRAWING_TAG],
        occurred_at,
        status: "paid",
      });
      return;
    }

    await onCreate({
      type: "transfer",
      amount: value,
      account_id: system.float.id,
      to_account_id: accountId,
      category_id: null,
      project_id: projectId,
      notes: notes || "Money returned by execution partner",
      vendor: "Execution Partner",
      tags: [PARTNER_RETURN_TAG],
      occurred_at,
      status: "paid",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Amount ({currency})</Label>
            <Input autoFocus type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-11 text-lg font-semibold" />
          </div>

          {accountLabel && (
            <div className="grid gap-2">
              <Label>{accountLabel}</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{normalAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          {mode === "expense" && (
            <>
              <div className="grid gap-2">
                <Label>Expense category</Label>
                <Select value={categoryId} onValueChange={(value) => { setCategoryId(value); setSubCategoryId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Material, Labour, Transport…" /></SelectTrigger>
                  <SelectContent>{parentCategories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {subCategories.length > 0 && (
                <div className="grid gap-2">
                  <Label>Subcategory</Label>
                  <Select value={subCategoryId || "__none"} onValueChange={(value) => setSubCategoryId(value === "__none" ? "" : value)}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent><SelectItem value="__none">No subcategory</SelectItem>{subCategories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-2">
                <Label>Vendor / Payee</Label>
                <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Shop, carpenter, painter…" />
              </div>
            </>
          )}

          <div className="grid gap-2">
            <Label>Date & time</Label>
            <Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Note</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note" />
          </div>

          <div className="rounded-xl border bg-muted/35 p-3 text-xs text-muted-foreground">
            {mode === "advance" && "This is recorded as a transfer to Partner Float, so it does not reduce project profit."}
            {mode === "expense" && "This is a real project expense paid by your partner. It reduces Partner Float and counts in project cost."}
            {mode === "drawing" && "This reduces Partner Float but is not treated as a project cost. It is deducted from the partner's final profit settlement."}
            {mode === "return" && "This transfers unused Partner Float back to your selected account without changing project profit."}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => void submit()} disabled={submitting}>{submitting ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
