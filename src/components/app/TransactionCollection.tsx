import { format } from "date-fns";
import { Pencil, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReceiptIndicator } from "./ReceiptIndicator";
import { formatCurrency } from "@/lib/format";
import type { Account, Category, Project, Transaction } from "@/hooks/useFinance";
import { PARTNER_FLOAT_ACCOUNT_TYPE, PARTNER_SPEND_TAG, hasPartnerTag, withoutPartnerSystemTags } from "@/lib/partnerLedger";

export type TransactionViewMode = "list" | "table";

type Props = {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  projects?: Project[];
  currency: string;
  view: TransactionViewMode;
  emptyMessage?: string;
  readOnly?: boolean;
  onEdit?: (tx: Transaction) => void;
  onDelete?: (tx: Transaction) => void;
  onFavorite?: (tx: Transaction) => void;
  onTagClick?: (tag: string) => void;
};

function txMeta(tx: Transaction, categories: Category[], accounts: Account[], projects: Project[]) {
  const cat = categories.find((c) => c.id === tx.category_id);
  const parent = cat?.parent_id ? categories.find((c) => c.id === cat.parent_id) : null;
  const acc = accounts.find((a) => a.id === tx.account_id);
  const project = projects.find((p) => p.id === tx.project_id);
  const categoryLabel = parent ? `${parent.name} · ${cat?.name}` : cat?.name ?? tx.type;
  const spentByPartner = tx.type === "expense" && (acc?.type === PARTNER_FLOAT_ACCOUNT_TYPE || hasPartnerTag(tx.tags, PARTNER_SPEND_TAG));
  const displayTags = withoutPartnerSystemTags(tx.tags);
  return { cat, acc, project, categoryLabel, spentByPartner, displayTags };
}

function amountMeta(tx: Transaction) {
  const sign = tx.type === "income" ? "+" : tx.type === "expense" ? "−" : "";
  const color = tx.type === "income" ? "text-[color:var(--success)]" : tx.type === "expense" ? "text-primary" : "text-secondary";
  return { sign, color };
}

export function TransactionCollection(props: Props) {
  if (props.transactions.length === 0) {
    return <div className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">{props.emptyMessage ?? "No transactions found."}</div>;
  }
  if (props.view === "table") return <TransactionTable {...props} />;
  return <TransactionList {...props} />;
}

function TransactionList({ transactions, categories, accounts, projects = [], currency, readOnly = false, onEdit, onDelete, onFavorite, onTagClick }: Props) {
  const groups = new Map<string, Transaction[]>();
  transactions.forEach((tx) => {
    const key = format(new Date(tx.occurred_at), "yyyy-MM-dd");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(tx);
  });

  return (
    <div className="grid gap-3">
      {[...groups.entries()].map(([day, rows]) => {
        const total = rows.reduce((sum, tx) => sum + (tx.type === "income" ? Number(tx.amount) : tx.type === "expense" ? -Number(tx.amount) : 0), 0);
        return (
          <section key={day} className="overflow-visible rounded-2xl border bg-card shadow-[var(--shadow-soft)]">
            <div className="sticky top-3 z-10 flex items-center justify-between rounded-t-2xl border-b bg-card/95 px-4 py-3 backdrop-blur md:top-4">
              <p className="text-sm font-semibold">{format(new Date(day), "EEE, MMM d")}</p>
              <p className={`text-sm font-semibold tabular-nums ${total >= 0 ? "text-[color:var(--success)]" : "text-primary"}`}>{total >= 0 ? "+" : ""}{formatCurrency(total, currency)}</p>
            </div>
            <ul className="divide-y divide-border/70 px-2 py-1">
              {rows.map((tx) => {
                const { cat, acc, project, categoryLabel, spentByPartner, displayTags } = txMeta(tx, categories, accounts, projects);
                const { sign, color } = amountMeta(tx);
                return (
                  <li key={tx.id} className="group flex items-start gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-muted/50">
                    <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-semibold text-white" style={{ background: cat?.color ?? "var(--muted-foreground)" }}>{(cat?.name ?? tx.type).slice(0, 2).toUpperCase()}</div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 break-words text-sm font-medium md:text-[15px]">{tx.vendor || tx.notes || cat?.name || "Transaction"}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{categoryLabel} · {spentByPartner ? "Partner" : (acc?.name ?? "—")}{tx.payment_method && !spentByPartner ? ` · ${tx.payment_method}` : ""}{project ? ` · ${project.name}` : ""} · {format(new Date(tx.occurred_at), "HH:mm")}</p>
                      <ReceiptIndicator receiptPath={tx.receipt_path} />
                      {spentByPartner && <div className="mt-1.5"><span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700">Spent by Partner</span></div>}{displayTags.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{displayTags.map((tag) => onTagClick ? <button key={tag} type="button" onClick={() => onTagClick(tag)} className="rounded-full border border-primary/25 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10">#{tag}</button> : <span key={tag} className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">#{tag}</span>)}</div>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <p className={`text-sm font-semibold tabular-nums md:text-[15px] ${color}`}>{sign}{formatCurrency(Number(tx.amount), currency)}</p>
                      {!readOnly && (onFavorite || onEdit || onDelete) && <div className="flex items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">{onFavorite && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onFavorite(tx)} aria-label="Favorite transaction"><Star className={`h-3.5 w-3.5 ${tx.favorite ? "fill-[color:var(--warning)] text-[color:var(--warning)]" : ""}`} /></Button>}{onEdit && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(tx)} aria-label="Edit transaction"><Pencil className="h-3.5 w-3.5" /></Button>}{onDelete && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(tx)} aria-label="Delete transaction"><Trash2 className="h-3.5 w-3.5" /></Button>}</div>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function TransactionTable({ transactions, categories, accounts, projects = [], currency, readOnly = false, onEdit, onDelete, onFavorite, onTagClick }: Props) {
  const showActions = !readOnly && !!(onEdit || onDelete || onFavorite);
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-soft)]">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-card/95 text-left text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
            <tr className="border-b"><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Description</th><th className="px-4 py-3 font-medium">Category</th><th className="px-4 py-3 font-medium">Project</th><th className="px-4 py-3 font-medium">Account</th><th className="px-4 py-3 font-medium">Receipt</th><th className="px-4 py-3 text-right font-medium">Amount</th>{showActions && <th className="px-4 py-3 text-right font-medium">Actions</th>}</tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {transactions.map((tx) => {
              const { cat, acc, project, categoryLabel } = txMeta(tx, categories, accounts, projects);
              const { sign, color } = amountMeta(tx);
              return (
                <tr key={tx.id} className="group transition-colors hover:bg-muted/40">
                  <td className="whitespace-nowrap px-4 py-3 align-top"><p className="font-medium">{format(new Date(tx.occurred_at), "dd MMM yyyy")}</p><p className="text-xs text-muted-foreground">{format(new Date(tx.occurred_at), "HH:mm")}</p></td>
                  <td className="max-w-[340px] px-4 py-3 align-top"><p className="line-clamp-2 font-medium">{tx.vendor || tx.notes || cat?.name || "Transaction"}</p>{spentByPartner && <div className="mt-1"><span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700">Spent by Partner</span></div>}{displayTags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{displayTags.slice(0, 3).map((tag) => onTagClick ? <button key={tag} type="button" onClick={() => onTagClick(tag)} className="text-[10px] font-medium text-primary hover:underline">#{tag}</button> : <span key={tag} className="text-[10px] text-muted-foreground">#{tag}</span>)}</div>}</td>
                  <td className="px-4 py-3 align-top"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cat?.color ?? "var(--muted-foreground)" }} /><span>{categoryLabel}</span></div></td>
                  <td className="px-4 py-3 align-top text-muted-foreground">{project?.name ?? "—"}</td>
                  <td className="px-4 py-3 align-top text-muted-foreground">{spentByPartner ? <><span className="font-medium text-amber-700">Partner</span><span className="block text-xs">Partner Float</span></> : <>{acc?.name ?? "—"}{tx.payment_method ? <span className="block text-xs">{tx.payment_method}</span> : null}</>}</td>
                  <td className="px-4 py-3 align-top"><ReceiptIndicator receiptPath={tx.receipt_path} /></td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right align-top font-semibold tabular-nums ${color}`}>{sign}{formatCurrency(Number(tx.amount), currency)}</td>
                  {showActions && <td className="px-4 py-2 text-right align-top"><div className="inline-flex items-center gap-0.5">{onFavorite && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onFavorite(tx)} aria-label="Favorite transaction"><Star className={`h-4 w-4 ${tx.favorite ? "fill-[color:var(--warning)] text-[color:var(--warning)]" : ""}`} /></Button>}{onEdit && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(tx)} aria-label="Edit transaction"><Pencil className="h-4 w-4" /></Button>}{onDelete && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(tx)} aria-label="Delete transaction"><Trash2 className="h-4 w-4" /></Button>}</div></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
