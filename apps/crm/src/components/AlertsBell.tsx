import { useEffect, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Check, Loader2, ShieldAlert } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

type Alert = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string | null;
  created_at: string;
};

// La tabla `alerts` (esquema de agentes) aún no está en los tipos generados.
const sb = supabase as unknown as SupabaseClient;

const DOT: Record<string, string> = {
  info: "bg-sky-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

/**
 * Campana de alertas: muestra de un vistazo todo lo que han detectado los agentes
 * (facturas vencidas, leads sin contactar, informe del supervisor…), desde cualquier
 * pantalla. Lee el centro de alertas (RLS lo limita a tu cuenta).
 */
export function AlertsBell() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await sb
      .from("alerts")
      .select("id, severity, title, detail, created_at")
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(40);
    setAlerts((data as Alert[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 120_000); // refresca cada 2 min
    return () => clearInterval(t);
  }, [load]);

  const resolve = async (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    await sb.from("alerts").update({ resolved: true, resolved_at: new Date().toISOString() }).eq("id", id);
  };

  const resolveAll = async () => {
    const ids = alerts.map((a) => a.id);
    if (!ids.length) return;
    setAlerts([]);
    await sb.from("alerts").update({ resolved: true, resolved_at: new Date().toISOString() }).in("id", ids);
  };

  const count = alerts.length;
  const hasCritical = alerts.some((a) => a.severity === "critical");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" title="Alertas">
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span
              className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${hasCritical ? "bg-red-500" : "bg-amber-500"}`}
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <ShieldAlert className="h-4 w-4 text-accent" /> Alertas de tus agentes
          </span>
          {count > 0 ? (
            <button
              onClick={resolveAll}
              className="text-xs font-medium text-primary hover:underline"
            >
              Marcar todas ({count})
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">0 abiertas</span>
          )}
        </div>
        <ScrollArea className="max-h-[60vh]">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : count === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Todo en orden ✨<br />No hay alertas abiertas.</p>
          ) : (
            <ul className="divide-y">
              {alerts.map((a) => (
                <li key={a.id} className="group flex gap-2.5 px-4 py-2.5 hover:bg-muted/40">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[a.severity] ?? "bg-muted-foreground"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">{a.title}</p>
                    {a.detail && <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">{a.detail}</p>}
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{timeAgo(a.created_at)}</p>
                  </div>
                  <button
                    onClick={() => resolve(a.id)}
                    title="Marcar como resuelta"
                    className="h-6 w-6 shrink-0 self-start rounded-md text-muted-foreground opacity-0 transition hover:bg-emerald-100 hover:text-emerald-700 group-hover:opacity-100"
                  >
                    <Check className="mx-auto h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t px-4 py-2 text-center">
          <Link to="/mission-control" className="text-xs font-medium text-primary hover:underline">
            Ver Mission Control →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
