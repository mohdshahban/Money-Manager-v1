import { useEffect, useMemo, useState, type ReactNode } from "react";
import { endOfDay, endOfMonth, endOfYear, format, startOfDay, startOfMonth, startOfYear } from "date-fns";
import {
  CalendarDays,
  CircleDollarSign,
  Hammer,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TransactionDialog } from "./TransactionDialog";
import { TransactionCollection } from "./TransactionCollection";
import {
  useAccounts,
  useCategories,
  useMutateEntity,
  useProjects,
  useSoftDeleteTx,
  useTransactions,
  type Transaction,
} from "@/hooks/useFinance";
import {
  useProjectTeamMembers,
  useProjectTeamMutations,
  useProjectTeamServices,
  type ProjectTeamMember,
  type ProjectTeamService,
  type TeamPaymentBasis,
  type TeamServiceInput,
} from "@/hooks/useProjectTeam";
import { useProfile } from "@/hooks/useProfile";
import { formatCurrency } from "@/lib/format";

type Range = "all" | "month" | "year" | "custom";

type Props = {
  projectId?: string;
  allowProjectSwitch?: boolean;
};

type TeamRow = {
  member: ProjectTeamMember;
  services: ProjectTeamService[];
  workValue: number;
  paidPeriod: number;
  paidAllTime: number;
  paymentsPeriod: number;
  paymentsAllTime: number;
  lastPayment: string | null;
  periodTransactions: Transaction[];
  allTransactions: Transaction[];
  balance: number | null;
};

const SERVICE_UNITS = ["sqft", "rft", "pcs", "nos", "point", "set", "job", "day", "m", "sqm"] as const;

function buildPaymentMap(transactions: Transaction[]) {
  const map = new Map<string, { total: number; count: number; lastAt: string | null; transactions: Transaction[] }>();
  for (const tx of transactions) {
    if (!tx.team_member_id || tx.type !== "expense") continue;
    const current = map.get(tx.team_member_id) ?? { total: 0, count: 0, lastAt: null, transactions: [] };
    current.total += Number(tx.amount);
    current.count += 1;
    current.transactions.push(tx);
    if (!current.lastAt || new Date(tx.occurred_at) > new Date(current.lastAt)) current.lastAt = tx.occurred_at;
    map.set(tx.team_member_id, current);
  }
  return map;
}

function serviceValue(service: Pick<ProjectTeamService, "quantity" | "rate"> | TeamServiceInput) {
  return Number(service.quantity || 0) * Number(service.rate || 0);
}

function memberBasisLabel(member: ProjectTeamMember) {
  return member.payment_basis === "service_rate" ? "Service-wise" : "Fixed contract";
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
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<ProjectTeamMember | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [txOpen, setTxOpen] = useState(false);

  const activeProjects = projects.filter((project) => project.status === "active");
  const otherProjects = projects.filter((project) => project.status !== "active");

  useEffect(() => {
    if (fixedProjectId || !allowProjectSwitch || projects.length === 0) return;
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("money-manager:last-team-project") : null;
    const validStored = stored && projects.some((project) => project.id === stored) ? stored : null;
    setInternalProjectId((current) => current || validStored || activeProjects[0]?.id || projects[0]?.id || "");
  }, [fixedProjectId, allowProjectSwitch, projects, activeProjects]);

  const selectedProjectId = fixedProjectId ?? internalProjectId;
  const project = projects.find((item) => item.id === selectedProjectId) ?? null;
  const { data: allMembers = [] } = useProjectTeamMembers(selectedProjectId || null);
  const { data: allServices = [] } = useProjectTeamServices(selectedProjectId || null);
  const memberMutations = useProjectTeamMutations(selectedProjectId || null);

  const teamMembers = useMemo(() => allMembers.filter((member) => member.active), [allMembers]);
  const servicesByMember = useMemo(() => {
    const map = new Map<string, ProjectTeamService[]>();
    for (const service of allServices.filter((item) => item.active)) {
      const current = map.get(service.team_member_id) ?? [];
      current.push(service);
      map.set(service.team_member_id, current);
    }
    return map;
  }, [allServices]);

  const changeProject = (next: string) => {
    setInternalProjectId(next);
    setSelectedMemberId(null);
    setTradeFilter("all");
    setSearch("");
    if (typeof window !== "undefined") window.localStorage.setItem("money-manager:last-team-project", next);
  };

  const projectExpenses = useMemo(
    () => allTx.filter((tx) => tx.project_id === selectedProjectId && tx.type === "expense"),
    [allTx, selectedProjectId],
  );

  const bounds = useMemo(() => {
    const now = new Date();
    if (range === "month") return { from: startOfMonth(now), to: endOfMonth(now) };
    if (range === "year") return { from: startOfYear(now), to: endOfYear(now) };
    if (range === "custom") {
      return {
        from: customFrom ? startOfDay(new Date(customFrom)) : null,
        to: customTo ? endOfDay(new Date(customTo)) : null,
      };
    }
    return { from: null as Date | null, to: null as Date | null };
  }, [range, customFrom, customTo]);

  const periodExpenses = useMemo(
    () =>
      projectExpenses.filter((tx) => {
        const occurred = new Date(tx.occurred_at);
        if (bounds.from && occurred < bounds.from) return false;
        if (bounds.to && occurred > bounds.to) return false;
        return true;
      }),
    [projectExpenses, bounds],
  );

  const allPayments = useMemo(() => buildPaymentMap(projectExpenses), [projectExpenses]);
  const periodPayments = useMemo(() => buildPaymentMap(periodExpenses), [periodExpenses]);

  const rows = useMemo<TeamRow[]>(
    () =>
      teamMembers.map((member) => {
        const all = allPayments.get(member.id) ?? { total: 0, count: 0, lastAt: null, transactions: [] };
        const period = periodPayments.get(member.id) ?? { total: 0, count: 0, lastAt: null, transactions: [] };
        const services = servicesByMember.get(member.id) ?? [];
        const workValue =
          member.payment_basis === "service_rate"
            ? services.reduce((sum, service) => sum + serviceValue(service), 0)
            : Number(member.contract_amount) || 0;

        return {
          member,
          services,
          workValue,
          paidPeriod: period.total,
          paidAllTime: all.total,
          paymentsPeriod: period.count,
          paymentsAllTime: all.count,
          lastPayment: all.lastAt,
          periodTransactions: period.transactions,
          allTransactions: all.transactions,
          balance: workValue > 0 ? workValue - all.total : null,
        };
      }),
    [teamMembers, allPayments, periodPayments, servicesByMember],
  );

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (tradeFilter !== "all" && row.member.trade !== tradeFilter) return false;
        if (q && !`${row.member.name} ${row.member.trade} ${row.member.phone ?? ""}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.paidPeriod - a.paidPeriod || a.member.name.localeCompare(b.member.name));
  }, [rows, tradeFilter, search]);

  const tradeTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) map.set(row.member.trade, (map.get(row.member.trade) ?? 0) + row.paidPeriod);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const totalWorkValue = rows.reduce((sum, row) => sum + row.workValue, 0);
  const totalPaidPeriod = rows.reduce((sum, row) => sum + row.paidPeriod, 0);
  const totalPaidAllTime = rows.reduce((sum, row) => sum + row.paidAllTime, 0);
  const totalBalance = rows.reduce((sum, row) => sum + (row.balance ?? 0), 0);
  const paymentCountPeriod = rows.reduce((sum, row) => sum + row.paymentsPeriod, 0);
  const selectedRow = rows.find((row) => row.member.id === selectedMemberId) ?? null;

  useEffect(() => {
    if (selectedMemberId && !rows.some((row) => row.member.id === selectedMemberId)) setSelectedMemberId(null);
  }, [selectedMemberId, rows]);

  if (!project) {
    return (
      <div className="rounded-2xl border border-dashed bg-card px-6 py-14 text-center">
        <Users className="mx-auto h-9 w-9 text-muted-foreground" />
        <p className="mt-3 font-medium">Choose a project to manage its team</p>
        <p className="mt-1 text-sm text-muted-foreground">Every team member belongs to one project only.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {allowProjectSwitch && (
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)] lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Project team ledger</p>
            <h2 className="mt-1 text-xl font-semibold">Who is working on this project?</h2>
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
          <p className="truncate text-xs text-muted-foreground">
            {project.client_name || "No client"}{project.site_address ? ` · ${project.site_address}` : ""}
          </p>
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
        <MetricCard label="Total work value" value={formatCurrency(totalWorkValue, currency)} icon={<CircleDollarSign className="h-4 w-4" />} />
        <MetricCard label={range === "all" ? "Paid" : "Paid in period"} value={formatCurrency(totalPaidPeriod, currency)} icon={<WalletCards className="h-4 w-4" />} />
        <MetricCard label="People / teams" value={String(teamMembers.length)} icon={<Users className="h-4 w-4" />} />
        <MetricCard label="Outstanding balance" value={formatCurrency(totalBalance, currency)} icon={<Hammer className="h-4 w-4" />} />
      </div>

      {tradeTotals.length > 0 && (
        <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setTradeFilter("all")} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${tradeFilter === "all" ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              All · {formatCurrency(totalPaidPeriod, currency)}
            </button>
            {tradeTotals.map(([trade, amount]) => (
              <button key={trade} type="button" onClick={() => setTradeFilter(trade)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${tradeFilter === trade ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                {trade} · {formatCurrency(amount, currency)}
              </button>
            ))}
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-semibold">Project team</h3>
            <p className="text-xs text-muted-foreground">
              Assign a fixed contract or service-wise rates, then link payments from New Transaction.
            </p>
          </div>
          <div className="flex w-full gap-2 lg:w-auto">
            <div className="relative min-w-0 flex-1 lg:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search person, trade or phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button className="shrink-0 gap-1.5" onClick={() => { setEditingMember(null); setMemberDialogOpen(true); }}>
              <Plus className="h-4 w-4" /> Add team
            </Button>
          </div>
        </div>

        {visibleRows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No assigned team members yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add a painter, carpenter, sofa maker, electrician, contractor or any other person/team for this project.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="bg-muted/35 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Person / Team</th>
                  <th className="px-4 py-3 font-medium">Trade</th>
                  <th className="px-4 py-3 font-medium">Payment basis</th>
                  <th className="px-4 py-3 text-right font-medium">Work value</th>
                  <th className="px-4 py-3 text-right font-medium">{range === "all" ? "Paid" : "Paid · period"}</th>
                  <th className="px-4 py-3 text-right font-medium">Balance</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 text-right font-medium">Payments</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleRows.map((row) => (
                  <tr key={row.member.id} onClick={() => setSelectedMemberId(row.member.id)} className={`cursor-pointer transition-colors hover:bg-muted/40 ${selectedMemberId === row.member.id ? "bg-primary/5" : ""}`}>
                    <td className="px-4 py-3 font-medium">{row.member.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.member.trade}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border bg-muted/30 px-2 py-1 text-[10px] font-medium">{memberBasisLabel(row.member)}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.workValue > 0 ? formatCurrency(row.workValue, currency) : "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-primary">{formatCurrency(row.paidPeriod, currency)}</td>
                    <td className={`px-4 py-3 text-right font-medium tabular-nums ${row.balance != null && row.balance < 0 ? "text-destructive" : ""}`}>
                      {row.balance == null ? "—" : formatCurrency(row.balance, currency)}
                    </td>
                    <td className="px-4 py-3">
                      {row.member.phone ? (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {row.member.phone}</span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.paymentsPeriod}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingMember(row.member); setMemberDialogOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={async () => {
                          if (!confirm(`Remove ${row.member.name} from this project team? Existing payment history will stay linked.`)) return;
                          await memberMutations.archiveMember.mutateAsync(row.member.id);
                          if (selectedMemberId === row.member.id) setSelectedMemberId(null);
                          toast.success("Team member removed from project");
                        }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedRow && (
        <section className="grid gap-4">
          <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{selectedRow.member.trade}</p>
                <h3 className="mt-1 text-xl font-semibold">{selectedRow.member.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {project.name} · {memberBasisLabel(selectedRow.member)}
                  {selectedRow.member.phone ? ` · ${selectedRow.member.phone}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setEditingMember(selectedRow.member); setMemberDialogOpen(true); }}>Edit team</Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedMemberId(null)}>Close ledger</Button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SmallMetric label={selectedRow.member.payment_basis === "service_rate" ? "Measured work value" : "Fixed contract"} value={selectedRow.workValue > 0 ? formatCurrency(selectedRow.workValue, currency) : "Not set"} />
              <SmallMetric label="Paid all-time" value={formatCurrency(selectedRow.paidAllTime, currency)} />
              <SmallMetric
                label={selectedRow.balance == null ? "Balance" : selectedRow.balance >= 0 ? "Balance due" : "Overpaid vs work value"}
                value={selectedRow.balance == null ? "—" : formatCurrency(Math.abs(selectedRow.balance), currency)}
                valueClass={selectedRow.balance != null && selectedRow.balance < 0 ? "text-destructive" : ""}
              />
              <SmallMetric label={range === "all" ? "Payments" : "Payments in period"} value={String(selectedRow.paymentsPeriod)} />
            </div>

            {selectedRow.member.payment_basis === "service_rate" && (
              <ServiceBreakdown services={selectedRow.services} currency={currency} />
            )}

            {selectedRow.member.notes && <p className="mt-4 rounded-xl bg-muted/35 p-3 text-sm text-muted-foreground">{selectedRow.member.notes}</p>}
          </div>

          <div>
            <div className="mb-3">
              <h3 className="font-semibold">Related transactions</h3>
              <p className="text-xs text-muted-foreground">Only transactions explicitly linked to {selectedRow.member.name} in {project.name}.</p>
            </div>
            <TransactionCollection
              transactions={selectedRow.periodTransactions}
              categories={categories}
              accounts={accounts}
              projects={projects}
              currency={currency}
              view="list"
              emptyMessage="No linked payments in this period."
              onEdit={(tx) => { setEditingTx(tx); setTxOpen(true); }}
              onDelete={(tx) => softDeleteTx.mutate(tx.id)}
              onFavorite={(tx) => updateTx.mutate({ id: tx.id, favorite: !tx.favorite })}
            />
          </div>
        </section>
      )}

      <MemberDialog
        open={memberDialogOpen}
        onOpenChange={(next) => {
          setMemberDialogOpen(next);
          if (!next) setEditingMember(null);
        }}
        editing={editingMember}
        existingServices={editingMember ? (servicesByMember.get(editingMember.id) ?? []) : []}
        currency={currency}
        onSave={async (payload) => {
          const { services, ...memberPayload } = payload;
          let savedMember: ProjectTeamMember;
          if (editingMember) {
            savedMember = await memberMutations.updateMember.mutateAsync({ id: editingMember.id, ...memberPayload });
            if (memberPayload.payment_basis === "service_rate") {
              await memberMutations.replaceServices.mutateAsync({ team_member_id: editingMember.id, services });
            }
            toast.success("Team member updated");
          } else {
            savedMember = await memberMutations.createMember.mutateAsync(memberPayload);
            if (memberPayload.payment_basis === "service_rate") {
              await memberMutations.replaceServices.mutateAsync({ team_member_id: savedMember.id, services });
            }
            toast.success("Team member added");
          }
          setMemberDialogOpen(false);
          setEditingMember(null);
        }}
      />

      <TransactionDialog
        open={txOpen}
        onOpenChange={(next) => {
          setTxOpen(next);
          if (!next) setEditingTx(null);
        }}
        editing={editingTx}
      />

      {range !== "all" && totalPaidAllTime > 0 && (
        <p className="text-right text-[11px] text-muted-foreground">
          All-time payments to active assigned team members: {formatCurrency(totalPaidAllTime, currency)} · {paymentCountPeriod} payments in selected period.
        </p>
      )}
    </div>
  );
}

function ServiceBreakdown({ services, currency }: { services: ProjectTeamService[]; currency: string }) {
  const total = services.reduce((sum, service) => sum + serviceValue(service), 0);
  return (
    <div className="mt-4 overflow-hidden rounded-xl border">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-2">
        <div>
          <p className="text-sm font-semibold">Service breakdown</p>
          <p className="text-[11px] text-muted-foreground">Quantity × rate defines this contractor's payable work value.</p>
        </div>
        <p className="font-semibold tabular-nums">{formatCurrency(total, currency)}</p>
      </div>
      {services.length === 0 ? (
        <div className="p-4 text-center text-xs text-muted-foreground">No service lines configured yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="bg-muted/20 text-left uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Service</th>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-3 py-2 text-right font-medium">Quantity</th>
                <th className="px-3 py-2 text-right font-medium">Rate</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {services.map((service) => (
                <tr key={service.id}>
                  <td className="px-3 py-2 font-medium">{service.service_name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{service.location || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(service.quantity).toLocaleString("en-IN")} {service.unit}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(Number(service.rate), currency)} / {service.unit}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatCurrency(serviceValue(service), currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<p className="text-[10px] uppercase tracking-wide">{label}</p></div>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function SmallMetric({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-xl bg-muted/45 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-base font-semibold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

type ServiceDraft = {
  id: number;
  service_name: string;
  location: string;
  quantity: string;
  unit: string;
  rate: string;
};

type MemberPayload = {
  name: string;
  trade: string;
  payment_basis: TeamPaymentBasis;
  contract_amount: number;
  phone: string | null;
  notes: string | null;
  services: TeamServiceInput[];
};

function blankService(id: number): ServiceDraft {
  return { id, service_name: "", location: "", quantity: "", unit: "sqft", rate: "" };
}

function MemberDialog({
  open,
  onOpenChange,
  editing,
  existingServices,
  currency,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ProjectTeamMember | null;
  existingServices: ProjectTeamService[];
  currency: string;
  onSave: (payload: MemberPayload) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [trade, setTrade] = useState("Labour");
  const [paymentBasis, setPaymentBasis] = useState<TeamPaymentBasis>("fixed_contract");
  const [contract, setContract] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [services, setServices] = useState<ServiceDraft[]>([blankService(1)]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setTrade(editing?.trade ?? "Labour");
    setPaymentBasis(editing?.payment_basis ?? "fixed_contract");
    setContract(editing && Number(editing.contract_amount) > 0 ? String(editing.contract_amount) : "");
    setPhone(editing?.phone ?? "");
    setNotes(editing?.notes ?? "");
    setServices(
      existingServices.length > 0
        ? existingServices.map((service, index) => ({
            id: index + 1,
            service_name: service.service_name,
            location: service.location ?? "",
            quantity: String(service.quantity),
            unit: service.unit,
            rate: String(service.rate),
          }))
        : [blankService(1)],
    );
  }, [open, editing, existingServices]);

  const serviceTotal = services.reduce(
    (sum, service) => sum + Math.max(0, Number(service.quantity) || 0) * Math.max(0, Number(service.rate) || 0),
    0,
  );

  const updateService = (id: number, patch: Partial<ServiceDraft>) => {
    setServices((current) => current.map((service) => service.id === id ? { ...service, ...patch } : service));
  };

  const save = async () => {
    if (!name.trim()) return toast.error("Enter person or team name");
    if (!trade.trim()) return toast.error("Enter trade / role");

    const servicePayload = services
      .filter((service) => service.service_name.trim() || service.quantity || service.rate)
      .map((service) => ({
        service_name: service.service_name.trim(),
        location: service.location.trim() || null,
        quantity: Math.max(0, Number(service.quantity) || 0),
        unit: service.unit || "sqft",
        rate: Math.max(0, Number(service.rate) || 0),
      }));

    if (paymentBasis === "service_rate") {
      if (servicePayload.length === 0) return toast.error("Add at least one service");
      const invalid = servicePayload.some((service) => !service.service_name || service.quantity <= 0 || service.rate <= 0);
      if (invalid) return toast.error("Each service needs a name, quantity and rate");
    }

    try {
      setSaving(true);
      await onSave({
        name: name.trim(),
        trade: trade.trim(),
        payment_basis: paymentBasis,
        contract_amount: paymentBasis === "fixed_contract" ? Math.max(0, Number(contract) || 0) : 0,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
        services: servicePayload,
      });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle>{editing ? "Edit project team" : "Add project team"}</DialogTitle></DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Person / team name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rashid Carpenter" />
            </div>
            <div className="grid gap-2">
              <Label>Trade / role</Label>
              <Input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="e.g. Carpenter" />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Payment basis</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentBasis("fixed_contract")}
                className="rounded-xl border p-3 text-left transition-all data-[active=true]:border-primary data-[active=true]:bg-primary/5"
                data-active={paymentBasis === "fixed_contract"}
              >
                <p className="text-sm font-semibold">Fixed Contract</p>
                <p className="mt-1 text-xs text-muted-foreground">One agreed lump-sum amount for the complete scope.</p>
              </button>
              <button
                type="button"
                onClick={() => setPaymentBasis("service_rate")}
                className="rounded-xl border p-3 text-left transition-all data-[active=true]:border-primary data-[active=true]:bg-primary/5"
                data-active={paymentBasis === "service_rate"}
              >
                <p className="text-sm font-semibold">Service-wise Rate</p>
                <p className="mt-1 text-xs text-muted-foreground">Calculate payable value from quantity × rate for each service.</p>
              </button>
            </div>
          </div>

          {paymentBasis === "fixed_contract" ? (
            <div className="grid max-w-sm gap-2">
              <Label>Fixed contract amount <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input type="number" min="0" step="0.01" value={contract} onChange={(e) => setContract(e.target.value)} placeholder={currency === "INR" ? "42000" : "0"} />
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/25 p-3">
                <div>
                  <p className="text-sm font-semibold">Services / measurements</p>
                  <p className="text-[11px] text-muted-foreground">Example: Kitchen Cabinets · Kitchen · 120 sqft × ₹350.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setServices((current) => [...current, blankService(Math.max(0, ...current.map((item) => item.id)) + 1)])}
                >
                  <Plus className="h-3.5 w-3.5" /> Add service
                </Button>
              </div>

              <div className="grid gap-3 p-3">
                {services.map((service, index) => (
                  <div key={service.id} className="rounded-xl border bg-muted/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Service {index + 1}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={services.length === 1}
                        onClick={() => setServices((current) => current.filter((item) => item.id !== service.id))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[1.35fr_1fr_110px_100px_120px_120px]">
                      <div className="grid gap-1.5">
                        <Label className="text-[11px]">Service</Label>
                        <Input value={service.service_name} onChange={(e) => updateService(service.id, { service_name: e.target.value })} placeholder="Cabinets" />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-[11px]">Location</Label>
                        <Input value={service.location} onChange={(e) => updateService(service.id, { location: e.target.value })} placeholder="Kitchen" />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-[11px]">Quantity</Label>
                        <Input type="number" min="0" step="0.001" value={service.quantity} onChange={(e) => updateService(service.id, { quantity: e.target.value })} placeholder="120" />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-[11px]">Unit</Label>
                        <Select value={service.unit} onValueChange={(value) => updateService(service.id, { unit: value })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{SERVICE_UNITS.map((unit) => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-[11px]">Rate</Label>
                        <Input type="number" min="0" step="0.01" value={service.rate} onChange={(e) => updateService(service.id, { rate: e.target.value })} placeholder="350" />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-[11px]">Total</Label>
                        <div className="flex h-9 items-center justify-end rounded-md border bg-muted/35 px-3 text-sm font-semibold tabular-nums">
                          {formatCurrency((Number(service.quantity) || 0) * (Number(service.rate) || 0), currency)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between border-t bg-muted/25 px-4 py-3">
                <span className="text-sm font-medium">Total work value</span>
                <span className="text-lg font-semibold tabular-nums">{formatCurrency(serviceTotal, currency)}</span>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Contact number <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone / WhatsApp" />
            </div>
            <div className="grid gap-2">
              <Label>Notes <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Scope / payment terms" />
            </div>
          </div>

          <div className="rounded-xl bg-muted/35 p-3 text-xs text-muted-foreground">
            Payments are still recorded normally from New Transaction. The selected team's work value is compared with linked payments to calculate the outstanding balance.
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add team"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
