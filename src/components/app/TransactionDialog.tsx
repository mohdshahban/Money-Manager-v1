import { useEffect, useRef, useState } from "react";
import { Camera, ImageIcon, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAccounts, useCategories, useProjects, useMutateEntity, useCreateCategory, type Transaction } from "@/hooks/useFinance";
import { useTransactions } from "@/hooks/useFinance";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing?: Transaction | null;
};

export function TransactionDialog({ open, onOpenChange, editing }: Props) {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: projects = [] } = useProjects();
  const { data: allTx = [] } = useTransactions();
  const { create, update } = useMutateEntity<Transaction>("transactions", ["transactions", "accounts"]);
  const createCategory = useCreateCategory();

  const [type, setType] = useState<"income" | "expense" | "transfer">("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [subCategoryId, setSubCategoryId] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [toAccountId, setToAccountId] = useState<string>("");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [tagsInput, setTagsInput] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [newCatName, setNewCatName] = useState("");
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  const [newSubOpen, setNewSubOpen] = useState(false);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setType(editing.type);
      setAmount(String(editing.amount));
      const editCat = categories.find((c) => c.id === editing.category_id);
      if (editCat?.parent_id) {
        setCategoryId(editCat.parent_id);
        setSubCategoryId(editCat.id);
      } else {
        setCategoryId(editing.category_id ?? "");
        setSubCategoryId("");
      }
      setAccountId(editing.account_id ?? "");
      setToAccountId(editing.to_account_id ?? "");
      setVendor(editing.vendor ?? "");
      setNotes(editing.notes ?? "");
      setProjectId(editing.project_id ?? "");
      setTagsInput((editing.tags ?? []).join(", "));
      setOccurredAt(new Date(editing.occurred_at).toISOString().slice(0, 16));
      setReceiptPath(editing.receipt_path ?? null);
    } else if (open) {
      setType("expense");
      setAmount("");
      setCategoryId("");
      setSubCategoryId("");
      setAccountId(accounts[0]?.id ?? "");
      setToAccountId("");
      setVendor("");
      setNotes("");
      setProjectId("");
      setTagsInput("");
      setOccurredAt(new Date().toISOString().slice(0, 16));
      setReceiptPath(null);
    }
  }, [editing, open, accounts, categories]);

  useEffect(() => {
    let active = true;
    if (!receiptPath) {
      setReceiptUrl(null);
      return;
    }
    supabase.storage
      .from("receipts")
      .createSignedUrl(receiptPath, 3600)
      .then(({ data }) => {
        if (active) setReceiptUrl(data?.signedUrl ?? null);
      });
    return () => {
      active = false;
    };
  }, [receiptPath]);

  const uploadReceipt = async (file: File) => {
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("You must be signed in");
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("receipts").upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
      if (error) throw error;
      setReceiptPath(path);
      toast.success("Receipt attached");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const removeReceipt = async () => {
    if (receiptPath) await supabase.storage.from("receipts").remove([receiptPath]);
    setReceiptPath(null);
  };

  const parentCats = categories.filter((c) => (type === "transfer" ? false : c.type === type) && !c.parent_id);
  const subCats = categories.filter((c) => c.parent_id === categoryId);

  const addCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    try {
      const cat = await createCategory.mutateAsync({ name, type: type === "transfer" ? "expense" : type });
      setCategoryId(cat.id);
      setSubCategoryId("");
      setNewCatName("");
      setNewCatOpen(false);
      toast.success("Category added");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const addSubCategory = async () => {
    const name = newSubName.trim();
    if (!name || !categoryId) return;
    try {
      const cat = await createCategory.mutateAsync({ name, type: type === "transfer" ? "expense" : type, parent_id: categoryId });
      setSubCategoryId(cat.id);
      setNewSubName("");
      setNewSubOpen(false);
      toast.success("Subcategory added");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (!accountId) return toast.error("Select an account");
    if (type === "transfer" && !toAccountId) return toast.error("Select destination account");
    const tags = tagsInput
      .split(",")
      .map((s) => s.trim().replace(/^#/, ""))
      .filter(Boolean);
    const payload = {
      type,
      amount: amt,
      category_id: type === "transfer" ? null : (subCategoryId || categoryId || null),
      account_id: accountId,
      to_account_id: type === "transfer" ? toAccountId : null,
      vendor: vendor || null,
      notes: notes || null,
      project_id: projectId || null,
      tags: tags.length ? tags : null,
      occurred_at: new Date(occurredAt).toISOString(),
      receipt_path: receiptPath,
      status: "paid" as const,
    };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, ...payload });
      else await create.mutateAsync(payload);
      toast.success(editing ? "Transaction updated" : "Transaction added");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit transaction" : "New transaction"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-2">
            {(["expense", "income", "transfer"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className="rounded-xl border px-3 py-2 text-sm font-medium capitalize transition-all data-[active=true]:border-primary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                data-active={type === t}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="grid gap-2">
            <Label>Amount</Label>
            <Input type="number" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 text-2xl font-semibold" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {type === "transfer" ? (
              <div className="grid gap-2">
                <Label>To account</Label>
                <Select value={toAccountId} onValueChange={setToAccountId}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{accounts.filter((a) => a.id !== accountId).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label>Category</Label>
                  <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setNewCatOpen((v) => !v)}>
                    {newCatOpen ? "Cancel" : "+ New"}
                  </button>
                </div>
                <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setSubCategoryId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{parentCats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
                {newCatOpen && (
                  <div className="flex gap-2">
                    <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="New category name"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(); } }} />
                    <Button type="button" size="sm" onClick={addCategory} disabled={createCategory.isPending}>Add</Button>
                  </div>
                )}
              </div>
            )}
          </div>
          {type !== "transfer" && categoryId && (
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Subcategory <span className="text-xs text-muted-foreground">(e.g. labour name)</span></Label>
                <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setNewSubOpen((v) => !v)}>
                  {newSubOpen ? "Cancel" : "+ New"}
                </button>
              </div>
              {subCats.length > 0 && (
                <Select value={subCategoryId} onValueChange={setSubCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>{subCats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
              {newSubOpen && (
                <div className="flex gap-2">
                  <Input value={newSubName} onChange={(e) => setNewSubName(e.target.value)} placeholder="e.g. Momin (labour name)"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubCategory(); } }} />
                  <Button type="button" size="sm" onClick={addSubCategory} disabled={createCategory.isPending}>Add</Button>
                </div>
              )}
            </div>
          )}
          <div className="grid gap-2">
            <Label>Project <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <Select value={projectId || "__none"} onValueChange={(v) => setProjectId(v === "__none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Unassigned / General" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Unassigned / General</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Date & time</Label>
              <Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Vendor / Payee</Label>
              <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Note</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note" rows={2} />
          </div>
          <div className="grid gap-2">
            <Label>Receipt <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadReceipt(f); e.target.value = ""; }}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadReceipt(f); e.target.value = ""; }}
            />
            {receiptPath ? (
              <div className="flex items-center gap-3 rounded-xl border p-2">
                {receiptUrl ? (
                  <a href={receiptUrl} target="_blank" rel="noreferrer">
                    <img src={receiptUrl} alt="Attached receipt" className="h-16 w-16 rounded-lg object-cover" />
                  </a>
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>
                )}
                <span className="flex-1 truncate text-sm text-muted-foreground">Receipt attached</span>
                <Button type="button" variant="ghost" size="icon" onClick={removeReceipt} aria-label="Remove receipt">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1 gap-2" disabled={uploading} onClick={() => cameraRef.current?.click()}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  {uploading ? "Uploading…" : "Take photo"}
                </Button>
                <Button type="button" variant="outline" className="flex-1 gap-2" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  <ImageIcon className="h-4 w-4" /> Upload
                </Button>
              </div>
            )}
          </div>
          <div className="grid gap-2">
            <Label>Tags <span className="text-xs text-muted-foreground">(comma-separated, e.g. urgent, reimbursable)</span></Label>
            <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="tag1, tag2" />
            {(() => {
              const selected = new Set(
                tagsInput.split(",").map((s) => s.trim().replace(/^#/, "").toLowerCase()).filter(Boolean),
              );
              const existing = Array.from(
                new Set(allTx.flatMap((t) => t.tags ?? []).filter(Boolean)),
              ).sort();
              const available = existing.filter((tg) => !selected.has(tg.toLowerCase()));
              if (available.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-1.5">
                  {available.map((tg) => (
                    <button
                      key={tg}
                      type="button"
                      onClick={() => {
                        const parts = tagsInput.split(",").map((s) => s.trim()).filter(Boolean);
                        parts.push(tg);
                        setTagsInput(parts.join(", "));
                      }}
                      className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
                    >+ #{tg}</button>
                  ))}
                </div>
              );
            })()}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending || update.isPending}>
              {editing ? "Save" : "Add"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}