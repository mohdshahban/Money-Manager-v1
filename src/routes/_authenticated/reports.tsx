import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { BarChart3, FolderKanban, Store, Tags } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend } from "recharts";
import { startOfMonth, endOfMonth, startOfYear, endOfYear, startOfWeek, endOfWeek, subMonths, format, eachMonthOfInterval } from "date-fns";
import { useTransactions, useCategories, useAccounts, useProjects, type Category, type Project, type Transaction } from "@/hooks/useFinance";
import { useProfile } from "@/hooks/useProfile";
import { formatCurrency } from "@/lib/format";
import { withoutPartnerSystemTags } from "@/lib/partnerLedger";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { TransactionCollection } from "@/components/app/TransactionCollection";

export const Route = createFileRoute("/_authenticated/reports")({ component: Reports });

type Range = "week" | "month" | "year";
type Dimension = "category" | "project" | "vendor" | "tag";
type BreakdownItem = { key: string; name: string; value: number; color: string };

function Reports() {
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "USD";
  const { data: txs = [] } = useTransactions();
  const { data: cats = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const { data: projects = [] } = useProjects();
  const [range, setRange] = useState<Range>("month");
  const [dimension, setDimension] = useState<Dimension>("category");
  const [compare, setCompare] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const now = new Date();
  const bounds = useMemo(() => {
    if (range === "week") return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    if (range === "year") return { start: startOfYear(now), end: endOfYear(now) };
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }, [range]);

  const previousBounds = useMemo(() => {
    const duration = bounds.end.getTime() - bounds.start.getTime();
    const end = new Date(bounds.start.getTime() - 1);
    return { start: new Date(end.getTime() - duration), end };
  }, [bounds]);

  const inRange = useMemo(() => txs.filter((tx) => isWithin(tx, bounds.start, bounds.end)), [txs, bounds]);
  const previous = useMemo(() => txs.filter((tx) => isWithin(tx, previousBounds.start, previousBounds.end)), [txs, previousBounds]);
  const currentTotals = totals(inRange);
  const previousTotals = totals(previous);
  const savingsRate = currentTotals.income > 0 ? Math.round(((currentTotals.income - currentTotals.expense) / currentTotals.income) * 100) : 0;

  const rawBreakdown = useMemo(() => buildBreakdown(inRange, dimension, cats, projects), [inRange, dimension, cats, projects]);
  const chartBreakdown = useMemo(() => {
    if (rawBreakdown.length <= 5) return rawBreakdown;
    return [...rawBreakdown.slice(0, 5), { key: "__other", name: "Other", value: rawBreakdown.slice(5).reduce((sum, item) => sum + item.value, 0), color: "#94A3B8" }];
  }, [rawBreakdown]);

  const drilldownTxs = useMemo(() => {
    if (!selected || selected === "__other") return [];
    return inRange.filter((tx) => matchesDimension(tx, dimension, selected, cats));
  }, [selected, inRange, dimension, cats]);

  const yearly = useMemo(() => {
    const months = eachMonthOfInterval({ start: subMonths(now, 11), end: now });
    return months.map((month) => {
      const rows = txs.filter((tx) => isWithin(tx, startOfMonth(month), endOfMonth(month)));
      const monthTotals = totals(rows);
      return { month: format(month, "MMM"), income: monthTotals.income, expense: monthTotals.expense, savings: monthTotals.income - monthTotals.expense };
    });
  }, [txs]);

  const net = currentTotals.income - currentTotals.expense;
  const previousNet = previousTotals.income - previousTotals.expense;

  const selectDimension = (next: Dimension) => { setDimension(next); setSelected(null); };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Financial analysis</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">Compare periods and drill into where the money actually went.</p>
        </div>
        <Button variant={compare ? "secondary" : "outline"} size="sm" onClick={() => setCompare((value) => !value)}>Compare previous period</Button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3 shadow-[var(--shadow-soft)] lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={range} onValueChange={(value) => { setRange(value as Range); setSelected(null); }}>
          <TabsList className="grid grid-cols-3"><TabsTrigger value="week">Week</TabsTrigger><TabsTrigger value="month">Month</TabsTrigger><TabsTrigger value="year">Year</TabsTrigger></TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-1.5">
          <DimensionButton active={dimension === "category"} onClick={() => selectDimension("category")} icon={<BarChart3 className="h-4 w-4" />} label="Category" />
          <DimensionButton active={dimension === "project"} onClick={() => selectDimension("project")} icon={<FolderKanban className="h-4 w-4" />} label="Project" />
          <DimensionButton active={dimension === "vendor"} onClick={() => selectDimension("vendor")} icon={<Store className="h-4 w-4" />} label="Vendor" />
          <DimensionButton active={dimension === "tag"} onClick={() => selectDimension("tag")} icon={<Tags className="h-4 w-4" />} label="Tag" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Income" value={formatCurrency(currentTotals.income, currency)} tone="success" delta={compare ? changePct(currentTotals.income, previousTotals.income) : null} />
        <Stat label="Expense" value={formatCurrency(currentTotals.expense, currency)} tone="primary" delta={compare ? changePct(currentTotals.expense, previousTotals.expense) : null} inverse />
        <Stat label="Net" value={formatCurrency(net, currency)} tone="secondary" delta={compare ? changePct(net, previousNet) : null} />
        <Stat label="Savings rate" value={`${savingsRate}%`} tone="warning" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <Card title={`Expense by ${dimension}`}>
          {chartBreakdown.length === 0 ? <Empty /> : (
            <div className="grid items-center gap-4 md:grid-cols-[minmax(260px,0.8fr)_1fr]">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartBreakdown} innerRadius={62} outerRadius={100} dataKey="value" paddingAngle={2}>{chartBreakdown.map((item) => <Cell key={item.key} fill={item.color} />)}</Pie>
                    <Tooltip formatter={(value) => formatCurrency(Number(value), currency)} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid gap-2">
                {chartBreakdown.map((item) => <BreakdownButton key={item.key} item={item} expense={currentTotals.expense} currency={currency} active={selected === item.key} disabled={item.key === "__other"} onClick={() => setSelected(item.key)} />)}
              </div>
            </div>
          )}
        </Card>

        <Card title={`Top ${dimension} spending`}>
          {rawBreakdown.length === 0 ? <Empty /> : (
            <ul className="grid gap-2">
              {rawBreakdown.slice(0, 8).map((item) => <li key={item.key}><BreakdownButton item={item} expense={currentTotals.expense} currency={currency} active={selected === item.key} onClick={() => setSelected(item.key)} showBar /></li>)}
            </ul>
          )}
        </Card>
      </div>

      {selected && selected !== "__other" && (
        <Card title={`${rawBreakdown.find((item) => item.key === selected)?.name ?? "Selected"} transactions`}>
          <div className="mb-3 flex justify-end"><Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Clear drill-down</Button></div>
          <TransactionCollection transactions={drilldownTxs} categories={cats} accounts={accounts} projects={projects} currency={currency} view="table" readOnly emptyMessage="No matching transactions." />
        </Card>
      )}

      <Card title="Income vs Expense — 12 months">
        <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={yearly}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} /><YAxis stroke="var(--muted-foreground)" fontSize={11} /><Tooltip formatter={(value) => formatCurrency(Number(value), currency)} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} /><Legend /><Bar dataKey="income" fill="var(--success)" radius={[6, 6, 0, 0]} /><Bar dataKey="expense" fill="var(--primary)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
      </Card>

      <Card title="Savings trend">
        <div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={yearly}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} /><YAxis stroke="var(--muted-foreground)" fontSize={11} /><Tooltip formatter={(value) => formatCurrency(Number(value), currency)} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} /><Line type="monotone" dataKey="savings" stroke="var(--secondary)" strokeWidth={3} dot={{ r: 4 }} /></LineChart></ResponsiveContainer></div>
      </Card>
    </div>
  );
}

function isWithin(tx: Transaction, start: Date, end: Date) {
  const date = new Date(tx.occurred_at);
  return date >= start && date <= end;
}

function totals(rows: Transaction[]) {
  return {
    income: rows.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + Number(tx.amount), 0),
    expense: rows.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + Number(tx.amount), 0),
  };
}

function addBreakdown(map: Map<string, BreakdownItem>, key: string, name: string, amount: number, color: string) {
  const current = map.get(key) ?? { key, name, value: 0, color };
  current.value += amount;
  map.set(key, current);
}

function buildBreakdown(rows: Transaction[], dimension: Dimension, cats: Category[], projects: Project[]) {
  const map = new Map<string, BreakdownItem>();
  rows.filter((tx) => tx.type === "expense").forEach((tx) => {
    const amount = Number(tx.amount);
    if (dimension === "category") {
      const cat = cats.find((item) => item.id === tx.category_id);
      const root = cat?.parent_id ? cats.find((item) => item.id === cat.parent_id) : cat;
      addBreakdown(map, root?.id ?? "uncategorised", root?.name ?? "Uncategorised", amount, root?.color ?? "#64748B");
      return;
    }
    if (dimension === "project") {
      const project = projects.find((item) => item.id === tx.project_id);
      addBreakdown(map, project?.id ?? "unassigned", project?.name ?? "Unassigned", amount, project?.color ?? "#6366F1");
      return;
    }
    if (dimension === "vendor") {
      const name = tx.vendor || "No vendor";
      addBreakdown(map, name.toLowerCase(), name, amount, "#F97316");
      return;
    }
    const visibleTags = withoutPartnerSystemTags(tx.tags);
    const tags = visibleTags.length ? visibleTags : ["Untagged"];
    tags.forEach((tag) => addBreakdown(map, tag, tag === "Untagged" ? tag : `#${tag}`, amount, "#8B5CF6"));
  });
  return [...map.values()].sort((a, b) => b.value - a.value);
}

function matchesDimension(tx: Transaction, dimension: Dimension, key: string, cats: Category[]) {
  if (tx.type !== "expense") return false;
  if (dimension === "category") {
    const cat = cats.find((item) => item.id === tx.category_id);
    return (cat?.parent_id ?? cat?.id ?? "uncategorised") === key;
  }
  if (dimension === "project") return (tx.project_id ?? "unassigned") === key;
  if (dimension === "vendor") return (tx.vendor || "No vendor").toLowerCase() === key;
  const visibleTags = withoutPartnerSystemTags(tx.tags);
  return (visibleTags.length ? visibleTags : ["Untagged"]).includes(key);
}

function changePct(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function DimensionButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return <Button type="button" variant={active ? "secondary" : "ghost"} size="sm" className="gap-1.5" onClick={onClick}>{icon}{label}</Button>;
}

function BreakdownButton({ item, expense, currency, active, disabled, onClick, showBar }: { item: BreakdownItem; expense: number; currency: string; active: boolean; disabled?: boolean; onClick: () => void; showBar?: boolean }) {
  const pct = expense > 0 ? (item.value / expense) * 100 : 0;
  return <button type="button" disabled={disabled} onClick={onClick} className={`w-full rounded-xl p-2 text-left transition-colors ${active ? "bg-primary/10" : disabled ? "cursor-default" : "hover:bg-muted"}`}><div className="flex items-center justify-between gap-3 text-sm"><span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} /><span className="truncate font-medium">{item.name}</span></span><span className="shrink-0 text-xs tabular-nums text-muted-foreground">{pct.toFixed(0)}% · {formatCurrency(item.value, currency)}</span></div>{showBar && <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: item.color }} /></div>}</button>;
}

function Stat({ label, value, tone, delta, inverse }: { label: string; value: string; tone: "success" | "primary" | "secondary" | "warning"; delta?: number | null; inverse?: boolean }) {
  const map = { success: "var(--gradient-success)", primary: "var(--gradient-primary)", secondary: "var(--gradient-secondary)", warning: "var(--gradient-warning)" };
  const good = delta == null ? null : inverse ? delta <= 0 : delta >= 0;
  return <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]"><div className="mb-2 h-1.5 w-10 rounded-full" style={{ background: map[tone] }} /><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 truncate text-lg font-semibold tabular-nums">{value}</p>{delta != null && <p className={`mt-1 text-[11px] font-medium ${good ? "text-[color:var(--success)]" : "text-primary"}`}>{delta >= 0 ? "+" : ""}{delta.toFixed(0)}% vs previous</p>}</div>;
}

function Card({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]"><h3 className="mb-4 font-semibold">{title}</h3>{children}</section>; }
function Empty() { return <p className="py-10 text-center text-sm text-muted-foreground">No data for this period.</p>; }
