import { useState, type ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { DesktopSidebar } from "./DesktopSidebar";
import { TransactionDialog } from "./TransactionDialog";

export function AppShell({ children }: { children: ReactNode }) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <DesktopSidebar onAdd={() => setAddOpen(true)} />
      <div className="min-h-screen pb-24 lg:ml-64 lg:pb-0">
        <main className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 md:py-8 lg:px-8 xl:px-10">{children}</main>
      </div>
      <BottomNav onAdd={() => setAddOpen(true)} />
      <TransactionDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
