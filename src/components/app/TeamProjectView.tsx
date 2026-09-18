import { useEffect, useMemo, useState } from "react";
import { CalendarDays, HardHat, LayoutList, Search, Table2, UsersRound, WalletCards } from "lucide-react";
import { endOfDay, endOfMonth, endOfYear, format, startOfDay, startOfMonth, startOfYear } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TransactionDialog } from "./TransactionDialog";
import { TransactionCollection, type TransactionViewMode } from "./TransactionCollection";
import { useAccounts, useCategories, useMutateEntity, useProjects, useSoftDeleteTx, useTransactions, type Category, type Transaction } from "@/hooks/useFinance";
import { useProfile } from "@/hooks/useProfile";
import { formatCurrency } from "@/lib/format";

type Range = "all" | "month" | "year" | "custom";

type TeamIdentity = {
  key: string;
  person: string;
  trade: string;
};

type TeamRow = TeamIdentity & {
  total: number;
  count: number;
  lastAt: string;
  transactions: Transaction[];
};

type Props = {
  projectId?: string;
  allowProjectSwitch?: boolean;
};

const LABOUR_WORDS = /\b(labou?r|carpenter|painter|electrician|plumber|mason|tile|tiler|polish|polisher|fabricator|welder|helper|contractor|civil|pop|ceiling)\b/i;

function parsePersonTrade(value: string) {
  const match = value.trim().match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (!match) return null;
  return { person: match[1].trim(), trade: match[2].trim() };
}

function cleanTrade(value: string) {
  const v = value.trim();
  if (/^labou?r$/i.test(v)) return "Labour";
  return v || "Labour";
}

function classifyTeamTransaction(tx: Transaction, categories: Category[]): TeamIdentity | null {
  if (tx.type !== "expense" || !tx.category_id) return null;
  const category = categories.find((c) => c.id === tx.category_id);
  if (!category) return null;
  const parent = category.parent_id ? categories.find((c) => c.id === category.parent_id) : null;
  const root = parent ?? category;

  const parsedCategory = parsePersonTrade(category.name);
  if (parsedCategory && (parent || LABOUR_WORDS.test(root.name) || LABOUR_WORDS.test(parsedCategory.trade))) {
    const person = parsedCategory.person;
    const trade = cleanTrade(parsedCategory.trade);
    return { person, trade, key: `${person.toLowerCase()}::${trade.toLowerCase()}` };
  }

  if (parent && LABOUR_WORDS.test(root.name)) {
    const person = category.name.trim();
    const trade = cleanTrade(root.name);
    return { person, trade, key: `${person.toLowerCase()}::${trade.toLowerCase()}` };
  }

  if (LABOUR_WORDS.test(root.name) && tx.vendor?.trim()) {
    const parsedVendor = parsePersonTrade(tx.vendor);
    const person = parsedVendor?.person ?? tx.vendor.trim();
    const trade = cleanTrade(parsedVendor?.trade ?? root.name);
    return { person, trade, key: `${person.toLowerCase()}::${trade.toLowerCase()}` };
  }

  return null;
}

function aggregateRows(transactions: Transaction[], categories: Category[]) {
  const map = new Map<string, TeamRow>();
  for (const tx of transactions) {
    const identity = classifyTeamTransaction(tx, categories);
    if (!identity) continue;
    const current = map.get(identity.key) ?? { ...identity, total: 0, count: 0, lastAt: tx.occurred_at, transactions: [] };
    current.total += Number(tx.amount);
    current.count += 1;
    current.transactions.push(tx);
    if (new Date(tx.occurred_at) > new Date(current.lastAt)) current.lastAt = tx.occurred_at;
    map.set(identity.key, current);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function TeamProjectView({ projectId: fixedProjectId, allowProjectSwitch = false }: Props) {
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "USD";
  const { data: projects = [] } = useProjects();
  const { data: allTx = [] } = useTransactions();
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const softDeleteTx = useSoftDeleteTx();
  const { update: updateTx } = useMutateEntity<Transaction>("transactions", ["transactions"]);

  const [internalProjectId, setInternalProjectId] = useState("");
  const [range, setRange] = useState<Range>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [tradeFilter, setTradeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedMemberKey, setSelectedMemberKey] = useState<string | null>(null);
  const [view, setView] = useState<TransactionViewMode>("list");
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [txOpen, setTxOpen] = useState(false);

  const activeProjects = projects.filter((p) => p.status === "active");
  const otherProjects = projects.filter((p) => p.status !== "active");

  useEffect(() => {
    if (fixedProjectId || !allowProjectSwitch || projects.length === 0) return;
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("money-manager:last-team-project") : null;
    const validStored = stored && projects.some((p) => p.id === stored) ? stored : null;
    setInternalProjectId((current) => current || validStored || activeProjects[0]?.id || projects[0]?.id || "");
  }, [fixedProjectId, allowProjectSwitch, projects, activeProjects]);

  const selectedProjectId = fixedProjectId ?? internalProjectId;
  const project = projects.find((p) => p.id === selectedProjectId);

  const changeProject = (next: string) => {
    setInternalProjectId(next);
    setSelectedMemberKey(null);
    setTradeFilter("all");
    if (typeof window !== "undefined") window.localStorage.setItem("money-manager:last-team-project", next);
  };

  const projectTxs = useMemo(
    () => allTx.filter((tx) => tx.project_id === selectedProjectId && tx.type === "expense"),
    [allTx, selectedProjectId],
  );

  const bounds = useMemo(() => {
    const now = new Date();
    if (range === "month") return { from: startOfMonth(now), to: endOfMonth(now) };
    if (range === "year") return { from: startOfYear(now), to: endOfYear(now) };
    if (range === "custom") return {
      from: customFrom ? startOfDay(new Date(customFrom)) : null,
      to: customTo ? endOfDay(new Date(customTo)) : null,
    };
    return { from: null as Date | null, to: null as Date | null };
  }, [range, customFrom, customTo]);

  const periodProjectTxs = useMemo(() => projectTxs.filter((tx) => {
    const occurred = new Date(tx.occurred_at);
    if (bounds.from && occurred < bounds.from) return false;
    if (bounds.to && occurred > bounds.to) return false;
    return true;
  }), [projectTxs, bounds]);

  const allProjectRows = useMemo(() => aggregateRows(projectTxs, categories), [projectTxs, categories]);
  const periodRows = useMemo(() => aggregateRows(periodProjectTxs, categories), [periodProjectTxs, categories]);

  const tradeTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of periodRows) map.set(row.trade, (map.get(row.trade) ?? 0) + row.total);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [periodRows]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return periodRows.filter((row) => {
      if (tradeFilter !== "all" && row.trade !== tradeFilter) return false;
      if (q && !`${row.person} ${row.trade}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [periodRows, tradeFilter, search]);

  useEffect(() => {
    if (selectedMemberKey && !periodRows.some((row) => row.key === selectedMemberKey)) setSelectedMemberKey(null);
  }, [periodRows, selectedMemberKey]);

  const selectedPeriodRow = periodRows.find((row) => row.key === selectedMemberKey) ?? null;
  const selectedAllTimeRow = allProjectRows.find((row) => row.key === selectedMemberKey) ?? selectedPeriodRow;

  const acrossAllProjectsTotal = useMemo(() => {
    if (!selectedMemberKey) return 0;
    return aggregateRows(allTx.filter((tx) => tx.type === "expense"), categories)
      .find((row) => row.key === selectedMemberKey)?.total ?? 0;
  }, [allTx, categories, selectedMemberKey]);

  const paymentModes = useMemo(() => {
    if (!selectedPeriodRow) return [];
    const map = new Map<string, number>();
    for (const tx of selectedPeriodRow.transactions) {
      const account = accounts.find((a) => a.id === tx.account_id);
      const label = tx.payment_method || account?.name || "Other";
      map.set(label, (map.get(label) ?? 0) + Number(tx.amount));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [selectedPeriodRow, accounts]);

  const totalPaid = periodRows.reduce((sum, row) => sum + row.total, 0);
  const paymentCount = periodRows.reduce((sum, row) => sum + row.count, 0);

  if (!project) {
    return (
      <div className="rounded-2xl border border-dashed bg-card px-6 py-14 text-center">
        <UsersRound className="mx-auto h-9 w-9 text-muted-foreground" />
        <p className="mt-3 font-medium">Choose a project to view its team ledger</p>
        <p className="mt-1 text-sm text-muted-foreground">Team totals are calculated only from transactions assigned to that project.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {allowProjectSwitch && (
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)] lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Project team ledger</p>
            <h2 className="mt-1 text-xl font-semibold">Who have you paid on this project?</h2>
          </div>
          <div className="w-full lg:w-[340px]">
            <Select value={selectedProjectId} onValueChange={changeProject}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Choose project" /></SelectTrigger>
              <SelectContent>
                {activeProjects.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Active projects</SelectLabel>
                    {activeProjects.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                  </SelectGroup>
                )}
                {otherProjects.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Other projects</SelectLabel>
                    {otherProjects.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3 shadow-[var(--shadow-soft)] xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="truncate font-semibold">{project.name}</p>
          <p className="truncate text-xs text-muted-foreground">{project.client_name || "No client"}{project.site_address ? ` · ${project.site_address}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          {(["all", "month", "year"] as const).map((value) => (
            <Button key={value} size="sm" variant={range === value ? "secondary" : "ghost"} onClick={() => setRange(value)}>
              {value === "all" ? "All time" : value === "month" ? "This month" : "This year"}
            </Button>
          ))}
          <Button size="sm" variant={range === "custom" ? "secondary" : "ghost"} onClick={() => setRange("custom")}>Custom</Button>
        </div>
      </div>

      {range === "custom" && (
        <div className="grid max-w-md grid-cols-2 gap-2">
          <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total labour paid" value={formatCurrency(totalPaid, currency)} icon={<WalletCards className="h-4 w-4" />} />
        <MetricCard label="People / teams" value={String(periodRows.length)} icon={<UsersRound className="h-4 w-4" />} />
        <MetricCard label="Trades" value={String(tradeTotals.length)} icon={<HardHat className="h-4 w-4" />} />
        <MetricCard label="Payments" value={String(paymentCount)} icon={<CalendarDays className="h-4 w-4" />} />
      </div>

      {tradeTotals.length > 0 && (
        <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setTradeFilter("all")} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${tradeFilter === "all" ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>All · {formatCurrency(totalPaid, currency)}</button>
            {tradeTotals.map(([trade, amount]) => (
              <button key={trade} type="button" onClick={() => setTradeFilter(trade)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${tradeFilter === trade ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                {trade} · {formatCurrency(amount, currency)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border bg-card shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold">Project team</h3>
            <p className="text-xs text-muted-foreground">Click a person to see their project ledger and related transactions.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search person or trade…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {visibleRows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">No labour/team transactions match this project and period.</div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/35 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-4 py-3 font-medium">Person / Team</th><th className="px-4 py-3 font-medium">Trade</th><th className="px-4 py-3 text-right font-medium">Paid</th><th className="px-4 py-3 text-right font-medium">Payments</th><th className="px-4 py-3 text-right font-medium">Last payment</th></tr>
                </thead>
                <tbody className="divide-y">
                  {visibleRows.map((row) => (
                    <tr key={row.key} onClick={() => setSelectedMemberKey(row.key)} className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedMemberKey === row.key ? "bg-primary/5" : ""}`}>
                      <td className="px-4 py-3 font-medium">{row.person}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.trade}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-primary">{formatCurrency(row.total, currency)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.count}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{format(new Date(row.lastAt), "dd MMM yyyy")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2 p-3 md:hidden">
              {visibleRows.map((row) => (
                <button key={row.key} type="button" onClick={() => setSelectedMemberKey(row.key)} className={`rounded-xl border p-3 text-left ${selectedMemberKey === row.key ? "border-primary bg-primary/5" : ""}`}>
                  <div className="flex items-start justify-between gap-3"><div><p className="font-medium">{row.person}</p><p className="text-xs text-muted-foreground">{row.trade} · {row.count} payments</p></div><p className="font-semibold tabular-nums text-primary">{formatCurrency(row.total, currency)}</p></div>
                  <p className="mt-2 text-[11px] text-muted-foreground">Last paid {format(new Date(row.lastAt), "dd MMM yyyy")}</p>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {selectedPeriodRow && selectedAllTimeRow && (
        <div className="grid gap-4">
          <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{selectedPeriodRow.trade}</p>
                <h3 className="mt-1 text-xl font-semibold">{selectedPeriodRow.person}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{project.name}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedMemberKey(null)}>Close ledger</Button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SmallMetric label={range === "all" ? "Paid in project" : "Paid in selected period"} value={formatCurrency(selectedPeriodRow.total, currency)} />
              <SmallMetric label="Project all-time" value={formatCurrency(selectedAllTimeRow.total, currency)} />
              <SmallMetric label="Across all projects" value={formatCurrency(acrossAllProjectsTotal, currency)} />
              <SmallMetric label="Payments in period" value={String(selectedPeriodRow.count)} />
            </div>
            {paymentModes.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment mode breakdown</p>
                <div className="flex flex-wrap gap-2">{paymentModes.map(([mode, amount]) => <span key={mode} className="rounded-full border bg-muted/30 px-3 py-1.5 text-xs"><span className="font-medium">{mode}</span> · {formatCurrency(amount, currency)}</span>)}</div>
              </div>
            )}
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div><h3 className="font-semibold">Related transactions</h3><p className="text-xs text-muted-foreground">Only {selectedPeriodRow.person}'s payments in {project.name} for the selected period.</p></div>
              <div className="flex rounded-xl border bg-card p-1">
                <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} className="h-8 gap-1.5" onClick={() => setView("list")}><LayoutList className="h-4 w-4" /> List</Button>
                <Button size="sm" variant={view === "table" ? "secondary" : "ghost"} className="h-8 gap-1.5" onClick={() => setView("table")}><Table2 className="h-4 w-4" /> Table</Button>
              </div>
            </div>
            <TransactionCollection
              transactions={selectedPeriodRow.transactions}
              categories={categories}
              accounts={accounts}
              projects={projects}
              currency={currency}
              view={view}
              onEdit={(tx) => { setEditingTx(tx); setTxOpen(true); }}
              onDelete={(tx) => softDeleteTx.mutate(tx.id)}
              onFavorite={(tx) => updateTx.mutate({ id: tx.id, favorite: !tx.favorite })}
              emptyMessage="No related transactions in this period."
            />
          </div>
        </div>
      )}

      <TransactionDialog open={txOpen} onOpenChange={(open) => { setTxOpen(open); if (!open) setEditingTx(null); }} editing={editingTx} />
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]"><div className="flex items-center gap-2 text-muted-foreground">{icon}<p className="text-xs uppercase tracking-wide">{label}</p></div><p className="mt-2 text-xl font-semibold tabular-nums">{value}</p></div>;
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-muted/45 p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-base font-semibold tabular-nums">{value}</p></div>;
}
