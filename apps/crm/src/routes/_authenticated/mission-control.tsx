import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getTenantId } from "@/lib/tenant";
import { MissionControl } from "@/features/mission-control/MissionControl";

export const Route = createFileRoute("/_authenticated/mission-control")({
  head: () => ({ meta: [{ title: "Mission Control — vaciadodepisos.cat" }] }),
  component: MissionControlPage,
});

function MissionControlPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    getTenantId().then(setTenantId);
  }, []);

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="size-5 animate-spin mr-2" /> Cargando Mission Control…
      </div>
    );
  }
  return <MissionControl tenantId={tenantId} />;
}
