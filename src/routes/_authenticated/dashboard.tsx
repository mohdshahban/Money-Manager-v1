import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAccounts, useTransactions, useCategories, useProjects } from "@/hooks/useFinance";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/format";
import { ArrowDownRight, ArrowUpRight, PiggyBank, Wallet, TrendingUp, Sparkles } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar } from "recharts";
import { startOfMonth, endOfMonth, format, subMonths, eachDayOfInterval, startOfDay } from "date-fns";
import { TransactionDialog } from "@/components/app/TransactionDialog";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

function Dashboard() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "USD";
  const { data: accounts = [] } = useAccounts();
  const { data: txs = [] } = useTransactions();
  const { data: cats = [] } = useCategories();
  const { data: projects = [] } = useProjects();
  const [addOpen, setAddOpen] = useState(false);

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const stats = useMemo(() => {
    const accBal = new Map<string, number>();
    accounts.forEach((a) => accBal.set(a.id, Number(a.opening_balance)));
    let income = 0, expense = 0, mIncome = 0, mExpense = 0;
    txs.forEach((t) => {
      const d = new Date(t.occurred_at);
      const inMonth = d >= monthStart && d <= monthEnd;
      const amt = Number(t.amount);
      if (t.type === "income") {
        income += amt;
        if (inMonth) mIncome += amt;
        if (t.account_id) accBal.set(t.account_id, (accBal.get(t.account_id) ?? 0) + amt);
      } else if (t.type === "expense") {
        expense += amt;
        if (inMonth) mExpense += amt;
        if (t.account_id) accBal.set(t.account_id, (accBal.get(t.account_id) ?? 0) - amt);
      } else if (t.type === "transfer") {
        if (t.account_id) accBal.set(t.account_id, (accBal.get(t.account_id) ?? 0) - amt);
        if (t.to_account_id) accBal.set(t.to_account_id, (accBal.get(t.to_account_id) ?? 0) + amt);
      }
    });
    const netWorth = Array.from(accBal.values()).reduce((s, v) => s + v, 0);
    const savings = mIncome - mExpense;
    const health = mIncome > 0 ? Math.max(0, Math.min(100, Math.round(((mIncome - mExpense) / mIncome) * 100))) : 0;
    return { netWorth, mIncome, mExpense, savings, health, income, expense };
  }, [accounts, txs, monthStart, monthEnd]);

  const pieData = useMemo(() => {
    const map = new Map<string, number>();
    txs.filter((t) => t.type === "expense" && new Date(t.occurred_at) >= monthStart && t.category_id).forEach((t) => {
      map.set(t.category_id!, (map.get(t.category_id!) ?? 0) + Number(t.amount));
    });
    return Array.from(map.entries())
      .map(([id, value]) => {
        const c = cats.find((x) => x.id === id);
        return { name: c?.name ?? "Other", value, color: c?.color ?? "#64748B" };
      })
      .sort((a, b) => b.value - a.value).slice(0, 6);
  }, [txs, cats, monthStart]);

  const trendData = useMemo(() => {
    const days = eachDayOfInterval({ start: monthStart, end: now });
    return days.map((d) => {
      const key = startOfDay(d).getTime();
      const inc = txs.filter((t) => t.type === "income" && startOfDay(new Date(t.occurred_at)).getTime() === key).reduce((s, t) => s + Number(t.amount), 0);
      const exp = txs.filter((t) => t.type === "expense" && startOfDay(new Date(t.occurred_at)).getTime() === key).reduce((s, t) => s + Number(t.amount), 0);
      return { day: format(d, "d"), income: inc, expense: exp };
    });
  }, [txs, monthStart, now]);

  const monthlyCompare = useMemo(() => {
    return Array.from({ length: 6 }).map((_, i) => {
      const m = subMonths(now, 5 - i);
      const s = startOfMonth(m);
      const e = endOfMonth(m);
      const inc = txs.filter((t) => t.type === "income" && new Date(t.occurred_at) >= s && new Date(t.occurred_at) <= e).reduce((sum, t) => sum + Number(t.amount), 0);
      const exp = txs.filter((t) => t.type === "expense" && new Date(t.occurred_at) >= s && new Date(t.occurred_at) <= e).reduce((sum, t) => sum + Number(t.amount), 0);
      return { month: format(m, "MMM"), income: inc, expense: exp };
    });
  }, [txs, now]);

  const recent = txs.slice(0, 6);

  const projectRows = useMemo(() => {
    const spentMap = new Map<string, number>();
    for (const tx of txs) {
      if (!tx.project_id || tx.type !== "expense") continue;
      spentMap.set(tx.project_id, (spentMap.get(tx.project_id) ?? 0) + Number(tx.amount));
    }
    const active = projects.filter((p) => p.status === "active");
    const source = active.length >= 2 ? active : projects;
    return source
      .map((p) => {
        const quoted = Number(p.quoted_amount) || 0;
        const spent = spentMap.get(p.id) ?? 0;
        const saving = quoted - spent;
        const budgetUsed = quoted > 0 ? Math.min(100, (spent / quoted) * 100) : 0;
        return { p, quoted, spent, saving, budgetUsed };
      })
      .sort((a, b) => b.spent - a.spent);
  }, [projects, txs]);

  const firstName = profile?.full_name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "there";

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Hi, {firstName} 👋</h1>
        </div>
      </div>

      {/* Hero card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-3xl p-6 text-white shadow-[var(--shadow-lg)]" style={{ background: "var(--gradient-primary)" }}>
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/20 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <p className="text-sm text-white/80">Available Balance</p>
        <p className="mt-1 text-4xl font-bold tracking-tight md:text-5xl">{formatCurrency(stats.netWorth, currency)}</p>
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-1 text-xs text-white/80"><ArrowUpRight className="h-3 w-3" /> Income this month</div>
            <p className="mt-1 text-xl font-semibold">{formatCurrency(stats.mIncome, currency)}</p>
          </div>
          <div>
            <div className="flex items-center gap-1 text-xs text-white/80"><ArrowDownRight className="h-3 w-3" /> Expense this month</div>
            <p className="mt-1 text-xl font-semibold">{formatCurrency(stats.mExpense, currency)}</p>
          </div>
        </div>
      </motion.div>

      {/* stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={<PiggyBank className="h-4 w-4" />} label="Savings" value={formatCurrency(stats.savings, currency)} gradient="var(--gradient-success)" />
        <StatCard icon={<Wallet className="h-4 w-4" />} label="Accounts" value={String(accounts.length)} gradient="var(--gradient-secondary)" to="/accounts" hint="Manage →" />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Cash flow" value={formatCurrency(stats.mIncome - stats.mExpense, currency)} gradient="var(--gradient-warning)" />
        <StatCard icon={<Sparkles className="h-4 w-4" />} label="Health" value={`${stats.health}/100`} gradient="var(--gradient-primary)" />
      </div>

      {/* charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Spending trend — this month">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="gInc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--success)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--success)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
                <Area type="monotone" dataKey="income" stroke="var(--success)" fill="url(#gInc)" strokeWidth={2} />
                <Area type="monotone" dataKey="expense" stroke="var(--primary)" fill="url(#gExp)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Top expense categories">
          {pieData.length === 0 ? <Empty msg="No expenses yet this month" /> : (
            <div className="grid grid-cols-[1fr_1fr] items-center gap-4">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                      {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="grid gap-2 text-sm">
                {pieData.map((d) => (
                  <li key={d.name} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} /><span className="truncate">{d.name}</span></span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{formatCurrency(d.value, currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <Card title="Monthly comparison — last 6 months">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyCompare}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
              <Bar dataKey="income" fill="var(--success)" radius={[8, 8, 0, 0]} />
              <Bar dataKey="expense" fill="var(--primary)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground">Project Comparison</h3>
            <p className="mt-0.5 text-xs text-muted-foreground/80">Quoted vs Spent vs Savings across active projects</p>
          </div>
          <Link to="/projects" className="shrink-0 text-xs font-medium text-primary hover:underline">View all →</Link>
        </div>
        {projectRows.length === 0 ? (
          <Empty msg="No projects yet" />
        ) : (
          <div className="grid gap-2">
            <div className="hidden grid-cols-[1.6fr_1fr_1fr_1fr_1.1fr] gap-3 px-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground md:grid">
              <span>Project</span>
              <span className="text-right">Quoted</span>
              <span className="text-right">Spent</span>
              <span className="text-right">Saving</span>
              <span>Budget used</span>
            </div>
            {projectRows.map(({ p, quoted, spent, saving, budgetUsed }) => (
              <Link
                key={p.id}
                to="/projects/$projectId"
                params={{ projectId: p.id }}
                className="grid grid-cols-1 gap-2 rounded-2xl border border-transparent p-3 transition-colors hover:border-primary/30 hover:bg-muted/40 md:grid-cols-[1.6fr_1fr_1fr_1fr_1.1fr] md:items-center md:gap-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  {p.client_name && <p className="truncate text-xs text-muted-foreground">{p.client_name}</p>}
                </div>
                <RowCell label="Quoted" value={formatCurrency(quoted, currency)} />
                <RowCell label="Spent" value={formatCurrency(spent, currency)} />
                <RowCell label="Saving" value={formatCurrency(saving, currency)} className={saving >= 0 ? "text-[color:var(--success)]" : "text-destructive"} />
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground md:hidden">Budget used</p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${budgetUsed}%`, background: budgetUsed > 90 ? "hsl(var(--destructive))" : "var(--gradient-primary)" }} />
                  </div>
                  <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">{budgetUsed.toFixed(0)}%</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Card title="Recent transactions">
        {recent.length === 0 ? <Empty msg="Tap + to add your first transaction" /> : (
          <ul className="grid gap-2">
            {recent.map((t) => {
              const cat = cats.find((c) => c.id === t.category_id);
              const acc = accounts.find((a) => a.id === t.account_id);
              const sign = t.type === "income" ? "+" : t.type === "expense" ? "−" : "";
              const color = t.type === "income" ? "text-[color:var(--success)]" : t.type === "expense" ? "text-primary" : "text-secondary";
              return (
                <li key={t.id} className="flex items-center gap-3 rounded-xl border border-transparent p-2 hover:bg-muted/50">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: cat?.color ?? "var(--muted)" }}>
                    <span className="text-xs font-semibold">{(cat?.name ?? "TX").slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.vendor || t.notes || cat?.name || "Transaction"}</p>
                    <p className="truncate text-xs text-muted-foreground">{acc?.name ?? "—"} · {format(new Date(t.occurred_at), "MMM d, HH:mm")}</p>
                  </div>
                  <p className={`shrink-0 text-sm font-semibold tabular-nums ${color}`}>{sign}{formatCurrency(Number(t.amount), currency)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <TransactionDialog open={addOpen} onOpenChange={setAddOpen} />

    </div>
  );
}

function StatCard({ icon, label, value, gradient, to, hint }: { icon: React.ReactNode; label: string; value: string; gradient: string; to?: string; hint?: string }) {
  const inner = (
    <>
      <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ background: gradient }}>{icon}</div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-[10px] font-medium text-primary">{hint}</p>}
    </>
  );
  if (to) {
    return (
      <motion.div whileHover={{ y: -2 }} className="rounded-2xl border bg-card shadow-[var(--shadow-soft)] transition-colors hover:border-primary/40">
        <Link to={to} className="block p-4">{inner}</Link>
      </motion.div>
    );
  }
  return (
    <motion.div whileHover={{ y: -2 }} className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]">{inner}</motion.div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)]">
      <h3 className="mb-4 text-sm font-semibold text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{msg}</p>;
}

function RowCell({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center justify-between md:block md:text-right">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground md:hidden">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${className ?? ""}`}>{value}</span>
    </div>
  );
}