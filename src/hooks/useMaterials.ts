import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type MaterialItem = {
  id: string;
  user_id: string;
  name: string;
  unit: string;
  category: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type MaterialPurchase = {
  id: string;
  user_id: string;
  project_id: string;
  material_item_id: string;
  quantity: number;
  purchased_at: string;
  source_transaction_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MaterialArea = {
  id: string;
  user_id: string;
  project_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type MaterialWorkItem = {
  id: string;
  user_id: string;
  project_id: string;
  area_id: string;
  name: string;
  dimensions: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type MaterialUsage = {
  id: string;
  user_id: string;
  project_id: string;
  area_id: string;
  work_item_id: string | null;
  material_item_id: string;
  quantity: number;
  used_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MaterialInventoryData = {
  items: MaterialItem[];
  purchases: MaterialPurchase[];
  areas: MaterialArea[];
  workItems: MaterialWorkItem[];
  usage: MaterialUsage[];
};

const t = (name: string) => supabase.from(name as never);

export function useMaterialInventory(projectId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["materials", user?.id, projectId],
    enabled: !!user && !!projectId,
    queryFn: async (): Promise<MaterialInventoryData> => {
      if (!user || !projectId) return { items: [], purchases: [], areas: [], workItems: [], usage: [] };

      const [itemsRes, purchasesRes, areasRes, workItemsRes, usageRes] = await Promise.all([
        t("material_items")
          .select("*")
          .eq("user_id", user.id)
          .eq("archived", false)
          .order("name"),
        t("project_material_purchases")
          .select("*")
          .eq("user_id", user.id)
          .eq("project_id", projectId)
          .order("purchased_at", { ascending: false }),
        t("project_material_areas")
          .select("*")
          .eq("user_id", user.id)
          .eq("project_id", projectId)
          .order("sort_order")
          .order("name"),
        t("project_material_work_items")
          .select("*")
          .eq("user_id", user.id)
          .eq("project_id", projectId)
          .order("sort_order")
          .order("name"),
        t("project_material_usage")
          .select("*")
          .eq("user_id", user.id)
          .eq("project_id", projectId)
          .order("used_at", { ascending: false }),
      ]);

      for (const result of [itemsRes, purchasesRes, areasRes, workItemsRes, usageRes]) {
        if (result.error) throw result.error;
      }

      return {
        items: (itemsRes.data ?? []) as unknown as MaterialItem[],
        purchases: (purchasesRes.data ?? []) as unknown as MaterialPurchase[],
        areas: (areasRes.data ?? []) as unknown as MaterialArea[],
        workItems: (workItemsRes.data ?? []) as unknown as MaterialWorkItem[],
        usage: (usageRes.data ?? []) as unknown as MaterialUsage[],
      };
    },
  });
}

export function useMaterialMutations(projectId: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["materials"] });
  };

  const createItem = useMutation({
    mutationFn: async (payload: { name: string; unit: string; category?: string | null }): Promise<MaterialItem> => {
      if (!user) throw new Error("Not signed in");
      const name = payload.name.trim();
      if (!name) throw new Error("Enter a material name");

      const { data: existing, error: findError } = await t("material_items")
        .select("*")
        .eq("user_id", user.id)
        .eq("archived", false)
        .ilike("name", name)
        .eq("unit", payload.unit)
        .limit(1);
      if (findError) throw findError;
      if ((existing ?? []).length > 0) return (existing![0] as unknown) as MaterialItem;

      const { data, error } = await t("material_items")
        .insert({
          user_id: user.id,
          name,
          unit: payload.unit,
          category: payload.category ?? null,
          archived: false,
        } as never)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as MaterialItem;
    },
    onSuccess: invalidate,
  });

  const createPurchase = useMutation({
    mutationFn: async (payload: {
      material_item_id: string;
      quantity: number;
      purchased_at?: string;
      source_transaction_id?: string | null;
      notes?: string | null;
    }): Promise<MaterialPurchase> => {
      if (!user || !projectId) throw new Error("Select a project");
      const { data, error } = await t("project_material_purchases")
        .insert({
          user_id: user.id,
          project_id: projectId,
          material_item_id: payload.material_item_id,
          quantity: payload.quantity,
          purchased_at: payload.purchased_at ?? new Date().toISOString(),
          source_transaction_id: payload.source_transaction_id ?? null,
          notes: payload.notes ?? null,
        } as never)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as MaterialPurchase;
    },
    onSuccess: invalidate,
  });

  const createArea = useMutation({
    mutationFn: async (payload: { name: string }): Promise<MaterialArea> => {
      if (!user || !projectId) throw new Error("Select a project");
      const name = payload.name.trim();
      if (!name) throw new Error("Enter an area name");

      const existingQuery = await t("project_material_areas")
        .select("*")
        .eq("user_id", user.id)
        .eq("project_id", projectId)
        .ilike("name", name)
        .limit(1);
      if (existingQuery.error) throw existingQuery.error;
      if ((existingQuery.data ?? []).length > 0) return (existingQuery.data![0] as unknown) as MaterialArea;

      const { data, error } = await t("project_material_areas")
        .insert({ user_id: user.id, project_id: projectId, name } as never)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as MaterialArea;
    },
    onSuccess: invalidate,
  });

  const createWorkItem = useMutation({
    mutationFn: async (payload: {
      area_id: string;
      name: string;
      dimensions?: string | null;
      notes?: string | null;
    }): Promise<MaterialWorkItem> => {
      if (!user || !projectId) throw new Error("Select a project");
      const name = payload.name.trim();
      if (!name) throw new Error("Enter a furniture/work item name");

      const { data, error } = await t("project_material_work_items")
        .insert({
          user_id: user.id,
          project_id: projectId,
          area_id: payload.area_id,
          name,
          dimensions: payload.dimensions?.trim() || null,
          notes: payload.notes?.trim() || null,
        } as never)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as MaterialWorkItem;
    },
    onSuccess: invalidate,
  });

  const createUsageBatch = useMutation({
    mutationFn: async (payload: {
      area_id: string;
      work_item_id?: string | null;
      used_at?: string;
      notes?: string | null;
      lines: Array<{ material_item_id: string; quantity: number }>;
    }): Promise<void> => {
      if (!user || !projectId) throw new Error("Select a project");
      const validLines = payload.lines.filter((line) => line.material_item_id && line.quantity > 0);
      if (validLines.length === 0) throw new Error("Add at least one material usage line");

      const rows = validLines.map((line) => ({
        user_id: user.id,
        project_id: projectId,
        area_id: payload.area_id,
        work_item_id: payload.work_item_id ?? null,
        material_item_id: line.material_item_id,
        quantity: line.quantity,
        used_at: payload.used_at ?? new Date().toISOString(),
        notes: payload.notes?.trim() || null,
      }));

      const { error } = await t("project_material_usage").insert(rows as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deletePurchase = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await t("project_material_purchases").delete().eq("id", id).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteUsage = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await t("project_material_usage").delete().eq("id", id).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    createItem,
    createPurchase,
    createArea,
    createWorkItem,
    createUsageBatch,
    deletePurchase,
    deleteUsage,
  };
}
