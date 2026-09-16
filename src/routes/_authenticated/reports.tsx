import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend } from "recharts";
import { startOfMonth, endOfMonth, startOfYear, endOfYear, startOfWeek, endOfWeek, subMonths, format, eachMonthOfInterval } from "date-fns";
import { useTransactions, useCategories } from "@/hooks/useFinance";
import { useProfile } from "@/hooks/useProfile";
import { formatCurrency } from "@/lib/format";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/reports")({ component: Reports });

function Reports() {
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "USD";
  const { data: txs = [] } = useTransactions();
  const { data: cats = [] } = useCategories();
  const [range, setRange] = useState<"week" | "month" | "year">("month");

  const now = new Date();
  const { start, end } = useMemo(() => {
    if (range === "week") return { start: startOfWeek(now), end: endOfWeek(now) };
    if (range === "year") return { start: startOfYear(now), end: endOfYear(now) };
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }, [range, now]);

  const inRange = txs.filter((t) => new Date(t.occurred_at) >= start && new Date(t.occurred_at) <= end);
  const income = inRange.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const expense = inRange.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const savingsRate = income > 0 ? Math.round(((income - expense) / income) * 100) : 0;

  const byCat = useMemo(() => {
    const map = new Map<string, number>();
    inRange.filter((t) => t.type === "expense" && t.category_id).forEach((t) => {
      map.set(t.category_id!, (map.get(t.category_id!) ?? 0) + Number(t.amount));
    });
    return Array.from(map.entries()).map(([id, v]) => {
      const c = cats.find((x) => x.id === id);
      return { name: c?.name ?? "Other", value: v, color: c?.color ?? "#64748B" };
    }).sort((a, b) => b.value - a.value);
  }, [inRange, cats]);

  const yearly = useMemo(() => {
    const months = eachMonthOfInterval({ start: subMonths(now, 11), end: now });
    return months.map((m) => {
      const s = startOfMonth(m), e = endOfMonth(m);
      const inc = txs.filter((t) => t.type === "income" && new Date(t.occurred_at) >= s && new Date(t.occurred_at) <= e).reduce((sum, t) => sum + Number(t.amount), 0);
      const exp = txs.filter((t) => t.type === "expense" && new Date(t.occurred_at) >= s && new Date(t.occurred_at) <= e).reduce((sum, t) => sum + Number(t.amount), 0);
      return { month: format(m, "MMM"), income: inc, expense: exp, savings: inc - exp };
    });
  }, [txs, now]);

  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Reports</h1>

      <Tabs value={range} onValueChange={(v) => setRange(v as typeof range)}>
        <TabsList className="grid w-full max-w-xs grid-cols-3">
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="year">Year</TabsTrigger>
        </TabsList>
        <TabsContent value={range} className="mt-5 grid gap-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Income" value={formatCurrency(income, currency)} tone="success" />
            <Stat label="Expense" value={formatCurrency(expense, currency)} tone="primary" />
            <Stat label="Net" value={formatCurrency(income - expense, currency)} tone="secondary" />
            <Stat label="Savings rate" value={`${savingsRate}%`} tone="warning" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Expense by category">
              {byCat.length === 0 ? <Empty /> : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={byCat} innerRadius={55} outerRadius={95} dataKey="value" paddingAngle={2}>
                        {byCat.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
            <Card title="Top spending">
              {byCat.length === 0 ? <Empty /> : (
                <ul className="grid gap-3">
                  {byCat.slice(0, 8).map((c) => {
                    const pct = expense > 0 ? (c.value / expense) * 100 : 0;
                    return (
                      <li key={c.name}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />{c.name}</span>
                          <span className="tabular-nums text-muted-foreground">{formatCurrency(c.value, currency)} · {pct.toFixed(0)}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: c.color }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          <Card title="Income vs Expense — 12 months">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
                  <Legend />
                  <Bar dataKey="income" fill="var(--success)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expense" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Savings trend">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={yearly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
                  <Line type="monotone" dataKey="savings" stroke="var(--secondary)" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "success" | "primary" | "secondary" | "warning" }) {
  const map = { success: "var(--gradient-success)", primary: "var(--gradient-primary)", secondary: "var(--gradient-secondary)", warning: "var(--gradient-warning)" };
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]">
      <div className="mb-2 h-1.5 w-10 rounded-full" style={{ background: map[tone] }} />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)]"><h3 className="mb-4 text-sm font-semibold text-muted-foreground">{title}</h3>{children}</div>;
}
function Empty() { return <p className="py-10 text-center text-sm text-muted-foreground">No data for this period.</p>; }