import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type Account = {
  id: string;
  user_id: string;
  name: string;
  type: string;
  icon: string | null;
  color: string | null;
  opening_balance: number;
  credit_limit: number | null;
  currency: string;
  archived: boolean;
};

export type Category = {
  id: string;
  user_id: string;
  name: string;
  type: "income" | "expense";
  icon: string | null;
  color: string | null;
  monthly_budget: number | null;
  parent_id: string | null;
  archived: boolean;
};

export type Transaction = {
  id: string;
  user_id: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  category_id: string | null;
  account_id: string | null;
  to_account_id: string | null;
  occurred_at: string;
  notes: string | null;
  payment_method: string | null;
  tags: string[] | null;
  vendor: string | null;
  status: "paid" | "pending" | "cancelled";
  favorite: boolean;
  deleted_at: string | null;
  project_id: string | null;
  receipt_path: string | null;
};

export type Budget = {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  period: "weekly" | "monthly" | "yearly" | "custom";
  category_id: string | null;
  start_date: string;
  end_date: string | null;
};

export type Project = {
  id: string;
  user_id: string;
  name: string;
  client_name: string | null;
  client_contact: string | null;
  site_address: string | null;
  quoted_amount: number;
  budget: number;
  status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  color: string | null;
  archived: boolean;
};

const t = (name: string) => supabase.from(name as never);

export function useAccounts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["accounts", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await t("accounts").select("*").eq("user_id", user!.id).eq("archived", false).order("created_at");
      if (error) throw error;
      return (data ?? []) as Account[];
    },
  });
}

export function useCategories() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["categories", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await t("categories").select("*").eq("user_id", user!.id).eq("archived", false).order("name");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });
}

export function useTransactions(filters?: { from?: string; to?: string; limit?: number; includeDeleted?: boolean }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["transactions", user?.id, filters],
    enabled: !!user,
    queryFn: async (): Promise<Transaction[]> => {
      let q = t("transactions").select("*").eq("user_id", user!.id).order("occurred_at", { ascending: false });
      if (!filters?.includeDeleted) q = q.is("deleted_at", null);
      if (filters?.from) q = q.gte("occurred_at", filters.from);
      if (filters?.to) q = q.lte("occurred_at", filters.to);
      if (filters?.limit) q = q.limit(filters.limit);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Transaction[];
    },
  });
}

export function useBudgets() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["budgets", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Budget[]> => {
      const { data, error } = await t("budgets").select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Budget[];
    },
  });
}

export function useProjects() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["projects", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await t("projects").select("*").eq("user_id", user!.id).eq("archived", false).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Project[];
    },
  });
}

export function useMutateEntity<T extends { id?: string }>(table: string, keys: string[]) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const invalidate = () => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  return {
    create: useMutation({
      mutationFn: async (payload: Partial<T>) => {
        if (!user) throw new Error("Not signed in");
        const { error } = await t(table).insert({ ...payload, user_id: user.id } as never);
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: async ({ id, ...patch }: { id: string } & Partial<T>) => {
        if (!user) throw new Error("Not signed in");
        const { error } = await t(table).update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", id).eq("user_id", user.id);
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        if (!user) throw new Error("Not signed in");
        const { error } = await t(table).delete().eq("id", id).eq("user_id", user.id);
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
  };
}

export function useCreateCategory() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (payload: { name: string; type: "income" | "expense"; parent_id?: string | null }): Promise<Category> => {
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("categories" as never)
        .insert({ ...payload, user_id: user.id } as never)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as Category;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useSoftDeleteTx() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await t("transactions").update({ deleted_at: new Date().toISOString() } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transactions"] }),
  });
}

export function useRestoreTx() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await t("transactions").update({ deleted_at: null } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transactions"] }),
  });
}