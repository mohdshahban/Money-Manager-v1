import { createFileRoute } from "@tanstack/react-router";
import { UsersRound } from "lucide-react";
import { TeamProjectView } from "@/components/app/TeamProjectView";

export const Route = createFileRoute("/_authenticated/team")({ component: TeamPage });

function TeamPage() {
  return (
    <div className="grid gap-5">
      <div>
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <UsersRound className="h-4 w-4" />
          Project workforce
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Team</h1>
        <p className="mt-1 text-sm text-muted-foreground">Switch projects and see exactly how much was paid to each carpenter, painter, electrician, plumber or labour team.</p>
      </div>
      <TeamProjectView allowProjectSwitch />
    </div>
  );
}
