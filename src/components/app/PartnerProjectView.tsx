import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, CircleDollarSign, Download, Pencil, ShoppingCart, WalletCards } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TransactionDialog } from "@/components/app/TransactionDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  useAccounts,
  useCategories,
  useProjects,
  useTransactions,
  type Category,
  type Transaction,
} from "@/hooks/useFinance";
import { useProfile } from "@/hooks/useProfile";
import { formatCurrency } from "@/lib/format";
import {
  exportPartnerActivityCSV,
  exportPartnerActivityExcel,
  exportPartnerActivityPDF,
  type PartnerActivityExportRow,
} from "@/lib/exports";
import { toast } from "sonner";
import {
  PARTNER_ADVANCE_TAG,
  PARTNER_FLOAT_ACCOUNT_TYPE,
  PARTNER_SPEND_TAG,
  hasPartnerTag,
} from "@/lib/partnerLedger";

type LedgerKind = "paid" | "expense";

type Props = {
  projectId: string;
};

function rootCategory(category: Category | undefined, categories: Category[]) {
  if (!category?.parent_id) return category;
  return categories.find((item) => item.id === category.parent_id) ?? category;
}

export function PartnerProjectView({ projectId }: Props) {
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "USD";
  const { data: projects = [] } = useProjects();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: allTx = [] } = useTransactions();

  const project = projects.find((item) => item.id === projectId);
  const partnerAccount = accounts.find((item) => item.type === PARTNER_FLOAT_ACCOUNT_TYPE) ?? null;

  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editOpen, setEditOpen] = useState(false);
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

  const projectTxs = useMemo(() => allTx.filter((tx) => tx.project_id === projectId), [allTx, projectId]);

  const partnerPayments = useMemo(
    () => projectTxs.filter(
      (tx) =>
        tx.type === "transfer" &&
        (
          hasPartnerTag(tx.tags, PARTNER_ADVANCE_TAG) ||
          (!!partnerAccount && tx.to_account_id === partnerAccount.id)
        ),
    ),
    [projectTxs, partnerAccount],
  );

  const partnerExpenses = useMemo(
    () => projectTxs.filter(
      (tx) =>
        tx.type === "expense" &&
        (
          hasPartnerTag(tx.tags, PARTNER_SPEND_TAG) ||
          (!!partnerAccount && tx.account_id === partnerAccount.id)
        ),
    ),
    [projectTxs, partnerAccount],
  );

  const totals = useMemo(() => {
    const sum = (rows: Transaction[]) => rows.reduce((value, tx) => value + Number(tx.amount), 0);
    const paidToPartner = sum(partnerPayments);
    const spentByPartner = sum(partnerExpenses);
    const partnerBalance = paidToPartner - spentByPartner;
    const stillWithPartner = Math.max(0, partnerBalance);
    const ownPocketOverspend = Math.max(0, -partnerBalance);

    const allExpenses = projectTxs
      .filter((tx) => tx.type === "expense")
      .reduce((value, tx) => value + Number(tx.amount), 0);
    const received = projectTxs
      .filter((tx) => tx.type === "income")
      .reduce((value, tx) => value + Number(tx.amount), 0);

    const directOwnerSpend = Math.max(0, allExpenses - spentByPartner);
    const cashPaidByYou = directOwnerSpend + paidToPartner;
    const quoted = Number(project?.quoted_amount ?? 0);
    const realizedProfit = received - allExpenses;
    const projectedProfit = quoted - allExpenses;
    const partnerProfitShare = projectedProfit * (partnerShare / 100);
    const ownerProfitShare = projectedProfit - partnerProfitShare;

    // Single-balance settlement:
    // partner due = base profit share - (money paid to partner - money actually spent by partner)
    const partnerStillDue = partnerProfitShare - partnerBalance;

    return {
      paidToPartner,
      spentByPartner,
      partnerBalance,
      stillWithPartner,
      ownPocketOverspend,
      allExpenses,
      received,
      directOwnerSpend,
      cashPaidByYou,
      quoted,
      realizedProfit,
      projectedProfit,
      partnerProfitShare,
      ownerProfitShare,
      partnerStillDue,
    };
  }, [partnerPayments, partnerExpenses, projectTxs, project, partnerShare]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, {
      name: string;
      amount: number;
      color: string;
      subcategories: Map<string, { name: string; amount: number }>;
    }>();

    for (const tx of partnerExpenses) {
      const cat = categories.find((item) => item.id === tx.category_id);
      const root = rootCategory(cat, categories);
      const key = root?.id ?? "uncategorised";
      const current = map.get(key) ?? {
        name: root?.name ?? "Uncategorised",
        amount: 0,
        color: root?.color ?? "#64748B",
        subcategories: new Map<string, { name: string; amount: number }>(),
      };

      const amount = Number(tx.amount);
      current.amount += amount;

      const subKey = cat?.parent_id ? cat.id : "__direct";
      const subName = cat?.parent_id ? cat.name : "No subcategory";
      const sub = current.subcategories.get(subKey) ?? { name: subName, amount: 0 };
      sub.amount += amount;
      current.subcategories.set(subKey, sub);

      map.set(key, current);
    }

    return [...map.values()]
      .map((item) => ({
        ...item,
        subcategories: [...item.subcategories.values()].sort((a, b) => b.amount - a.amount),
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [partnerExpenses, categories]);

  const ledgerRows = useMemo(() => {
    const rows: Array<{ tx: Transaction; kind: LedgerKind }> = [
      ...partnerPayments.map((tx) => ({ tx, kind: "paid" as const })),
      ...partnerExpenses.map((tx) => ({ tx, kind: "expense" as const })),
    ];
    return rows.sort((a, b) => new Date(b.tx.occurred_at).getTime() - new Date(a.tx.occurred_at).getTime());
  }, [partnerPayments, partnerExpenses]);

  const exportRows = useMemo<PartnerActivityExportRow[]>(() => {
    if (!project) return [];
    return ledgerRows.map(({ tx, kind }) => {
      const category = categories.find((item) => item.id === tx.category_id);
      const root = rootCategory(category, categories);
      const source = accounts.find((item) => item.id === tx.account_id);
      return {
        Date: format(new Date(tx.occurred_at), "yyyy-MM-dd HH:mm"),
        Type: kind === "paid" ? "Paid to Partner" : "Spent by Partner",
        Amount: Number(tx.amount),
        Category: kind === "expense" ? (root?.name ?? "Uncategorised") : "",
        Subcategory: kind === "expense" && category?.parent_id ? category.name : "",
        Details: [tx.vendor, tx.notes].filter(Boolean).join(" · "),
        Account: kind === "paid" ? (source?.name ?? "") : "Partner",
        Project: project.name,
      };
    });
  }, [ledgerRows, categories, accounts, project]);

  const exportActivity = async (formatType: "csv" | "xlsx" | "pdf") => {
    if (!project || exportRows.length === 0) return toast.info("No partner activity to export");
    try {
      if (formatType === "csv") exportPartnerActivityCSV(exportRows, project.name);
      else if (formatType === "xlsx") await exportPartnerActivityExcel(exportRows, project.name);
      else await exportPartnerActivityPDF(exportRows, project.name, currency);
      toast.success(`Partner activity exported as ${formatType === "xlsx" ? "Excel" : formatType.toUpperCase()}`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  if (!project) return null;

  const balanceLabel = totals.partnerBalance >= 0 ? "Still with partner" : "Partner spent from own pocket";
  const balanceTone = totals.partnerBalance >= 0 ? "text-amber-600" : "text-destructive";

  return (
    <div className="grid gap-5">
      <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Partner ledger</p>
            <h3 className="mt-1 text-xl font-semibold">One balance for partner payments and partner spending</h3>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Transfer money using <span className="font-medium text-foreground">Paid to Partner</span>. Mark actual project purchases as <span className="font-medium text-foreground">Spent by → Partner</span>. The difference automatically adjusts final settlement.
            </p>
          </div>
          <div className="max-w-md rounded-xl border bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
            Formula: <span className="font-medium text-foreground">Partner balance = Paid to Partner − Spent by Partner</span>. A negative balance means he spent his own money and must be reimbursed.
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Paid to partner" value={formatCurrency(totals.paidToPartner, currency)} icon={<ArrowUpRight className="h-4 w-4" />} />
        <Metric label="Spent by partner" value={formatCurrency(totals.spentByPartner, currency)} icon={<ShoppingCart className="h-4 w-4" />} />
        <Metric label={balanceLabel} value={formatCurrency(Math.abs(totals.partnerBalance), currency)} icon={<WalletCards className="h-4 w-4" />} valueClass={balanceTone} />
        <Metric label="Partner still due" value={formatCurrency(totals.partnerStillDue, currency)} icon={<CircleDollarSign className="h-4 w-4" />} valueClass="text-primary" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
          <div className="mb-4">
            <h3 className="font-semibold">Project profitability</h3>
            <p className="mt-1 text-xs text-muted-foreground">Only actual project expenses reduce project profit. Money paid to the partner is settlement/working money, not a second project cost.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <SmallMetric label="Client received" value={formatCurrency(totals.received, currency)} />
            <SmallMetric label="Total Project Expenses" value={formatCurrency(totals.allExpenses, currency)} />
            <SmallMetric label="Cash Paid by You" value={formatCurrency(totals.cashPaidByYou, currency)} />
            <SmallMetric label="Spent by partner" value={formatCurrency(totals.spentByPartner, currency)} />
            <SmallMetric label="Realized profit so far" value={formatCurrency(totals.realizedProfit, currency)} valueClass={totals.realizedProfit >= 0 ? "text-[color:var(--success)]" : "text-destructive"} />
            <SmallMetric label="Projected final profit" value={formatCurrency(totals.projectedProfit, currency)} valueClass={totals.projectedProfit >= 0 ? "text-[color:var(--success)]" : "text-destructive"} />
          </div>
          <div className="mt-4 grid gap-1 rounded-xl bg-muted/45 p-3 text-xs text-muted-foreground">
            <p>Projected final profit = quoted amount ({formatCurrency(totals.quoted, currency)}) minus Total Project Expenses.</p>
            <p>Cash Paid by You = direct project expenses ({formatCurrency(totals.directOwnerSpend, currency)}) + money paid to partner ({formatCurrency(totals.paidToPartner, currency)}). Partner-paid labour/material is already included in Total Project Expenses.</p>
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold">Profit settlement</h3>
              <p className="mt-1 text-xs text-muted-foreground">Partner balance is automatically added to or deducted from his base profit share.</p>
            </div>
            <div className="w-28">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Partner %</Label>
              <Input className="mt-1 h-9" type="number" min={0} max={100} value={partnerShare} onChange={(e) => savePartnerShare(Number(e.target.value))} />
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            <SettlementRow label="Your projected profit share" value={formatCurrency(totals.ownerProfitShare, currency)} />
            <SettlementRow label="Partner base profit share" value={formatCurrency(totals.partnerProfitShare, currency)} />
            <SettlementRow label="Paid to partner" value={formatCurrency(totals.paidToPartner, currency)} />
            <SettlementRow label="Spent by partner" value={formatCurrency(totals.spentByPartner, currency)} />

            {totals.stillWithPartner > 0 && (
              <SettlementRow
                label="Less: still with partner"
                value={`−${formatCurrency(totals.stillWithPartner, currency)}`}
                valueClass="text-amber-600"
              />
            )}
            {totals.ownPocketOverspend > 0 && (
              <SettlementRow
                label="Add: partner own-pocket overspend"
                value={`+${formatCurrency(totals.ownPocketOverspend, currency)}`}
                valueClass="text-destructive"
              />
            )}

            <div className="my-1 border-t" />
            <SettlementRow
              label={totals.partnerStillDue >= 0 ? "Partner still due" : "Partner already overpaid"}
              value={formatCurrency(Math.abs(totals.partnerStillDue), currency)}
              strong
              valueClass={totals.partnerStillDue >= 0 ? "text-primary" : "text-destructive"}
            />
          </div>

          <div className="mt-4 rounded-xl border bg-muted/35 p-3 text-xs text-muted-foreground">
            Example: base share ₹1,00,000, paid ₹5,000, spent ₹10,000 → own-pocket overspend ₹5,000 → partner still due ₹1,05,000.
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
          <h3 className="font-semibold">Partner spending by category</h3>
          <p className="mt-1 text-xs text-muted-foreground">Actual material, labour and other project expenses marked Spent by Partner.</p>
          {categoryBreakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No partner expenses recorded yet.</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {categoryBreakdown.map((item) => {
                const pct = totals.spentByPartner > 0 ? (item.amount / totals.spentByPartner) * 100 : 0;
                return (
                  <div key={item.name} className="rounded-xl border bg-muted/15 p-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />{item.name}</span>
                      <span className="tabular-nums text-muted-foreground">{formatCurrency(item.amount, currency)} · {pct.toFixed(0)}%</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: item.color }} />
                    </div>

                    <div className="mt-3 grid gap-2 border-l-2 pl-3" style={{ borderColor: item.color }}>
                      {item.subcategories.map((sub) => {
                        const subPct = item.amount > 0 ? (sub.amount / item.amount) * 100 : 0;
                        return (
                          <div key={sub.name} className="flex items-center justify-between gap-3 text-xs">
                            <span className="truncate text-muted-foreground">{sub.name}</span>
                            <span className="shrink-0 tabular-nums">
                              {formatCurrency(sub.amount, currency)}
                              <span className="ml-1 text-muted-foreground">· {subPct.toFixed(0)}%</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
            <div>
              <h3 className="font-semibold">Partner activity</h3>
              <p className="mt-1 text-xs text-muted-foreground">Only money paid to the partner and actual project expenses spent by the partner.</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" disabled={ledgerRows.length === 0}>
                  <Download className="h-4 w-4" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void exportActivity("csv")}>CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void exportActivity("xlsx")}>Excel (.xlsx)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void exportActivity("pdf")}>PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {ledgerRows.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">No partner activity yet.</div>
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
                    const detail = kind === "expense"
                      ? [rootCategory(category, categories)?.name, category?.parent_id ? category.name : null, tx.vendor, tx.notes].filter(Boolean).join(" · ")
                      : [source?.name, "Paid to Partner", tx.notes].filter(Boolean).join(" → ");
                    return (
                      <tr key={tx.id} className="hover:bg-muted/35">
                        <td className="whitespace-nowrap px-4 py-3">
                          <p className="font-medium">{format(new Date(tx.occurred_at), "dd MMM yyyy")}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(tx.occurred_at), "HH:mm")}</p>
                        </td>
                        <td className="px-4 py-3"><LedgerBadge kind={kind} /></td>
                        <td className="max-w-[380px] px-4 py-3 text-muted-foreground">{detail || "—"}</td>
                        <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${kind === "paid" ? "text-[color:var(--success)]" : "text-primary"}`}>
                          {formatCurrency(Number(tx.amount), currency)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingTx(tx); setEditOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

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

function Metric({ label, value, icon, valueClass = "" }: { label: string; value: string; icon: ReactNode; valueClass?: string }) {
  return <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]"><div className="flex items-center gap-2 text-muted-foreground">{icon}<p className="text-[10px] uppercase tracking-wide">{label}</p></div><p className={`mt-2 text-xl font-semibold tabular-nums ${valueClass}`}>{value}</p></div>;
}

function SmallMetric({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return <div className="rounded-xl bg-muted/45 p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-1 text-base font-semibold tabular-nums ${valueClass}`}>{value}</p></div>;
}

function SettlementRow({ label, value, strong = false, valueClass = "" }: { label: string; value: string; strong?: boolean; valueClass?: string }) {
  return <div className={`flex items-center justify-between gap-3 text-sm ${strong ? "font-semibold" : ""}`}><span className="text-muted-foreground">{label}</span><span className={`tabular-nums ${valueClass}`}>{value}</span></div>;
}

function LedgerBadge({ kind }: { kind: LedgerKind }) {
  const meta = kind === "paid"
    ? { label: "Paid", className: "bg-emerald-500/10 text-emerald-600" }
    : { label: "Spent", className: "bg-primary/10 text-primary" };
  return <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${meta.className}`}>{meta.label}</span>;
}
