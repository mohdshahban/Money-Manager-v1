import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAccounts, useTransactions, useCategories, useProjects } from "@/hooks/useFinance";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/format";
import { ArrowDownRight, ArrowUpRight, FolderKanban, PiggyBank, Sparkles, TrendingUp, Wallet } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar } from "recharts";
import { eachDayOfInterval, endOfDay, endOfMonth, format, startOfDay, startOfMonth, subMonths } from "date-fns";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isExcludedFromAvailableBalance } from "@/lib/partnerLedger";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

type DashboardRange = "month" | "lastMonth" | "custom";

function Dashboard() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "USD";
  const { data: accounts = [] } = useAccounts();
  const { data: txs = [] } = useTransactions();
  const { data: cats = [] } = useCategories();
  const { data: projects = [] } = useProjects();
  const [range, setRange] = useState<DashboardRange>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const now = new Date();
  const rangeBounds = useMemo(() => {
    if (range === "lastMonth") {
      const date = subMonths(now, 1);
      return { start: startOfMonth(date), end: endOfMonth(date), label: format(date, "MMMM yyyy") };
    }
    if (range === "custom") {
      const start = customFrom ? startOfDay(new Date(customFrom)) : startOfMonth(now);
      const end = customTo ? endOfDay(new Date(customTo)) : endOfDay(now);
      return { start, end, label: "Custom range" };
    }
    return { start: startOfMonth(now), end: endOfMonth(now), label: format(now, "MMMM yyyy") };
  }, [range, customFrom, customTo]);

  const balanceAccounts = useMemo(() => accounts.filter((a) => !isExcludedFromAvailableBalance(a.type)), [accounts]);

  const balances = useMemo(() => {
    const accBal = new Map<string, number>();
    balanceAccounts.forEach((a) => accBal.set(a.id, Number(a.opening_balance)));
    txs.forEach((t) => {
      const amount = Number(t.amount);
      if (t.type === "income" && t.account_id && accBal.has(t.account_id)) accBal.set(t.account_id, (accBal.get(t.account_id) ?? 0) + amount);
      else if (t.type === "expense" && t.account_id && accBal.has(t.account_id)) accBal.set(t.account_id, (accBal.get(t.account_id) ?? 0) - amount);
      else if (t.type === "transfer") {
        if (t.account_id && accBal.has(t.account_id)) accBal.set(t.account_id, (accBal.get(t.account_id) ?? 0) - amount);
        if (t.to_account_id && accBal.has(t.to_account_id)) accBal.set(t.to_account_id, (accBal.get(t.to_account_id) ?? 0) + amount);
      }
    });
    return Array.from(accBal.values()).reduce((sum, value) => sum + value, 0);
  }, [balanceAccounts, txs]);

  const periodTxs = useMemo(() => txs.filter((t) => { const date = new Date(t.occurred_at); return date >= rangeBounds.start && date <= rangeBounds.end; }), [txs, rangeBounds]);
  const periodIncome = periodTxs.filter((t) => t.type === "income").reduce((sum, t) => sum + Number(t.amount), 0);
  const periodExpense = periodTxs.filter((t) => t.type === "expense").reduce((sum, t) => sum + Number(t.amount), 0);
  const savings = periodIncome - periodExpense;
  const health = periodIncome > 0 ? Math.max(0, Math.min(100, Math.round((savings / periodIncome) * 100))) : 0;

  const pieData = useMemo(() => {
    const map = new Map<string, number>();
    periodTxs.filter((t) => t.type === "expense" && t.category_id).forEach((t) => map.set(t.category_id!, (map.get(t.category_id!) ?? 0) + Number(t.amount)));
    return [...map.entries()].map(([id, value]) => { const cat = cats.find((c) => c.id === id); return { name: cat?.name ?? "Other", value, color: cat?.color ?? "#64748B" }; }).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [periodTxs, cats]);

  const trendData = useMemo(() => {
    const end = rangeBounds.end > now ? now : rangeBounds.end;
    if (rangeBounds.start > end) return [];
    const days = eachDayOfInterval({ start: rangeBounds.start, end });
    return days.map((day) => {
      const key = startOfDay(day).getTime();
      const rows = periodTxs.filter((t) => startOfDay(new Date(t.occurred_at)).getTime() === key);
      return { day: format(day, days.length > 45 ? "MMM d" : "d"), income: rows.filter((t) => t.type === "income").reduce((sum, t) => sum + Number(t.amount), 0), expense: rows.filter((t) => t.type === "expense").reduce((sum, t) => sum + Number(t.amount), 0) };
    });
  }, [periodTxs, rangeBounds]);

  const monthlyCompare = useMemo(() => Array.from({ length: 6 }).map((_, index) => {
    const month = subMonths(now, 5 - index);
    const start = startOfMonth(month), end = endOfMonth(month);
    const rows = txs.filter((t) => { const date = new Date(t.occurred_at); return date >= start && date <= end; });
    return { month: format(month, "MMM"), income: rows.filter((t) => t.type === "income").reduce((sum, t) => sum + Number(t.amount), 0), expense: rows.filter((t) => t.type === "expense").reduce((sum, t) => sum + Number(t.amount), 0) };
  }), [txs]);

  const projectRows = useMemo(() => {
    const spentMap = new Map<string, number>();
    projects.forEach((p) => spentMap.set(p.id, 0));
    txs.filter((t) => t.type === "expense" && t.project_id).forEach((t) => spentMap.set(t.project_id!, (spentMap.get(t.project_id!) ?? 0) + Number(t.amount)));
    const active = projects.filter((p) => p.status === "active");
    const source = active.length ? active : projects;
    return source.map((p) => {
      const quoted = Number(p.quoted_amount) || 0;
      const budget = Number(p.budget) || quoted;
      const spent = spentMap.get(p.id) ?? 0;
      return { p, quoted, spent, saving: quoted - spent, budgetUsed: budget > 0 ? Math.min(100, (spent / budget) * 100) : 0 };
    }).sort((a, b) => b.spent - a.spent).slice(0, 6);
  }, [projects, txs]);

  const biggestCategory = pieData[0];
  const mostAtRisk = projectRows.slice().sort((a, b) => b.budgetUsed - a.budgetUsed)[0];
  const currentMonthRows = txs.filter((t) => { const d = new Date(t.occurred_at); return d >= startOfMonth(now) && d <= endOfMonth(now); });
  const previousMonthDate = subMonths(now, 1);
  const previousMonthRows = txs.filter((t) => { const d = new Date(t.occurred_at); return d >= startOfMonth(previousMonthDate) && d <= endOfMonth(previousMonthDate); });
  const currentCash = currentMonthRows.reduce((sum, t) => sum + (t.type === "income" ? Number(t.amount) : t.type === "expense" ? -Number(t.amount) : 0), 0);
  const previousCash = previousMonthRows.reduce((sum, t) => sum + (t.type === "income" ? Number(t.amount) : t.type === "expense" ? -Number(t.amount) : 0), 0);
  const recent = txs.slice(0, 7);
  const firstName = profile?.full_name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "there";

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm text-muted-foreground">Welcome back</p><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Hi, {firstName} 👋</h1><p className="mt-1 text-sm text-muted-foreground">Here’s the financial picture that needs your attention.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {range === "custom" && <><Input type="date" className="w-36" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /><Input type="date" className="w-36" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></>}
          <Select value={range} onValueChange={(value) => setRange(value as DashboardRange)}><SelectTrigger className="w-44 bg-card"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="month">This month</SelectItem><SelectItem value="lastMonth">Last month</SelectItem><SelectItem value="custom">Custom range</SelectItem></SelectContent></Select>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-3xl p-6 text-white shadow-[var(--shadow-lg)]" style={{ background: "var(--gradient-primary)" }}>
          <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/20 blur-3xl" />
          <p className="text-sm text-white/80">Available balance</p><p className="mt-1 text-4xl font-bold tracking-tight md:text-5xl">{formatCurrency(balances, currency)}</p>
          <div className="mt-8 grid grid-cols-2 gap-4"><div><div className="flex items-center gap-1 text-xs text-white/75"><ArrowUpRight className="h-3 w-3" /> Income · {rangeBounds.label}</div><p className="mt-1 text-xl font-semibold">{formatCurrency(periodIncome, currency)}</p></div><div><div className="flex items-center gap-1 text-xs text-white/75"><ArrowDownRight className="h-3 w-3" /> Expense · {rangeBounds.label}</div><p className="mt-1 text-xl font-semibold">{formatCurrency(periodExpense, currency)}</p></div></div>
        </motion.div>
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={<PiggyBank className="h-4 w-4" />} label="Net savings" value={formatCurrency(savings, currency)} gradient="var(--gradient-success)" />
          <StatCard icon={<Wallet className="h-4 w-4" />} label="Accounts" value={String(balanceAccounts.length)} gradient="var(--gradient-secondary)" to="/accounts" />
          <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Cash flow" value={formatCurrency(savings, currency)} gradient="var(--gradient-warning)" />
          <StatCard icon={<Sparkles className="h-4 w-4" />} label="Savings health" value={`${health}/100`} gradient="var(--gradient-primary)" />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <InsightCard label="Biggest expense category" value={biggestCategory?.name ?? "No expenses"} detail={biggestCategory ? formatCurrency(biggestCategory.value, currency) : "Nothing recorded for this period"} />
        <InsightCard label="Highest budget usage" value={mostAtRisk?.p.name ?? "No project data"} detail={mostAtRisk ? `${mostAtRisk.budgetUsed.toFixed(0)}% used · ${formatCurrency(mostAtRisk.spent, currency)} spent` : "Add project transactions to compare"} />
        <InsightCard label="Cash flow vs last month" value={formatCurrency(currentCash, currency)} detail={`${currentCash - previousCash >= 0 ? "+" : ""}${formatCurrency(currentCash - previousCash, currency)} change`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={`Spending trend · ${rangeBounds.label}`}><div className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trendData}><defs><linearGradient id="gInc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--success)" stopOpacity={0.4} /><stop offset="100%" stopColor="var(--success)" stopOpacity={0} /></linearGradient><linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} /><YAxis stroke="var(--muted-foreground)" fontSize={11} /><Tooltip formatter={(value) => formatCurrency(Number(value), currency)} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} /><Area type="monotone" dataKey="income" stroke="var(--success)" fill="url(#gInc)" strokeWidth={2} /><Area type="monotone" dataKey="expense" stroke="var(--primary)" fill="url(#gExp)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div></Card>
        <Card title="Top expense categories">{pieData.length === 0 ? <Empty msg="No expenses in this period" /> : <div className="grid items-center gap-4 md:grid-cols-2"><div className="h-64"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieData} innerRadius={58} outerRadius={90} dataKey="value" paddingAngle={3}>{pieData.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={(value) => formatCurrency(Number(value), currency)} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} /></PieChart></ResponsiveContainer></div><ul className="grid gap-2 text-sm">{pieData.map((item) => <li key={item.name} className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} /><span className="truncate">{item.name}</span></span><span className="shrink-0 tabular-nums text-muted-foreground">{formatCurrency(item.value, currency)}</span></li>)}</ul></div>}</Card>
      </div>

      <Card title="Monthly comparison · last 6 months"><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyCompare}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} /><YAxis stroke="var(--muted-foreground)" fontSize={11} /><Tooltip formatter={(value) => formatCurrency(Number(value), currency)} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} /><Bar dataKey="income" fill="var(--success)" radius={[8, 8, 0, 0]} /><Bar dataKey="expense" fill="var(--primary)" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>

      <section className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
        <div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="font-semibold">Project comparison</h3><p className="mt-0.5 text-xs text-muted-foreground">Quote, spend, projected margin and budget usage.</p></div><Link to="/projects" className="text-xs font-medium text-primary hover:underline">View all projects →</Link></div>
        {projectRows.length === 0 ? <Empty msg="No projects yet" /> : <div className="overflow-x-auto"><div className="min-w-[760px]"><div className="grid grid-cols-[1.7fr_1fr_1fr_1fr_1.1fr] gap-3 border-b px-3 pb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"><span>Project</span><span className="text-right">Quoted</span><span className="text-right">Spent</span><span className="text-right">Margin</span><span>Budget used</span></div>{projectRows.map(({ p, quoted, spent, saving, budgetUsed }) => <Link key={p.id} to="/projects/$projectId" params={{ projectId: p.id }} className="grid grid-cols-[1.7fr_1fr_1fr_1fr_1.1fr] items-center gap-3 rounded-xl px-3 py-3 hover:bg-muted/50"><div className="min-w-0"><p className="truncate text-sm font-medium">{p.name}</p><p className="truncate text-xs text-muted-foreground">{p.client_name || "No client"}</p></div><p className="text-right text-sm tabular-nums">{formatCurrency(quoted, currency)}</p><p className="text-right text-sm tabular-nums">{formatCurrency(spent, currency)}</p><p className={`text-right text-sm font-medium tabular-nums ${saving >= 0 ? "text-[color:var(--success)]" : "text-primary"}`}>{formatCurrency(saving, currency)}</p><div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${budgetUsed}%`, background: budgetUsed > 90 ? "hsl(var(--destructive))" : "var(--gradient-primary)" }} /></div><p className="mt-1 text-[10px] text-muted-foreground">{budgetUsed.toFixed(0)}%</p></div></Link>)}</div></div>}
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
        <div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold">Recent transactions</h3><p className="text-xs text-muted-foreground">Latest activity across every account and project.</p></div><Link to="/transactions" className="text-xs font-medium text-primary hover:underline">View all →</Link></div>
        {recent.length === 0 ? <Empty msg="Add your first transaction to see activity" /> : <ul className="divide-y divide-border/70">{recent.map((t) => { const cat = cats.find((c) => c.id === t.category_id); const acc = accounts.find((a) => a.id === t.account_id); const sign = t.type === "income" ? "+" : t.type === "expense" ? "−" : ""; return <li key={t.id} className="flex items-center gap-3 py-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-semibold text-white" style={{ background: cat?.color ?? "var(--muted-foreground)" }}>{(cat?.name ?? "TX").slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{t.vendor || t.notes || cat?.name || "Transaction"}</p><p className="truncate text-xs text-muted-foreground">{acc?.name ?? "—"} · {format(new Date(t.occurred_at), "MMM d, HH:mm")}</p></div><p className={`shrink-0 text-sm font-semibold tabular-nums ${t.type === "income" ? "text-[color:var(--success)]" : t.type === "expense" ? "text-primary" : "text-secondary"}`}>{sign}{formatCurrency(Number(t.amount), currency)}</p></li>; })}</ul>}
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, gradient, to }: { icon: React.ReactNode; label: string; value: string; gradient: string; to?: string }) {
  const content = <><div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ background: gradient }}>{icon}</div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 truncate text-lg font-semibold tabular-nums">{value}</p></>;
  return to ? <motion.div whileHover={{ y: -2 }} className="rounded-2xl border bg-card shadow-[var(--shadow-soft)] hover:border-primary/40"><Link to={to} className="block p-4">{content}</Link></motion.div> : <motion.div whileHover={{ y: -2 }} className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]">{content}</motion.div>;
}
function InsightCard({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate font-semibold">{value}</p><p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p></div>; }
function Card({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]"><h3 className="mb-4 font-semibold">{title}</h3>{children}</section>; }
function Empty({ msg }: { msg: string }) { return <p className="py-8 text-center text-sm text-muted-foreground">{msg}</p>; }
