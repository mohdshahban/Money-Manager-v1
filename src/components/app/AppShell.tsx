import { useState, type ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { TransactionDialog } from "./TransactionDialog";

export function AppShell({ children }: { children: ReactNode }) {
  const [addOpen, setAddOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background pb-28 md:pb-32">
      <main className="mx-auto max-w-6xl px-4 pt-6 md:pt-10">{children}</main>
      <BottomNav onAdd={() => setAddOpen(true)} />
      <TransactionDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}