import { Link, useRouterState } from "@tanstack/react-router";
import { FolderKanban, Home, ListChecks, PieChart, Plus, Settings, UsersRound, WalletCards } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";

const primaryItems = [
  { to: "/dashboard", label: "Overview", icon: Home },
  { to: "/transactions", label: "Transactions", icon: ListChecks },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/reports", label: "Reports", icon: PieChart },
] as const;

export function DesktopSidebar({ onAdd }: { onAdd: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: profile } = useProfile();
  const displayName = profile?.full_name || profile?.email || "Money Manager";

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border/80 bg-card/95 backdrop-blur-xl lg:flex lg:flex-col">
      <div className="border-b border-border/80 px-5 py-5">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl text-sm font-bold text-white shadow-sm" style={{ background: "var(--gradient-primary)" }}>
            M
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Money Manager</p>
            <p className="truncate text-xs text-muted-foreground">Personal finance workspace</p>
          </div>
        </Link>
      </div>

      <div className="px-4 py-4">
        <button
          type="button"
          onClick={onAdd}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Plus className="h-4 w-4" />
          New transaction
        </button>
      </div>

      <nav className="flex-1 px-3">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Workspace</p>
        <ul className="grid gap-1">
          {primaryItems.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || pathname.startsWith(to + "/");
            return (
              <li key={to}>
                <Link
                  to={to}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Manage</p>
        <ul className="grid gap-1">
          <li>
            <Link
              to="/accounts"
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${pathname.startsWith("/accounts") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              <WalletCards className="h-4 w-4" />
              Accounts
            </Link>
          </li>
          <li>
            <Link
              to="/settings"
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${pathname.startsWith("/settings") || pathname.startsWith("/connect") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </li>
        </ul>
      </nav>

      <div className="border-t border-border/80 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {(profile?.full_name || profile?.email || "M").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{profile?.currency ?? "USD"}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
