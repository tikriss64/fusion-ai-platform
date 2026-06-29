// Suscripción Realtime del Mission Control. En vez de sondear cada pocos
// segundos, escucha cambios en Postgres e invalida las queries afectadas → el
// panel se actualiza al instante y con menos consultas.
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useMissionControlRealtime(tenantId: string): void {
  const qc = useQueryClient();

  useEffect(() => {
    const filter = `tenant_id=eq.${tenantId}`;
    const channel = supabase
      .channel(`mc-${tenantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts", filter },
        () => qc.invalidateQueries({ queryKey: ["mc-alerts", tenantId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_activity", filter },
        () => qc.invalidateQueries({ queryKey: ["mc-activity", tenantId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "metrics_daily", filter },
        () => qc.invalidateQueries({ queryKey: ["mc-metrics", tenantId] }),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tenantId, qc]);
}
