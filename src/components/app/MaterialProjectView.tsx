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
  type MaterialUsage,
  type MaterialWorkItem,
} from "@/hooks/useMaterials";

const UNITS = ["pcs", "pair", "sheet", "L", "kg", "m", "roll", "box", "set"] as const;
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
    tx.description,
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
  const material = data ?? { items: [], purchases: [], areas: [], workItems: [], usage: [] };
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
    () => new Set(material.purchases.map((purchase) => purchase.source_transaction_id).filter(Boolean)),
    [material.purchases],
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
        <Summary label="Purchase records" value={String(material.purchases.length)} icon={<ShoppingCart className="h-4 w-4" />} />
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
                <h3 className="font-semibold">Recorded material purchases</h3>
                <p className="mt-1 text-xs text-muted-foreground">Quantity ledger only. Linking a finance transaction is optional and never changes that transaction.</p>
              </div>
              <Button size="sm" onClick={() => setPurchaseOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Add</Button>
            </div>
            {material.purchases.length === 0 ? (
              <Empty text="No material purchases recorded yet." />
            ) : (
              <div className="divide-y">
                {material.purchases.map((purchase) => {
                  const item = itemById.get(purchase.material_item_id);
                  const source = allTx.find((tx) => tx.id === purchase.source_transaction_id);
                  return (
                    <div key={purchase.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{item?.name ?? "Unknown material"}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {format(new Date(purchase.purchased_at), "dd MMM yyyy")}
                          {purchase.notes ? ` · ${purchase.notes}` : ""}
                        </p>
                        {source && (
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-primary">
                            <Link2 className="h-3 w-3" /> Linked to finance transaction · {transactionText(source, categories) || "Expense"}
                          </p>
                        )}
                      </div>
                      <p className="font-semibold tabular-nums">{qty(Number(purchase.quantity))} {item?.unit ?? ""}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={async () => {
                          if (!confirm("Delete this purchase quantity record? The finance transaction will not be changed.")) return;
                          await mutations.deletePurchase.mutateAsync(purchase.id);
                          toast.success("Purchase record removed");
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
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
        transactions={likelyMaterialTxs}
        categories={categories}
        createItem={mutations.createItem.mutateAsync}
        createPurchase={mutations.createPurchase.mutateAsync}
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

function PurchaseDialog({
  open,
  onOpenChange,
  initialSourceTransactionId,
  items,
  transactions,
  categories,
  createItem,
  createPurchase,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSourceTransactionId?: string;
  items: MaterialItem[];
  transactions: Transaction[];
  categories: Category[];
  createItem: (payload: { name: string; unit: string; category?: string | null }) => Promise<MaterialItem>;
  createPurchase: (payload: {
    material_item_id: string;
    quantity: number;
    purchased_at?: string;
    source_transaction_id?: string | null;
    notes?: string | null;
  }) => Promise<unknown>;
}) {
  const [itemId, setItemId] = useState("");
  const [newName, setNewName] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState(localDateInput());
  const [sourceTransactionId, setSourceTransactionId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setSourceTransactionId(initialSourceTransactionId ?? "");
  }, [open, initialSourceTransactionId]);

  const reset = () => {
    setItemId("");
    setNewName("");
    setUnit("pcs");
    setQuantity("");
    setDate(localDateInput());
    setSourceTransactionId("");
    setNotes("");
  };

  const save = async () => {
    const amount = Number(quantity);
    if (!amount || amount <= 0) return toast.error("Enter a valid quantity");
    if (!itemId && !newName.trim()) return toast.error("Select or create a material");

    try {
      setSaving(true);
      const item = itemId ? items.find((entry) => entry.id === itemId) : await createItem({ name: newName, unit });
      if (!item) throw new Error("Material not found");
      await createPurchase({
        material_item_id: item.id,
        quantity: amount,
        purchased_at: dateToIso(date),
        source_transaction_id: sourceTransactionId || null,
        notes: notes || null,
      });
      toast.success("Material purchase recorded");
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Record material purchase</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Existing material</Label>
            <Select value={itemId || "__new"} onValueChange={(value) => setItemId(value === "__new" ? "" : value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__new">+ Create new material</SelectItem>
                {items.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · {item.unit}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {!itemId && (
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div className="grid gap-2"><Label>Material name</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Soft-close hinge" /></div>
              <div className="grid gap-2"><Label>Unit</Label><Select value={unit} onValueChange={setUnit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{UNITS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2"><Label>Quantity</Label><Input type="number" min="0" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
            <div className="grid gap-2"><Label>Purchase date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
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

          <div className="grid gap-2"><Label>Note</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save purchase"}</Button>
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
    if (open && !areaId && areas[0]) setAreaId(areas[0].id);
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
    if (open && !areaId && areas[0]) setAreaId(areas[0].id);
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
