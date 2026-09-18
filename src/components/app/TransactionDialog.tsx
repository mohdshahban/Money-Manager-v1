import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImageIcon, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccounts, useCategories, useProjects, useMutateEntity, useCreateCategory, type Account, type Transaction } from "@/hooks/useFinance";
import { useTransactions } from "@/hooks/useFinance";
import { toast } from "sonner";
import {
  PARTNER_ADVANCE_TAG,
  PARTNER_DRAWING_TAG,
  PARTNER_DRAWINGS_ACCOUNT_TYPE,
  PARTNER_FLOAT_ACCOUNT_TYPE,
  PARTNER_RETURN_TAG,
  PARTNER_SPEND_TAG,
  PARTNER_SYSTEM_TAGS,
  hasPartnerTag,
  isPartnerSystemAccountType,
  withoutPartnerSystemTags,
} from "@/lib/partnerLedger";

type TransactionPurpose = "normal" | "partner_advance" | "partner_drawing" | "partner_return";
type SpentBy = "me" | "partner";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing?: Transaction | null;
};

function toLocalInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function compactDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Now";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const dateLabel = sameDay
    ? "Today"
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
  const timeLabel = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${dateLabel}, ${timeLabel}`;
}

export function TransactionDialog({ open, onOpenChange, editing }: Props) {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: projects = [] } = useProjects();
  const { data: allTx = [] } = useTransactions();
  const { create, update } = useMutateEntity<Transaction>("transactions", ["transactions", "accounts"]);
  const createCategory = useCreateCategory();

  const [type, setType] = useState<"income" | "expense" | "transfer">("expense");
  const [purpose, setPurpose] = useState<TransactionPurpose>("normal");
  const [spentBy, setSpentBy] = useState<SpentBy>("me");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [subCategoryId, setSubCategoryId] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [toAccountId, setToAccountId] = useState<string>("");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [tagsInput, setTagsInput] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => toLocalInputValue(new Date()));
  const [showDateEditor, setShowDateEditor] = useState(false);
  const [dateChanged, setDateChanged] = useState(false);
  const [noteFocused, setNoteFocused] = useState(false);
  const [showMoreTags, setShowMoreTags] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  const [newSubOpen, setNewSubOpen] = useState(false);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const normalAccounts = useMemo(() => accounts.filter((a) => !isPartnerSystemAccountType(a.type)), [accounts]);
  const partnerFloatAccount = accounts.find((a) => a.type === PARTNER_FLOAT_ACCOUNT_TYPE) ?? null;
  const partnerDrawingsAccount = accounts.find((a) => a.type === PARTNER_DRAWINGS_ACCOUNT_TYPE) ?? null;

  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef<HTMLButtonElement>(null);
  const toAccountRef = useRef<HTMLButtonElement>(null);
  const categoryRef = useRef<HTMLButtonElement>(null);
  const subCategoryRef = useRef<HTMLButtonElement>(null);
  const projectRef = useRef<HTMLButtonElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const vendorRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const tagsRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (editing) {
      const isAdvance = hasPartnerTag(editing.tags, PARTNER_ADVANCE_TAG) ||
        (editing.type === "transfer" && !!partnerFloatAccount && editing.to_account_id === partnerFloatAccount.id);
      const isDrawing = hasPartnerTag(editing.tags, PARTNER_DRAWING_TAG) ||
        (editing.type === "transfer" && !!partnerFloatAccount && !!partnerDrawingsAccount && editing.account_id === partnerFloatAccount.id && editing.to_account_id === partnerDrawingsAccount.id);
      const isReturn = hasPartnerTag(editing.tags, PARTNER_RETURN_TAG) ||
        (editing.type === "transfer" && !!partnerFloatAccount && editing.account_id === partnerFloatAccount.id && editing.to_account_id !== partnerDrawingsAccount?.id);
      const inferredPurpose: TransactionPurpose = isAdvance ? "partner_advance" : isDrawing ? "partner_drawing" : isReturn ? "partner_return" : "normal";
      const isPartnerSpend = editing.type === "expense" && (
        hasPartnerTag(editing.tags, PARTNER_SPEND_TAG) ||
        (!!partnerFloatAccount && editing.account_id === partnerFloatAccount.id)
      );

      setPurpose(inferredPurpose);
      setSpentBy(isPartnerSpend ? "partner" : "me");
      setType(inferredPurpose === "normal" ? editing.type : "transfer");
      setAmount(String(editing.amount));
      const editCat = categories.find((c) => c.id === editing.category_id);
      if (editCat?.parent_id) {
        setCategoryId(editCat.parent_id);
        setSubCategoryId(editCat.id);
      } else {
        setCategoryId(editing.category_id ?? "");
        setSubCategoryId("");
      }
      if (isPartnerSpend) setAccountId(normalAccounts[0]?.id ?? "");
      else if (inferredPurpose === "partner_drawing" || inferredPurpose === "partner_return") setAccountId(normalAccounts[0]?.id ?? "");
      else setAccountId(editing.account_id ?? normalAccounts[0]?.id ?? "");
      setToAccountId(inferredPurpose === "partner_return" ? (editing.to_account_id ?? normalAccounts[0]?.id ?? "") : (editing.to_account_id ?? ""));
      setVendor(editing.vendor ?? "");
      setNotes(editing.notes ?? "");
      setProjectId(editing.project_id ?? "");
      setTagsInput(withoutPartnerSystemTags(editing.tags).join(", "));
      setOccurredAt(toLocalInputValue(new Date(editing.occurred_at)));
      setReceiptPath(editing.receipt_path ?? null);
      setDateChanged(true);
      setShowDateEditor(false);
      setNoteFocused(false);
      setShowMoreTags(false);
    } else if (open) {
      setType("expense");
      setPurpose("normal");
      setSpentBy("me");
      setAmount("");
      setCategoryId("");
      setSubCategoryId("");
      setAccountId(normalAccounts[0]?.id ?? "");
      setToAccountId("");
      setVendor("");
      setNotes("");
      setProjectId("");
      setTagsInput("");
      setOccurredAt(toLocalInputValue(new Date()));
      setReceiptPath(null);
      setDateChanged(false);
      setShowDateEditor(false);
      setNoteFocused(false);
      setShowMoreTags(false);
    }
  }, [editing, open, accounts, categories, normalAccounts, partnerFloatAccount, partnerDrawingsAccount]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      amountRef.current?.focus();
      amountRef.current?.select();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [open]);

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

  const recentProjects = useMemo(() => {
    const ids: string[] = [];
    for (const tx of allTx) {
      if (!tx.project_id || ids.includes(tx.project_id) || !projects.some((p) => p.id === tx.project_id)) continue;
      ids.push(tx.project_id);
      if (ids.length === 3) break;
    }
    return ids.map((id) => projects.find((p) => p.id === id)!).filter(Boolean);
  }, [allTx, projects]);

  const recentProjectIds = useMemo(() => new Set(recentProjects.map((p) => p.id)), [recentProjects]);
  const activeProjects = useMemo(
    () => projects.filter((p) => p.status === "active" && !recentProjectIds.has(p.id)),
    [projects, recentProjectIds],
  );
  const otherProjects = useMemo(
    () => projects.filter((p) => p.status !== "active" && !recentProjectIds.has(p.id)),
    [projects, recentProjectIds],
  );

  const suggestedTags = useMemo(() => {
    const selected = new Set(
      tagsInput.split(",").map((s) => s.trim().replace(/^#/, "").toLowerCase()).filter(Boolean),
    );
    const scores = new Map<string, { label: string; score: number; lastIndex: number; contextual: boolean }>();

    allTx.forEach((tx, index) => {
      const txCat = categories.find((c) => c.id === tx.category_id);
      const txRootId = txCat?.parent_id ?? txCat?.id ?? null;
      const projectMatch = !!projectId && tx.project_id === projectId;
      const categoryMatch = !!categoryId && (subCategoryId ? tx.category_id === subCategoryId : txRootId === categoryId);

      for (const rawTag of tx.tags ?? []) {
        const label = rawTag.trim();
        if (!label) continue;
        const key = label.toLowerCase();
        if (PARTNER_SYSTEM_TAGS.has(key)) continue;
        const current = scores.get(key) ?? { label, score: 0, lastIndex: index, contextual: false };
        current.score += 1 + Math.max(0, 3 - index / 20);
        current.lastIndex = Math.min(current.lastIndex, index);
        if (projectMatch) {
          current.score += 20;
          current.contextual = true;
        }
        if (categoryMatch) {
          current.score += 12;
          current.contextual = true;
        }
        scores.set(key, current);
      }
    });

    if (projectId) {
      ["1st Payment", "2nd Payment", "3rd Payment"].forEach((label, index) => {
        const key = label.toLowerCase();
        const current = scores.get(key) ?? { label, score: 0, lastIndex: 9999, contextual: true };
        current.score += 100 - index;
        current.contextual = true;
        scores.set(key, current);
      });
    }

    const genericPersonalTags = new Set(["home", "personal"]);
    return [...scores.entries()]
      .filter(([key, item]) => !selected.has(key) && (!genericPersonalTags.has(key) || item.contextual))
      .sort((a, b) => b[1].score - a[1].score || a[1].lastIndex - b[1].lastIndex || a[1].label.localeCompare(b[1].label))
      .map(([, item]) => item.label);
  }, [allTx, categories, categoryId, subCategoryId, projectId, tagsInput]);

  const visibleSuggestedTags = showMoreTags ? suggestedTags : suggestedTags.slice(0, 5);

  const addSuggestedTag = (tag: string) => {
    const parts = tagsInput.split(",").map((s) => s.trim()).filter(Boolean);
    const existing = new Set(parts.map((part) => part.replace(/^#/, "").toLowerCase()));
    if (!existing.has(tag.toLowerCase())) parts.push(tag);
    setTagsInput(parts.join(", "));
    tagsRef.current?.focus();
  };

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

  const ensurePartnerAccounts = async () => {
    let float = partnerFloatAccount;
    let drawings = partnerDrawingsAccount;
    if (float && drawings) return { float, drawings };

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) throw new Error("You must be signed in");

    const rows: Array<Record<string, unknown>> = [];
    if (!float) {
      rows.push({
        user_id: uid,
        name: "Partner Float",
        type: PARTNER_FLOAT_ACCOUNT_TYPE,
        icon: "wallet-cards",
        color: "#0EA5E9",
        opening_balance: 0,
        currency: normalAccounts[0]?.currency ?? "USD",
        archived: false,
      });
    }
    if (!drawings) {
      rows.push({
        user_id: uid,
        name: "Partner Drawings",
        type: PARTNER_DRAWINGS_ACCOUNT_TYPE,
        icon: "hand-coins",
        color: "#F59E0B",
        opening_balance: 0,
        currency: normalAccounts[0]?.currency ?? "USD",
        archived: false,
      });
    }

    if (rows.length > 0) {
      const { data, error } = await supabase.from("accounts").insert(rows as never).select("*");
      if (error) throw error;
      for (const account of (data ?? []) as unknown as Account[]) {
        if (account.type === PARTNER_FLOAT_ACCOUNT_TYPE) float = account;
        if (account.type === PARTNER_DRAWINGS_ACCOUNT_TYPE) drawings = account;
      }
    }

    if (!float || !drawings) throw new Error("Could not initialize partner tracking");
    return { float, drawings };
  };

  const submit = async () => {
    if (create.isPending || update.isPending) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");

    const userTags = tagsInput
      .split(",")
      .map((s) => s.trim().replace(/^#/, ""))
      .filter(Boolean)
      .filter((tag) => !PARTNER_SYSTEM_TAGS.has(tag.toLowerCase()));

    let payload: Partial<Transaction>;

    try {
      if (purpose !== "normal") {
        if (!projectId) return toast.error("Select a project for partner money tracking");
        const system = await ensurePartnerAccounts();

        if (purpose === "partner_advance") {
          if (!accountId) return toast.error("Select the account you paid from");
          payload = {
            type: "transfer",
            amount: amt,
            category_id: null,
            account_id: accountId,
            to_account_id: system.float.id,
            vendor: vendor || "Execution Partner",
            notes: notes || null,
            project_id: projectId,
            tags: [...userTags, PARTNER_ADVANCE_TAG],
            occurred_at: new Date(occurredAt).toISOString(),
            receipt_path: receiptPath,
            payment_method: editing?.payment_method ?? null,
            status: "paid",
          };
        } else if (purpose === "partner_drawing") {
          payload = {
            type: "transfer",
            amount: amt,
            category_id: null,
            account_id: system.float.id,
            to_account_id: system.drawings.id,
            vendor: vendor || "Execution Partner",
            notes: notes || null,
            project_id: projectId,
            tags: [...userTags, PARTNER_DRAWING_TAG],
            occurred_at: new Date(occurredAt).toISOString(),
            receipt_path: receiptPath,
            payment_method: null,
            status: "paid",
          };
        } else {
          if (!toAccountId) return toast.error("Select the account receiving the returned money");
          payload = {
            type: "transfer",
            amount: amt,
            category_id: null,
            account_id: system.float.id,
            to_account_id: toAccountId,
            vendor: vendor || "Execution Partner",
            notes: notes || null,
            project_id: projectId,
            tags: [...userTags, PARTNER_RETURN_TAG],
            occurred_at: new Date(occurredAt).toISOString(),
            receipt_path: receiptPath,
            payment_method: null,
            status: "paid",
          };
        }
      } else {
        if (type === "expense" && spentBy === "partner") {
          if (!projectId) return toast.error("Select a project when the expense was spent by partner");
          if (!categoryId) return toast.error("Select an expense category");
          const system = await ensurePartnerAccounts();
          payload = {
            type: "expense",
            amount: amt,
            category_id: subCategoryId || categoryId,
            account_id: system.float.id,
            to_account_id: null,
            vendor: vendor || null,
            notes: notes || null,
            project_id: projectId,
            tags: [...userTags, PARTNER_SPEND_TAG],
            occurred_at: new Date(occurredAt).toISOString(),
            receipt_path: receiptPath,
            payment_method: "Partner Float",
            status: "paid",
          };
        } else {
          if (!accountId) return toast.error("Select an account");
          if (type === "transfer" && !toAccountId) return toast.error("Select destination account");
          payload = {
            type,
            amount: amt,
            category_id: type === "transfer" ? null : (subCategoryId || categoryId || null),
            account_id: accountId,
            to_account_id: type === "transfer" ? toAccountId : null,
            vendor: vendor || null,
            notes: notes || null,
            project_id: projectId || null,
            tags: userTags.length ? userTags : null,
            occurred_at: new Date(occurredAt).toISOString(),
            receipt_path: receiptPath,
            payment_method: editing?.payment_method === "Partner Float" ? null : (editing?.payment_method ?? null),
            status: "paid",
          };
        }
      }

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
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        onEscapeKeyDown={() => onOpenChange(false)}
        onKeyDownCapture={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.stopPropagation();
            void submit();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{editing ? "Edit transaction" : "New transaction"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-2">
            {(["expense", "income", "transfer"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setPurpose("normal"); setType(t); }}
                className="rounded-xl border px-3 py-2 text-sm font-medium capitalize transition-all data-[active=true]:border-primary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                data-active={type === t}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="grid gap-2">
            <Label>Purpose</Label>
            <Select
              value={purpose}
              onValueChange={(value) => {
                const next = value as TransactionPurpose;
                setPurpose(next);
                if (next === "normal") {
                  if (purpose !== "normal") {
                    setType("expense");
                    setAccountId(normalAccounts[0]?.id ?? "");
                    setToAccountId("");
                  }
                } else {
                  setType("transfer");
                  setCategoryId("");
                  setSubCategoryId("");
                  if (next === "partner_return") setToAccountId(normalAccounts[0]?.id ?? "");
                }
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal transaction</SelectItem>
                <SelectItem value="partner_advance">Money given to partner</SelectItem>
                <SelectItem value="partner_drawing">Partner drawing / profit advance</SelectItem>
                <SelectItem value="partner_return">Money returned by partner</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {purpose === "normal" && "Use this for normal income, expense or account transfer."}
              {purpose === "partner_advance" && "Money handed to your partner is a transfer, not a project expense."}
              {purpose === "partner_drawing" && "Money the partner keeps for himself reduces final settlement, not project profit."}
              {purpose === "partner_return" && "Unused partner money comes back without changing project profit."}
            </p>
          </div>

          <div className="grid gap-2">
            <Label>Amount</Label>
            <Input
              ref={amountRef}
              type="number"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                  e.preventDefault();
                  accountRef.current?.focus();
                }
              }}
              className="h-12 text-2xl font-semibold"
            />
          </div>

          {purpose === "normal" && type === "expense" && (
            <div className="grid gap-2">
              <Label>Spent by</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSpentBy("me")}
                  className="rounded-xl border px-3 py-2 text-sm font-medium transition-all data-[active=true]:border-primary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                  data-active={spentBy === "me"}
                >
                  Me
                </button>
                <button
                  type="button"
                  onClick={() => setSpentBy("partner")}
                  className="rounded-xl border px-3 py-2 text-sm font-medium transition-all data-[active=true]:border-primary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                  data-active={spentBy === "partner"}
                >
                  Partner
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {spentBy === "me"
                  ? "This expense is paid directly from your selected account."
                  : "This same transaction will count as partner spend and reduce Partner Float automatically."}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>
                {purpose === "partner_advance" ? "From account" : purpose === "partner_return" || purpose === "partner_drawing" || (purpose === "normal" && type === "expense" && spentBy === "partner") ? "Payment source" : "Account"}
              </Label>
              {purpose === "partner_return" || purpose === "partner_drawing" || (purpose === "normal" && type === "expense" && spentBy === "partner") ? (
                <div className="flex h-9 items-center rounded-md border bg-muted/45 px-3 text-sm font-medium">Partner Float</div>
              ) : (
                <Select
                  value={accountId}
                  onValueChange={(value) => {
                    setAccountId(value);
                    window.setTimeout(() => (type === "transfer" ? toAccountRef.current : categoryRef.current)?.focus(), 0);
                  }}
                >
                  <SelectTrigger ref={accountRef}><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{normalAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>

            {purpose === "partner_advance" ? (
              <div className="grid gap-2">
                <Label>Destination</Label>
                <div className="flex h-9 items-center rounded-md border bg-muted/45 px-3 text-sm font-medium">Partner Float</div>
              </div>
            ) : purpose === "partner_drawing" ? (
              <div className="grid gap-2">
                <Label>Destination</Label>
                <div className="flex h-9 items-center rounded-md border bg-muted/45 px-3 text-sm font-medium">Partner Drawings</div>
              </div>
            ) : purpose === "partner_return" ? (
              <div className="grid gap-2">
                <Label>Return to account</Label>
                <Select
                  value={toAccountId}
                  onValueChange={(value) => {
                    setToAccountId(value);
                    window.setTimeout(() => projectRef.current?.focus(), 0);
                  }}
                >
                  <SelectTrigger ref={toAccountRef}><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{normalAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : type === "transfer" ? (
              <div className="grid gap-2">
                <Label>To account</Label>
                <Select
                  value={toAccountId}
                  onValueChange={(value) => {
                    setToAccountId(value);
                    window.setTimeout(() => projectRef.current?.focus(), 0);
                  }}
                >
                  <SelectTrigger ref={toAccountRef}><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{normalAccounts.filter((a) => a.id !== accountId).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
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
                <Select
                  value={categoryId}
                  onValueChange={(value) => {
                    setCategoryId(value);
                    setSubCategoryId("");
                    const hasSubcategories = categories.some((cat) => cat.parent_id === value);
                    window.setTimeout(() => (hasSubcategories ? subCategoryRef.current : projectRef.current)?.focus(), 0);
                  }}
                >
                  <SelectTrigger ref={categoryRef}><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{parentCats.map((cat) => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}</SelectContent>
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

          {purpose === "normal" && type !== "transfer" && categoryId && (
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Subcategory <span className="text-xs text-muted-foreground">(e.g. labour name)</span></Label>
                <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setNewSubOpen((v) => !v)}>
                  {newSubOpen ? "Cancel" : "+ New"}
                </button>
              </div>
              {subCats.length > 0 && (
                <Select
                  value={subCategoryId}
                  onValueChange={(value) => {
                    setSubCategoryId(value);
                    window.setTimeout(() => projectRef.current?.focus(), 0);
                  }}
                >
                  <SelectTrigger ref={subCategoryRef}><SelectValue placeholder="Optional" /></SelectTrigger>
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
            <Select
              value={projectId || "__none"}
              onValueChange={(value) => {
                setProjectId(value === "__none" ? "" : value);
                window.setTimeout(() => vendorRef.current?.focus(), 0);
              }}
            >
              <SelectTrigger ref={projectRef}><SelectValue placeholder="Unassigned / General" /></SelectTrigger>
              <SelectContent>
                {recentProjects.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-xs uppercase tracking-wide text-muted-foreground">Recent projects</SelectLabel>
                    {recentProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectGroup>
                )}
                {activeProjects.length > 0 && (
                  <>
                    {recentProjects.length > 0 && <SelectSeparator />}
                    <SelectGroup>
                      <SelectLabel className="text-xs uppercase tracking-wide text-muted-foreground">Active projects</SelectLabel>
                      {activeProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectGroup>
                  </>
                )}
                {otherProjects.length > 0 && (
                  <>
                    {(recentProjects.length > 0 || activeProjects.length > 0) && <SelectSeparator />}
                    <SelectGroup>
                      <SelectLabel className="text-xs uppercase tracking-wide text-muted-foreground">Other projects</SelectLabel>
                      {otherProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectGroup>
                  </>
                )}
                {projects.length > 0 && <SelectSeparator />}
                <SelectItem value="__none">Unassigned / General</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Date & time</Label>
              {showDateEditor ? (
                <Input
                  ref={dateRef}
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(e) => {
                    setOccurredAt(e.target.value);
                    setDateChanged(true);
                  }}
                  onBlur={() => setShowDateEditor(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                      e.preventDefault();
                      setShowDateEditor(false);
                      vendorRef.current?.focus();
                    }
                  }}
                />
              ) : (
                <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm">
                  <span className="min-w-0 truncate">{!editing && !dateChanged ? "Now · " : ""}{compactDateLabel(occurredAt)}</span>
                  <button
                    type="button"
                    className="shrink-0 text-xs font-medium text-primary hover:underline"
                    onClick={() => {
                      setShowDateEditor(true);
                      window.setTimeout(() => dateRef.current?.focus(), 0);
                    }}
                  >Change</button>
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Vendor / Payee</Label>
              <Input
                ref={vendorRef}
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Optional"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    noteRef.current?.focus();
                  }
                }}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Note</Label>
            <Textarea
              ref={noteRef}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onFocus={() => setNoteFocused(true)}
              onBlur={() => setNoteFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                  e.preventDefault();
                  tagsRef.current?.focus();
                }
              }}
              placeholder="Optional note"
              rows={noteFocused ? 4 : 2}
              className="transition-[min-height] duration-150"
            />
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
            <Label>Tags</Label>
            <Input
              ref={tagsRef}
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Add tags..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                  e.preventDefault();
                  addButtonRef.current?.focus();
                }
              }}
            />
            {suggestedTags.length > 0 && (
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-muted-foreground">Suggested tags</span>
                  {suggestedTags.length > 5 && (
                    <button
                      type="button"
                      className="text-[11px] font-medium text-primary hover:underline"
                      onClick={() => setShowMoreTags((value) => !value)}
                    >{showMoreTags ? "Show less" : `+${suggestedTags.length - 5} More`}</button>
                  )}
                </div>
                <div className={`flex flex-wrap gap-1.5 ${showMoreTags ? "max-h-24 overflow-y-auto pr-1" : ""}`}>
                  {visibleSuggestedTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => addSuggestedTag(tag)}
                      className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
                    >+ #{tag}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button ref={addButtonRef} onClick={submit} disabled={create.isPending || update.isPending}>
              {editing ? "Save" : "Add"}
            </Button>
          </div>
          <p className="-mt-2 text-right text-[10px] text-muted-foreground">Ctrl/Cmd + Enter to save · Esc to close</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
