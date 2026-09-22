import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type ProjectTeamMember = {
  id: string;
  user_id: string;
  project_id: string;
  name: string;
  trade: string;
  contract_amount: number;
  phone: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
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

export function useProjectTeamMutations(projectId: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["project-team-members"] });
    await qc.invalidateQueries({ queryKey: ["transactions"] });
  };

  const createMember = useMutation({
    mutationFn: async (payload: {
      name: string;
      trade: string;
      contract_amount?: number;
      phone?: string | null;
      notes?: string | null;
    }): Promise<ProjectTeamMember> => {
      if (!user || !projectId) throw new Error("Select a project");
      const name = payload.name.trim();
      const trade = payload.trade.trim() || "Labour";
      if (!name) throw new Error("Enter a person or team name");

      const { data: existing, error: existingError } = await t("project_team_members")
        .select("*")
        .eq("user_id", user.id)
        .eq("project_id", projectId)
        .ilike("name", name)
        .ilike("trade", trade)
        .limit(1);
      if (existingError) throw existingError;

      if ((existing ?? []).length > 0) {
        const member = existing![0] as unknown as ProjectTeamMember;
        if (member.active) throw new Error("This person/team already exists in the selected project");
        const { data, error } = await t("project_team_members")
          .update({
            active: true,
            contract_amount: Math.max(0, Number(payload.contract_amount ?? 0)),
            phone: payload.phone?.trim() || null,
            notes: payload.notes?.trim() || null,
            updated_at: new Date().toISOString(),
          } as never)
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
          name,
          trade,
          contract_amount: Math.max(0, Number(payload.contract_amount ?? 0)),
          phone: payload.phone?.trim() || null,
          notes: payload.notes?.trim() || null,
          active: true,
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
      contract_amount?: number;
      phone?: string | null;
      notes?: string | null;
      active?: boolean;
    }): Promise<void> => {
      if (!user || !projectId) throw new Error("Select a project");
      const { error } = await t("project_team_members")
        .update({
          name: payload.name.trim(),
          trade: payload.trade.trim() || "Labour",
          contract_amount: Math.max(0, Number(payload.contract_amount ?? 0)),
          phone: payload.phone?.trim() || null,
          notes: payload.notes?.trim() || null,
          active: payload.active ?? true,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", payload.id)
        .eq("user_id", user.id)
        .eq("project_id", projectId);
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

  return { createMember, updateMember, archiveMember };
}
