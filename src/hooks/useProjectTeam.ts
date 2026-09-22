import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type TeamPaymentBasis = "fixed_contract" | "service_rate";

export type ProjectTeamMember = {
  id: string;
  user_id: string;
  project_id: string;
  name: string;
  trade: string;
  payment_basis: TeamPaymentBasis;
  contract_amount: number;
  phone: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProjectTeamService = {
  id: string;
  user_id: string;
  project_id: string;
  team_member_id: string;
  service_name: string;
  location: string | null;
  quantity: number;
  unit: string;
  rate: number;
  notes: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type TeamServiceInput = {
  service_name: string;
  location?: string | null;
  quantity: number;
  unit: string;
  rate: number;
  notes?: string | null;
};

const t = (name: string) => supabase.from(name as never);

export function useProjectTeamMembers(projectId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["project-team-members", user?.id, projectId],
    enabled: !!user && !!projectId,
    queryFn: async (): Promise<ProjectTeamMember[]> => {
      if (!user || !projectId) return [];
      const { data, error } = await t("project_team_members")
        .select("*")
        .eq("user_id", user.id)
        .eq("project_id", projectId)
        .order("active", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as ProjectTeamMember[];
    },
  });
}

export function useProjectTeamServices(projectId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["project-team-services", user?.id, projectId],
    enabled: !!user && !!projectId,
    queryFn: async (): Promise<ProjectTeamService[]> => {
      if (!user || !projectId) return [];
      const { data, error } = await t("project_team_services")
        .select("*")
        .eq("user_id", user.id)
        .eq("project_id", projectId)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as ProjectTeamService[];
    },
  });
}

export function useProjectTeamMutations(projectId: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["project-team-members"] }),
      qc.invalidateQueries({ queryKey: ["project-team-services"] }),
      qc.invalidateQueries({ queryKey: ["transactions"] }),
    ]);
  };

  const createMember = useMutation({
    mutationFn: async (payload: {
      name: string;
      trade: string;
      payment_basis?: TeamPaymentBasis;
      contract_amount?: number;
      phone?: string | null;
      notes?: string | null;
    }): Promise<ProjectTeamMember> => {
      if (!user || !projectId) throw new Error("Select a project");
      const name = payload.name.trim();
      const trade = payload.trade.trim() || "Labour";
      const paymentBasis = payload.payment_basis ?? "fixed_contract";
      if (!name) throw new Error("Enter a person or team name");

      const { data: existing, error: existingError } = await t("project_team_members")
        .select("*")
        .eq("user_id", user.id)
        .eq("project_id", projectId)
        .ilike("name", name)
        .ilike("trade", trade)
        .limit(1);
      if (existingError) throw existingError;

      const memberPayload = {
        name,
        trade,
        payment_basis: paymentBasis,
        contract_amount: paymentBasis === "fixed_contract" ? Math.max(0, Number(payload.contract_amount ?? 0)) : 0,
        phone: payload.phone?.trim() || null,
        notes: payload.notes?.trim() || null,
        active: true,
        updated_at: new Date().toISOString(),
      };

      if ((existing ?? []).length > 0) {
        const member = existing![0] as unknown as ProjectTeamMember;
        if (member.active) throw new Error("This person/team already exists in the selected project");
        const { data, error } = await t("project_team_members")
          .update(memberPayload as never)
          .eq("id", member.id)
          .select("*")
          .single();
        if (error) throw error;
        return data as unknown as ProjectTeamMember;
      }

      const { data, error } = await t("project_team_members")
        .insert({
          user_id: user.id,
          project_id: projectId,
          ...memberPayload,
        } as never)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as ProjectTeamMember;
    },
    onSuccess: invalidate,
  });

  const updateMember = useMutation({
    mutationFn: async (payload: {
      id: string;
      name: string;
      trade: string;
      payment_basis?: TeamPaymentBasis;
      contract_amount?: number;
      phone?: string | null;
      notes?: string | null;
      active?: boolean;
    }): Promise<ProjectTeamMember> => {
      if (!user || !projectId) throw new Error("Select a project");
      const paymentBasis = payload.payment_basis ?? "fixed_contract";
      const { data, error } = await t("project_team_members")
        .update({
          name: payload.name.trim(),
          trade: payload.trade.trim() || "Labour",
          payment_basis: paymentBasis,
          contract_amount: paymentBasis === "fixed_contract" ? Math.max(0, Number(payload.contract_amount ?? 0)) : 0,
          phone: payload.phone?.trim() || null,
          notes: payload.notes?.trim() || null,
          active: payload.active ?? true,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", payload.id)
        .eq("user_id", user.id)
        .eq("project_id", projectId)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as ProjectTeamMember;
    },
    onSuccess: invalidate,
  });

  const replaceServices = useMutation({
    mutationFn: async (payload: {
      team_member_id: string;
      services: TeamServiceInput[];
    }): Promise<void> => {
      if (!user || !projectId) throw new Error("Select a project");

      const { error: deleteError } = await t("project_team_services")
        .delete()
        .eq("user_id", user.id)
        .eq("project_id", projectId)
        .eq("team_member_id", payload.team_member_id);
      if (deleteError) throw deleteError;

      const valid = payload.services
        .map((service, index) => ({
          user_id: user.id,
          project_id: projectId,
          team_member_id: payload.team_member_id,
          service_name: service.service_name.trim(),
          location: service.location?.trim() || null,
          quantity: Math.max(0, Number(service.quantity || 0)),
          unit: service.unit.trim() || "sqft",
          rate: Math.max(0, Number(service.rate || 0)),
          notes: service.notes?.trim() || null,
          sort_order: index,
          active: true,
        }))
        .filter((service) => service.service_name && service.quantity > 0);

      if (valid.length === 0) return;
      const { error } = await t("project_team_services").insert(valid as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const archiveMember = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!user || !projectId) throw new Error("Select a project");
      const { error } = await t("project_team_members")
        .update({ active: false, updated_at: new Date().toISOString() } as never)
        .eq("id", id)
        .eq("user_id", user.id)
        .eq("project_id", projectId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { createMember, updateMember, replaceServices, archiveMember };
}
