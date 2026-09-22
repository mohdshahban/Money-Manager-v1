import { useEffect, useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import {
  Boxes,
  ChevronRight,
  ClipboardList,
  Link2,
  MapPinned,
  PackageOpen,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useCategories,
  useProjects,
  useTransactions,
  type Category,
  type Transaction,
} from "@/hooks/useFinance";
import {
  useMaterialInventory,
  useMaterialMutations,
  type MaterialArea,
  type MaterialItem,
  type MaterialPurchaseBatch,
  type MaterialPurchaseLineInput,
  type MaterialUsage,
  type MaterialWorkItem,
} from "@/hooks/useMaterials";

const UNITS = ["pcs", "pair", "sheet", "L", "kg", "m", "roll", "box", "set"] as const;

const PURCHASE_CATEGORIES = [
  "Paint Material",
  "Carpentry Hardware",
  "Plywood & Boards",
  "Laminate",
  "Electrical Material",
  "Plumbing Material",
  "Tile & Stone",
  "False Ceiling Material",
  "Glass & Aluminium",
  "Other Material",
] as const;
const MATERIAL_HINTS = [
  "material",
  "hardware",
  "hinge",
  "paint",
  "plywood",
  "ply",
  "hdhmr",
  "laminate",
  "mica",
  "pvc",
  "channel",
  "board",
  "adhesive",
  "tape",
  "screw",
  "electrical",
  "plumbing",
  "tile",
  "glass",
  "fitting",
];

function rootCategory(category: Category | undefined, categories: Category[]) {
  if (!category?.parent_id) return category;
  return categories.find((item) => item.id === category.parent_id) ?? category;
}

function qty(value: number) {
  return Number(value.toFixed(3)).toString();
}

function localDateInput(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function dateToIso(date: string) {
  return new Date(`${date}T12:00:00`).toISOString();
}

function extractQuantityHints(text: string) {
  const regex = /\b(\d+(?:\.\d+)?)\s*(pcs?|pc|pieces?|sheets?|ltr|liters?|litres?|l|kg|kgs|kilograms?|m|meters?|metres?|pairs?|boxes?|rolls?|sets?)\b/gi;
  const matches: string[] = [];
  for (const match of text.matchAll(regex)) {
    const candidate = `${match[1]} ${match[2]}`;
    if (!matches.some((value) => value.toLowerCase() === candidate.toLowerCase())) matches.push(candidate);
  }
  return matches;
}

function transactionText(tx: Transaction, categories: Category[]) {
  const category = categories.find((item) => item.id === tx.category_id);
  const root = rootCategory(category, categories);
  return [
    root?.name,
    category?.parent_id ? category.name : null,
    tx.vendor,
    tx.notes,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function MaterialProjectView() {
  const { data: projects = [] } = useProjects();
  const { data: allTx = [] } = useTransactions();
  const { data: categories = [] } = useCategories();

  const [projectId, setProjectId] = useState("");
  const [search, setSearch] = useState("");
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseSourceId, setPurchaseSourceId] = useState("");
  const [areaOpen, setAreaOpen] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);

  const { data, isLoading } = useMaterialInventory(projectId || null);
  const material = data ?? { items: [], batches: [], purchases: [], areas: [], workItems: [], usage: [] };
  const mutations = useMaterialMutations(projectId || null);

  useEffect(() => {
    if (projectId && projects.some((project) => project.id === projectId)) return;
    const first = projects.find((project) => project.status === "active") ?? projects[0];
    if (first) setProjectId(first.id);
  }, [projects, projectId]);

  const project = projects.find((item) => item.id === projectId) ?? null;
  const projectTxs = useMemo(
    () => allTx.filter((tx) => tx.project_id === projectId),
    [allTx, projectId],
  );

  const likelyMaterialTxs = useMemo(() => {
    return projectTxs
      .filter((tx) => {
        if (tx.type !== "expense") return false;
        const text = transactionText(tx, categories).toLowerCase();
        const categoryMatch = MATERIAL_HINTS.some((hint) => text.includes(hint));
        const hasExplicitQuantity = extractQuantityHints(text).length > 0;
        return categoryMatch || hasExplicitQuantity;
      })
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
  }, [projectTxs, categories]);

  const itemById = useMemo(() => new Map(material.items.map((item) => [item.id, item])), [material.items]);
  const areaById = useMemo(() => new Map(material.areas.map((item) => [item.id, item])), [material.areas]);
  const workById = useMemo(() => new Map(material.workItems.map((item) => [item.id, item])), [material.workItems]);

  const inventoryRows = useMemo(() => {
    const map = new Map<string, { item: MaterialItem; purchased: number; used: number }>();

    for (const purchase of material.purchases) {
      const item = itemById.get(purchase.material_item_id);
      if (!item) continue;
      const current = map.get(item.id) ?? { item, purchased: 0, used: 0 };
      current.purchased += Number(purchase.quantity);
      map.set(item.id, current);
    }

    for (const usage of material.usage) {
      const item = itemById.get(usage.material_item_id);
      if (!item) continue;
      const current = map.get(item.id) ?? { item, purchased: 0, used: 0 };
      current.used += Number(usage.quantity);
      map.set(item.id, current);
    }

    return [...map.values()]
      .map((row) => ({ ...row, remaining: row.purchased - row.used }))
      .filter((row) => row.item.name.toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => a.item.name.localeCompare(b.item.name));
  }, [material.purchases, material.usage, itemById, search]);

  const usageByArea = useMemo(() => {
    return material.areas.map((area) => {
      const areaUsage = material.usage.filter((entry) => entry.area_id === area.id);
      const workItems = material.workItems
        .filter((work) => work.area_id === area.id)
        .map((work) => ({
          work,
          usage: areaUsage.filter((entry) => entry.work_item_id === work.id),
        }))
        .filter((entry) => entry.usage.length > 0 || !!entry.work.name);

      const general = areaUsage.filter((entry) => !entry.work_item_id);
      return { area, workItems, general, totalEntries: areaUsage.length };
    });
  }, [material.areas, material.workItems, material.usage]);

  const linkedTransactionIds = useMemo(
    () => new Set([
      ...material.batches.map((batch) => batch.source_transaction_id),
      ...material.purchases.map((purchase) => purchase.source_transaction_id),
    ].filter(Boolean)),
    [material.batches, material.purchases],
  );

  if (projects.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed bg-card p-12 text-center">
        <PackageOpen className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 font-medium">Create a project first</p>
        <p className="mt-1 text-sm text-muted-foreground">Materials are tracked site-wise, so every inventory record belongs to a project.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)] md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 flex-1">
          <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Project</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="mt-1 max-w-xl"><SelectValue placeholder="Select project" /></SelectTrigger>
            <SelectContent>
              {projects.map((item) => (
                <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => setAreaOpen(true)}>
            <MapPinned className="h-4 w-4" /> Add area
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => setWorkOpen(true)} disabled={material.areas.length === 0}>
            <Wrench className="h-4 w-4" /> Add furniture
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => setPurchaseOpen(true)}>
            <ShoppingCart className="h-4 w-4" /> Record purchase
          </Button>
          <Button className="gap-1.5" onClick={() => setUsageOpen(true)} disabled={material.areas.length === 0 || material.items.length === 0}>
            <Plus className="h-4 w-4" /> Record usage
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="Materials tracked" value={String(inventoryRows.length)} icon={<Boxes className="h-4 w-4" />} />
        <Summary label="Purchase batches" value={String(material.batches.length)} icon={<ShoppingCart className="h-4 w-4" />} />
        <Summary label="Usage records" value={String(material.usage.length)} icon={<ClipboardList className="h-4 w-4" />} />
        <Summary label="Rooms / areas" value={String(material.areas.length)} icon={<MapPinned className="h-4 w-4" />} />
      </div>

      <Tabs defaultValue="inventory" className="grid gap-4">
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-2xl border bg-card p-1 sm:w-fit">
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="usage">Usage by Area</TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="references">Transaction references</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="mt-0">
          <section className="overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-soft)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
              <div>
                <h3 className="font-semibold">Site inventory</h3>
                <p className="mt-1 text-xs text-muted-foreground">Remaining = purchased quantity − usage recorded across rooms and furniture.</p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search material…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            {isLoading ? (
              <div className="p-10 text-center text-sm text-muted-foreground">Loading materials…</div>
            ) : inventoryRows.length === 0 ? (
              <Empty text="No material quantities recorded for this project yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="bg-muted/35 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Material</th>
                      <th className="px-4 py-3 text-right font-medium">Purchased</th>
                      <th className="px-4 py-3 text-right font-medium">Used</th>
                      <th className="px-4 py-3 text-right font-medium">Remaining</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {inventoryRows.map((row) => (
                      <tr key={row.item.id} className="hover:bg-muted/25">
                        <td className="px-4 py-3">
                          <p className="font-medium">{row.item.name}</p>
                          {row.item.category && <p className="text-xs text-muted-foreground">{row.item.category}</p>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{qty(row.purchased)} {row.item.unit}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{qty(row.used)} {row.item.unit}</td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${row.remaining < 0 ? "text-destructive" : "text-[color:var(--success)]"}`}>
                          {qty(row.remaining)} {row.item.unit}
                          {row.remaining < 0 && <p className="text-[10px] font-normal">usage exceeds recorded purchases</p>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="usage" className="mt-0 grid gap-4">
          {material.areas.length === 0 ? (
            <Empty text="Add rooms or areas first, then create furniture/work items and record material usage." />
          ) : (
            usageByArea.map(({ area, workItems, general, totalEntries }) => (
              <AreaUsageCard
                key={area.id}
                area={area}
                workItems={workItems}
                general={general}
                totalEntries={totalEntries}
                itemById={itemById}
                onDeleteUsage={async (id) => {
                  if (!confirm("Delete this usage entry?")) return;
                  await mutations.deleteUsage.mutateAsync(id);
                  toast.success("Usage removed");
                }}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="purchases" className="mt-0">
          <section className="overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-soft)]">
            <div className="flex items-start justify-between gap-3 border-b p-4">
              <div>
                <h3 className="font-semibold">Purchase batches / receipts</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  One receipt can contain many material items. The finance transaction is linked once to the whole batch.
                </p>
              </div>
              <Button size="sm" onClick={() => setPurchaseOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Add purchase</Button>
            </div>

            {material.batches.length === 0 ? (
              <Empty text="No material purchase batches recorded yet." />
            ) : (
              <div className="grid gap-3 p-4">
                {material.batches.map((batch) => {
                  const batchPurchases = material.purchases.filter((purchase) => purchase.batch_id === batch.id);
                  const source = allTx.find((tx) => tx.id === batch.source_transaction_id);
                  return (
                    <details key={batch.id} className="overflow-hidden rounded-xl border bg-muted/10">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">{batch.category}</p>
                            <span className="rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium">
                              {batchPurchases.length} item{batchPurchases.length === 1 ? "" : "s"}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {format(new Date(batch.purchased_at), "dd MMM yyyy")}
                            {batch.notes ? ` · ${batch.notes}` : ""}
                          </p>
                          {source && (
                            <p className="mt-1 flex items-center gap-1 text-[11px] text-primary">
                              <Link2 className="h-3 w-3" /> Finance reference · {transactionText(source, categories) || "Expense"}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-primary">View items</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={async (event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (!confirm(`Delete this ${batch.category} purchase batch and all ${batchPurchases.length} quantity records? The finance transaction will not be changed.`)) return;
                              await mutations.deletePurchaseBatch.mutateAsync(batch.id);
                              toast.success("Purchase batch removed");
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </summary>

                      <div className="divide-y border-t bg-background/70">
                        {batchPurchases.length === 0 ? (
                          <div className="px-4 py-4 text-sm text-muted-foreground">No material lines in this batch.</div>
                        ) : (
                          batchPurchases.map((purchase) => {
                            const item = itemById.get(purchase.material_item_id);
                            return (
                              <div key={purchase.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                                <span className="min-w-0 flex-1 truncate">{item?.name ?? "Unknown material"}</span>
                                <span className="shrink-0 font-semibold tabular-nums">{qty(Number(purchase.quantity))} {item?.unit ?? ""}</span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="references" className="mt-0">
          <section className="overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-soft)]">
            <div className="border-b p-4">
              <h3 className="font-semibold">Likely material transactions</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Read-only references from {project?.name ?? "this project"}. The Materials module never edits these transactions.
              </p>
            </div>
            {likelyMaterialTxs.length === 0 ? (
              <Empty text="No likely material transactions found from the current project history." />
            ) : (
              <div className="divide-y">
                {likelyMaterialTxs.map((tx) => {
                  const text = transactionText(tx, categories);
                  const hints = extractQuantityHints(text);
                  const linked = linkedTransactionIds.has(tx.id);
                  return (
                    <div key={tx.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{text || "Material expense"}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{format(new Date(tx.occurred_at), "dd MMM yyyy")}</p>
                        {hints.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {hints.map((hint) => <span key={hint} className="rounded-full border bg-muted/40 px-2 py-0.5 text-[10px]">Detected: {hint}</span>)}
                          </div>
                        )}
                      </div>
                      {linked ? (
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-600">Linked</span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => {
                          setPurchaseSourceId(tx.id);
                          setPurchaseOpen(true);
                        }}>
                          Use as purchase reference
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </TabsContent>
      </Tabs>

      <PurchaseDialog
        open={purchaseOpen}
        onOpenChange={(next) => {
          setPurchaseOpen(next);
          if (!next) setPurchaseSourceId("");
        }}
        initialSourceTransactionId={purchaseSourceId}
        items={material.items}
        batches={material.batches}
        transactions={projectTxs.filter((tx) => tx.type === "expense")}
        categories={categories}
        createPurchaseBatch={mutations.createPurchaseBatch.mutateAsync}
      />

      <AreaDialog open={areaOpen} onOpenChange={setAreaOpen} createArea={mutations.createArea.mutateAsync} />

      <WorkDialog
        open={workOpen}
        onOpenChange={setWorkOpen}
        areas={material.areas}
        createWorkItem={mutations.createWorkItem.mutateAsync}
      />

      <UsageDialog
        open={usageOpen}
        onOpenChange={setUsageOpen}
        areas={material.areas}
        workItems={material.workItems}
        items={material.items}
        createUsage={mutations.createUsageBatch.mutateAsync}
      />
    </div>
  );
}

function Summary({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<p className="text-[10px] uppercase tracking-wide">{label}</p></div>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="px-6 py-12 text-center text-sm text-muted-foreground">{text}</div>;
}

function aggregateUsage(entries: MaterialUsage[], itemById: Map<string, MaterialItem>) {
  const map = new Map<string, { item: MaterialItem; quantity: number }>();
  for (const entry of entries) {
    const item = itemById.get(entry.material_item_id);
    if (!item) continue;
    const current = map.get(item.id) ?? { item, quantity: 0 };
    current.quantity += Number(entry.quantity);
    map.set(item.id, current);
  }
  return [...map.values()].sort((a, b) => b.quantity - a.quantity);
}

function AreaUsageCard({
  area,
  workItems,
  general,
  totalEntries,
  itemById,
  onDeleteUsage,
}: {
  area: MaterialArea;
  workItems: Array<{ work: MaterialWorkItem; usage: MaterialUsage[] }>;
  general: MaterialUsage[];
  totalEntries: number;
  itemById: Map<string, MaterialItem>;
  onDeleteUsage: (id: string) => Promise<void>;
}) {
  const areaAllUsage = [...general, ...workItems.flatMap((item) => item.usage)];
  const areaTotals = aggregateUsage(areaAllUsage, itemById);

  return (
    <section className="rounded-2xl border bg-card shadow-[var(--shadow-soft)]">
      <div className="border-b p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <MapPinned className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">{area.name}</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{workItems.length} furniture/work item{workItems.length === 1 ? "" : "s"} · {totalEntries} usage entr{totalEntries === 1 ? "y" : "ies"}</p>
          </div>
          {areaTotals.length > 0 && (
            <div className="flex max-w-2xl flex-wrap justify-end gap-1.5">
              {areaTotals.map(({ item, quantity }) => (
                <span key={item.id} className="rounded-full border bg-muted/35 px-2 py-1 text-[10px]">
                  {item.name}: <b>{qty(quantity)} {item.unit}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        {workItems.map(({ work, usage }) => (
          <WorkUsageCard key={work.id} work={work} usage={usage} itemById={itemById} onDeleteUsage={onDeleteUsage} />
        ))}

        {general.length > 0 && (
          <div className="rounded-xl border border-dashed bg-muted/15 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Room general</p>
            <UsageLines entries={general} itemById={itemById} onDeleteUsage={onDeleteUsage} />
          </div>
        )}

        {workItems.length === 0 && general.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No material usage recorded in this area yet.
          </div>
        )}
      </div>
    </section>
  );
}

function WorkUsageCard({
  work,
  usage,
  itemById,
  onDeleteUsage,
}: {
  work: MaterialWorkItem;
  usage: MaterialUsage[];
  itemById: Map<string, MaterialItem>;
  onDeleteUsage: (id: string) => Promise<void>;
}) {
  const totals = aggregateUsage(usage, itemById);
  return (
    <div className="rounded-xl border bg-muted/15 p-3">
      <div className="flex items-start gap-2">
        <ChevronRight className="mt-0.5 h-4 w-4 text-primary" />
        <div className="min-w-0">
          <p className="font-medium">{work.name}</p>
          {work.dimensions && <p className="text-xs text-muted-foreground">{work.dimensions}</p>}
        </div>
      </div>
      {totals.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">No usage recorded yet.</p>
      ) : (
        <div className="mt-3 grid gap-1.5">
          {totals.map(({ item, quantity }) => (
            <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-muted-foreground">{item.name}</span>
              <span className="shrink-0 font-medium tabular-nums">{qty(quantity)} {item.unit}</span>
            </div>
          ))}
        </div>
      )}
      {usage.length > 0 && (
        <details className="mt-3 border-t pt-2">
          <summary className="cursor-pointer text-[11px] font-medium text-primary">View usage entries</summary>
          <UsageLines entries={usage} itemById={itemById} onDeleteUsage={onDeleteUsage} />
        </details>
      )}
    </div>
  );
}

function UsageLines({
  entries,
  itemById,
  onDeleteUsage,
}: {
  entries: MaterialUsage[];
  itemById: Map<string, MaterialItem>;
  onDeleteUsage: (id: string) => Promise<void>;
}) {
  return (
    <div className="mt-2 grid gap-1.5">
      {entries.map((entry) => {
        const item = itemById.get(entry.material_item_id);
        return (
          <div key={entry.id} className="flex items-center gap-2 rounded-lg bg-background/70 px-2 py-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate">{item?.name ?? "Material"}</span>
            <span className="shrink-0 tabular-nums">{qty(Number(entry.quantity))} {item?.unit ?? ""}</span>
            <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => void onDeleteUsage(entry.id)} aria-label="Delete usage">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

type PurchaseLineDraft = {
  id: number;
  material_item_id: string;
  name: string;
  unit: string;
  quantity: string;
};

function blankPurchaseLine(id: number): PurchaseLineDraft {
  return { id, material_item_id: "", name: "", unit: "pcs", quantity: "" };
}

function PurchaseDialog({
  open,
  onOpenChange,
  initialSourceTransactionId,
  items,
  batches,
  transactions,
  categories,
  createPurchaseBatch,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSourceTransactionId?: string;
  items: MaterialItem[];
  batches: MaterialPurchaseBatch[];
  transactions: Transaction[];
  categories: Category[];
  createPurchaseBatch: (payload: {
    category: string;
    purchased_at?: string;
    source_transaction_id?: string | null;
    notes?: string | null;
    lines: MaterialPurchaseLineInput[];
  }) => Promise<unknown>;
}) {
  const [purchaseCategory, setPurchaseCategory] = useState<string>("Other Material");
  const [customCategory, setCustomCategory] = useState("");
  const [date, setDate] = useState(localDateInput());
  const [sourceTransactionId, setSourceTransactionId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PurchaseLineDraft[]>([blankPurchaseLine(1)]);
  const [saving, setSaving] = useState(false);

  const selectedCategory = purchaseCategory === "__custom" ? customCategory.trim() : purchaseCategory;

  const categoryOptions = useMemo(
    () => [...new Set([
      ...PURCHASE_CATEGORIES,
      ...batches.map((batch) => batch.category).filter(Boolean),
      ...items.map((item) => item.category).filter((value): value is string => !!value),
    ])],
    [batches, items],
  );

  const orderedItems = useMemo(() => {
    const current = selectedCategory.toLowerCase();
    return [...items].sort((a, b) => {
      const aMatch = (a.category ?? "").toLowerCase() === current ? 0 : 1;
      const bMatch = (b.category ?? "").toLowerCase() === current ? 0 : 1;
      return aMatch - bMatch || a.name.localeCompare(b.name);
    });
  }, [items, selectedCategory]);

  useEffect(() => {
    if (open) setSourceTransactionId(initialSourceTransactionId ?? "");
  }, [open, initialSourceTransactionId]);

  const reset = () => {
    setPurchaseCategory("Other Material");
    setCustomCategory("");
    setDate(localDateInput());
    setSourceTransactionId("");
    setNotes("");
    setLines([blankPurchaseLine(1)]);
  };

  const updateLine = (id: number, patch: Partial<PurchaseLineDraft>) => {
    setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  };

  const addLine = () => {
    setLines((current) => [
      ...current,
      blankPurchaseLine(Math.max(0, ...current.map((line) => line.id)) + 1),
    ]);
  };

  const save = async () => {
    if (!selectedCategory) return toast.error("Choose or enter a purchase category");

    const startedLines = lines.filter((line) =>
      line.material_item_id || line.name.trim() || line.quantity,
    );
    if (startedLines.length === 0) return toast.error("Add at least one material item");

    const payloadLines: MaterialPurchaseLineInput[] = [];
    for (const line of startedLines) {
      const quantity = Number(line.quantity);
      if (!quantity || quantity <= 0) return toast.error("Every material line needs a valid quantity");

      if (line.material_item_id) {
        const item = items.find((entry) => entry.id === line.material_item_id);
        if (!item) return toast.error("One selected material no longer exists");
        payloadLines.push({
          material_item_id: item.id,
          unit: item.unit,
          quantity,
        });
      } else {
        if (!line.name.trim()) return toast.error("Enter a material name for every new item");
        payloadLines.push({
          name: line.name.trim(),
          unit: line.unit,
          quantity,
        });
      }
    }

    try {
      setSaving(true);
      await createPurchaseBatch({
        category: selectedCategory,
        purchased_at: dateToIso(date),
        source_transaction_id: sourceTransactionId || null,
        notes: notes || null,
        lines: payloadLines,
      });
      toast.success(`Purchase saved · ${payloadLines.length} item${payloadLines.length === 1 ? "" : "s"}`);
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Record material purchase</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <div className="grid gap-2">
              <Label>Purchase category</Label>
              <Select value={purchaseCategory} onValueChange={setPurchaseCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((category) => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                  <SelectItem value="__custom">+ Create new category</SelectItem>
                </SelectContent>
              </Select>
              {purchaseCategory === "__custom" && (
                <Input
                  autoFocus
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="e.g. Paint Material"
                />
              )}
            </div>
            <div className="grid gap-2">
              <Label>Purchase date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/25 p-3">
              <div>
                <p className="text-sm font-semibold">Items in this purchase</p>
                <p className="text-[11px] text-muted-foreground">
                  Add every item from the same receipt here. Pricing is not required.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addLine}>
                <Plus className="h-3.5 w-3.5" /> Add item
              </Button>
            </div>

            <div className="grid gap-2 p-3">
              {lines.map((line, index) => {
                const selectedItem = items.find((item) => item.id === line.material_item_id);
                return (
                  <div key={line.id} className="grid gap-2 rounded-xl border bg-background p-3 md:grid-cols-[1fr_125px_105px_38px] md:items-end">
                    <div className="grid gap-2">
                      <Label className="text-[11px]">Item {index + 1}</Label>
                      <Select
                        value={line.material_item_id || "__new"}
                        onValueChange={(value) => {
                          if (value === "__new") {
                            updateLine(line.id, { material_item_id: "", name: "", unit: "pcs" });
                            return;
                          }
                          const item = items.find((entry) => entry.id === value);
                          updateLine(line.id, {
                            material_item_id: value,
                            name: "",
                            unit: item?.unit ?? "pcs",
                          });
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__new">+ New material</SelectItem>
                          {orderedItems.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name} · {item.unit}{item.category ? ` · ${item.category}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {!line.material_item_id && (
                        <Input
                          value={line.name}
                          onChange={(e) => updateLine(line.id, { name: e.target.value })}
                          placeholder="Material name, e.g. Masking Tape"
                        />
                      )}
                    </div>

                    <div className="grid gap-2">
                      <Label className="text-[11px]">Quantity</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.001"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                        placeholder="Qty"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label className="text-[11px]">Unit</Label>
                      {selectedItem ? (
                        <div className="flex h-9 items-center rounded-md border bg-muted/35 px-3 text-sm">{selectedItem.unit}</div>
                      ) : (
                        <Select value={line.unit} onValueChange={(value) => updateLine(line.id, { unit: value })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{UNITS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                        </Select>
                      )}
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      disabled={lines.length === 1}
                      onClick={() => setLines((current) => current.filter((entry) => entry.id !== line.id))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Finance transaction reference <span className="text-xs text-muted-foreground">(optional · read only)</span></Label>
            <Select value={sourceTransactionId || "__none"} onValueChange={(value) => setSourceTransactionId(value === "__none" ? "" : value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">No transaction linked</SelectItem>
                {transactions.map((tx) => (
                  <SelectItem key={tx.id} value={tx.id}>
                    {format(new Date(tx.occurred_at), "dd MMM")} · {transactionText(tx, categories).slice(0, 70) || "Expense"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Receipt / purchase note <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Shop name, receipt note, etc." />
          </div>

          <div className="rounded-xl bg-muted/35 p-3 text-xs text-muted-foreground">
            One batch groups the receipt, but every item is still stored separately in inventory so Purchased / Used / Remaining stays accurate item-wise.
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : `Save purchase (${Math.max(1, lines.filter((line) => line.material_item_id || line.name.trim() || line.quantity).length)} items)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AreaDialog({
  open,
  onOpenChange,
  createArea,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createArea: (payload: { name: string }) => Promise<MaterialArea>;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return toast.error("Enter an area name");
    try {
      setSaving(true);
      await createArea({ name });
      toast.success("Area added");
      setName("");
      onOpenChange(false);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add room / area</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2"><Label>Area name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Master Bedroom" /></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => void save()} disabled={saving}>Add area</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WorkDialog({
  open,
  onOpenChange,
  areas,
  createWorkItem,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areas: MaterialArea[];
  createWorkItem: (payload: { area_id: string; name: string; dimensions?: string | null; notes?: string | null }) => Promise<MaterialWorkItem>;
}) {
  const [areaId, setAreaId] = useState("");
  const [name, setName] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!areaId || !areas.some((area) => area.id === areaId)) setAreaId(areas[0]?.id ?? "");
  }, [open, areaId, areas]);

  const save = async () => {
    if (!areaId) return toast.error("Select an area");
    if (!name.trim()) return toast.error("Enter a furniture/work item name");
    try {
      setSaving(true);
      await createWorkItem({ area_id: areaId, name, dimensions, notes });
      toast.success("Furniture/work item added");
      setName("");
      setDimensions("");
      setNotes("");
      onOpenChange(false);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add furniture / work item</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2"><Label>Room / area</Label><Select value={areaId} onValueChange={setAreaId}><SelectTrigger><SelectValue placeholder="Select area" /></SelectTrigger><SelectContent>{areas.map((area) => <SelectItem key={area.id} value={area.id}>{area.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid gap-2"><Label>Furniture / work item</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wardrobe or Study Table" /></div>
          <div className="grid gap-2"><Label>Dimensions <span className="text-xs text-muted-foreground">(optional)</span></Label><Input value={dimensions} onChange={(e) => setDimensions(e.target.value)} placeholder="e.g. 8' × 7'" /></div>
          <div className="grid gap-2"><Label>Note</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => void save()} disabled={saving}>Add</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type UsageLine = { id: number; material_item_id: string; quantity: string };

function UsageDialog({
  open,
  onOpenChange,
  areas,
  workItems,
  items,
  createUsage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areas: MaterialArea[];
  workItems: MaterialWorkItem[];
  items: MaterialItem[];
  createUsage: (payload: {
    area_id: string;
    work_item_id?: string | null;
    used_at?: string;
    notes?: string | null;
    lines: Array<{ material_item_id: string; quantity: number }>;
  }) => Promise<void>;
}) {
  const [areaId, setAreaId] = useState("");
  const [workId, setWorkId] = useState("");
  const [date, setDate] = useState(localDateInput());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<UsageLine[]>([{ id: 1, material_item_id: "", quantity: "" }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!areaId || !areas.some((area) => area.id === areaId)) setAreaId(areas[0]?.id ?? "");
  }, [open, areaId, areas]);

  useEffect(() => {
    if (workId && !workItems.some((work) => work.id === workId && work.area_id === areaId)) setWorkId("");
  }, [areaId, workId, workItems]);

  const relevantWork = workItems.filter((work) => work.area_id === areaId);

  const reset = () => {
    setAreaId(areas[0]?.id ?? "");
    setWorkId("");
    setDate(localDateInput());
    setNotes("");
    setLines([{ id: 1, material_item_id: "", quantity: "" }]);
  };

  const save = async () => {
    if (!areaId) return toast.error("Select a room / area");
    const valid = lines
      .map((line) => ({ material_item_id: line.material_item_id, quantity: Number(line.quantity) }))
      .filter((line) => line.material_item_id && line.quantity > 0);
    if (valid.length === 0) return toast.error("Add at least one material and quantity");

    try {
      setSaving(true);
      await createUsage({
        area_id: areaId,
        work_item_id: workId || null,
        used_at: dateToIso(date),
        notes,
        lines: valid,
      });
      toast.success("Material usage recorded");
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Record material usage</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Room / area</Label>
              <Select value={areaId} onValueChange={setAreaId}>
                <SelectTrigger><SelectValue placeholder="Select area" /></SelectTrigger>
                <SelectContent>{areas.map((area) => <SelectItem key={area.id} value={area.id}>{area.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Furniture / work item <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Select value={workId || "__general"} onValueChange={(value) => setWorkId(value === "__general" ? "" : value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__general">Room general</SelectItem>
                  {relevantWork.map((work) => <SelectItem key={work.id} value={work.id}>{work.name}{work.dimensions ? ` · ${work.dimensions}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between"><Label>Materials used</Label><Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setLines((current) => [...current, { id: Math.max(...current.map((line) => line.id), 0) + 1, material_item_id: "", quantity: "" }])}><Plus className="h-3.5 w-3.5" /> Add line</Button></div>
            <div className="grid gap-2">
              {lines.map((line, index) => {
                const selected = items.find((item) => item.id === line.material_item_id);
                return (
                  <div key={line.id} className="grid grid-cols-[1fr_120px_36px] gap-2">
                    <Select value={line.material_item_id} onValueChange={(value) => setLines((current) => current.map((entry) => entry.id === line.id ? { ...entry, material_item_id: value } : entry))}>
                      <SelectTrigger><SelectValue placeholder={`Material ${index + 1}`} /></SelectTrigger>
                      <SelectContent>{items.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · {item.unit}</SelectItem>)}</SelectContent>
                    </Select>
                    <div className="relative">
                      <Input type="number" min="0" step="0.001" value={line.quantity} onChange={(e) => setLines((current) => current.map((entry) => entry.id === line.id ? { ...entry, quantity: e.target.value } : entry))} placeholder="Qty" className="pr-10" />
                      {selected && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{selected.unit}</span>}
                    </div>
                    <Button variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((entry) => entry.id !== line.id))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2"><Label>Usage date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="grid gap-2"><Label>Note</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
          </div>

          <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
            This updates quantity usage only. It does not create or change any finance transaction.
          </div>

          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save usage"}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
