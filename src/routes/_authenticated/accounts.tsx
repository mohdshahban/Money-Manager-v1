import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Wallet, Trash2, Pencil } from "lucide-react";
import { useAccounts, useTransactions, useMutateEntity, type Account } from "@/hooks/useFinance";
import { useProfile } from "@/hooks/useProfile";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { isPartnerSystemAccountType } from "@/lib/partnerLedger";

export const Route = createFileRoute("/_authenticated/accounts")({ component: AccountsPage });

const TYPES = ["cash", "bank", "wallet", "upi", "credit_card", "debit_card", "loan", "savings", "investment", "business"];
const GRADS = ["var(--gradient-primary)", "var(--gradient-secondary)", "var(--gradient-success)", "var(--gradient-warning)"];

function AccountsPage() {
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "USD";
  const { data: accounts = [] } = useAccounts();
  const { data: txs = [] } = useTransactions();
  const { create, update, remove } = useMutateEntity<Account>("accounts", ["accounts", "transactions"]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);

  const visibleAccounts = useMemo(() => accounts.filter((a) => !isPartnerSystemAccountType(a.type)), [accounts]);

  const balances = useMemo(() => {
    const m = new Map<string, number>();
    visibleAccounts.forEach((a) => m.set(a.id, Number(a.opening_balance)));
    txs.forEach((t) => {
      const amt = Number(t.amount);
      if (t.type === "income" && t.account_id && m.has(t.account_id)) m.set(t.account_id, (m.get(t.account_id) ?? 0) + amt);
      else if (t.type === "expense" && t.account_id && m.has(t.account_id)) m.set(t.account_id, (m.get(t.account_id) ?? 0) - amt);
      else if (t.type === "transfer") {
        if (t.account_id && m.has(t.account_id)) m.set(t.account_id, (m.get(t.account_id) ?? 0) - amt);
        if (t.to_account_id && m.has(t.to_account_id)) m.set(t.to_account_id, (m.get(t.to_account_id) ?? 0) + amt);
      }
    });
    return m;
  }, [visibleAccounts, txs]);

  const total = Array.from(balances.values()).reduce((s, v) => s + v, 0);

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Accounts</h1>
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="gap-1.5"><Plus className="h-4 w-4" /> New</Button>
      </div>

      <div className="relative overflow-hidden rounded-3xl p-5 text-white shadow-[var(--shadow-lg)]" style={{ background: "var(--gradient-secondary)" }}>
        <p className="text-sm text-white/80">Total balance</p>
        <p className="mt-1 text-3xl font-bold tabular-nums md:text-4xl">{formatCurrency(total, currency)}</p>
        <p className="mt-1 text-xs text-white/70">Across {visibleAccounts.length} personal/business accounts</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleAccounts.map((a, i) => (
          <motion.div key={a.id} whileHover={{ y: -3 }} className="group relative overflow-hidden rounded-2xl border p-4 text-white shadow-[var(--shadow-soft)]" style={{ background: GRADS[i % GRADS.length] }}>
            <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/20 blur-2xl" />
            <div className="flex items-start justify-between">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/25 backdrop-blur"><Wallet className="h-5 w-5" /></div>
              <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={() => { setEditing(a); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={() => { if (confirm("Delete account?")) remove.mutate(a.id); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
            <p className="mt-4 text-xs uppercase tracking-wide text-white/70">{a.type.replace("_", " ")}</p>
            <p className="mt-0.5 truncate text-lg font-semibold">{a.name}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">{formatCurrency(balances.get(a.id) ?? 0, currency)}</p>
          </motion.div>
        ))}
      </div>

      <AccountDialog open={open} onOpenChange={setOpen} editing={editing} onSubmit={async (payload) => {
        try {
          if (editing) await update.mutateAsync({ id: editing.id, ...payload });
          else await create.mutateAsync(payload);
          toast.success(editing ? "Account updated" : "Account created");
          setOpen(false);
        } catch (e) { toast.error((e as Error).message); }
      }} />
    </div>
  );
}

function AccountDialog({ open, onOpenChange, editing, onSubmit }: { open: boolean; onOpenChange: (o: boolean) => void; editing: Account | null; onSubmit: (p: Partial<Account>) => Promise<void> }) {
  const [name, setName] = useState(editing?.name ?? "");
  const [type, setType] = useState(editing?.type ?? "cash");
  const [balance, setBalance] = useState(String(editing?.opening_balance ?? "0"));

  return (
    <Dialog open={open} onOpenChange={(o) => {
      onOpenChange(o);
      if (o) { setName(editing?.name ?? ""); setType(editing?.type ?? "cash"); setBalance(String(editing?.opening_balance ?? "0")); }
    }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{editing ? "Edit account" : "New account"}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid gap-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-2"><Label>Opening balance</Label><Input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} /></div>
          <Button onClick={() => onSubmit({ name, type, opening_balance: parseFloat(balance) || 0 })} disabled={!name}>{editing ? "Save" : "Create"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}