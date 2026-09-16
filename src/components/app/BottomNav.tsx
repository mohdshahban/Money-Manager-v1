import { Link, useRouterState } from "@tanstack/react-router";
import { Home, ListChecks, PieChart, FolderKanban, Settings, Plus } from "lucide-react";
import { motion } from "framer-motion";

const items = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/transactions", label: "Transactions", icon: ListChecks },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/reports", label: "Reports", icon: PieChart },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function BottomNav({ onAdd }: { onAdd: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <>
      <motion.button
        whileTap={{ scale: 0.92 }}
        whileHover={{ scale: 1.05 }}
        onClick={onAdd}
        aria-label="Add transaction"
        className="fixed bottom-20 right-5 z-50 grid h-14 w-14 place-items-center rounded-full text-white shadow-lg md:bottom-8 md:right-8 md:h-16 md:w-16"
        style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-lg)" }}
      >
        <Plus className="h-7 w-7" strokeWidth={2.5} />
      </motion.button>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/85 backdrop-blur-xl md:mx-auto md:max-w-2xl md:bottom-4 md:rounded-2xl md:border md:shadow-[var(--shadow-soft)]">
        <ul className="mx-auto grid max-w-2xl grid-cols-5">
          {items.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || pathname.startsWith(to + "/");
            return (
              <li key={to} className="relative">
                <Link
                  to={to}
                  className="flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium text-muted-foreground transition-colors data-[active=true]:text-primary"
                  data-active={active}
                >
                  <Icon className="h-5 w-5" />
                  <span>{label}</span>
                  {active && (
                    <motion.span
                      layoutId="nav-dot"
                      className="absolute -top-px h-0.5 w-8 rounded-full bg-primary"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}