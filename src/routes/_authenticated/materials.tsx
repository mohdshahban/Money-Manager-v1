import { createFileRoute } from "@tanstack/react-router";
import { PackageOpen } from "lucide-react";
import { MaterialProjectView } from "@/components/app/MaterialProjectView";

export const Route = createFileRoute("/_authenticated/materials")({ component: MaterialsPage });

function MaterialsPage() {
  return (
    <div className="grid gap-5">
      <div>
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <PackageOpen className="h-4 w-4" />
          Site material control
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Materials</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Track what reached each site, where it was consumed, and what quantity should still be left — room by room and furniture by furniture.
        </p>
      </div>
      <MaterialProjectView />
    </div>
  );
}
