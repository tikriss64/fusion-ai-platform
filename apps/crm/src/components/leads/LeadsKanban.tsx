import { useState } from "react";
import { Phone, Mail, GripVertical, MoveRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  type LeadRow, type LeadEstado, LEAD_ESTADO_LABELS, leadScore, leadTemp,
} from "@/lib/leads-schema";
import { SERVICE_TYPE_LABELS } from "@/lib/quotes-schema";

const COLUMNS: LeadEstado[] = ["nuevo", "contactado", "convertido", "descartado"];
const COL_ACCENT: Record<LeadEstado, string> = {
  nuevo: "border-t-blue-400",
  contactado: "border-t-amber-400",
  convertido: "border-t-emerald-400",
  descartado: "border-t-gray-300",
};

/**
 * Tablero kanban de leads: arrastra una tarjeta a otra columna para cambiar su
 * estado. Arrastrar-y-soltar nativo (sin librerías). onMove guarda el cambio.
 */
export function LeadsKanban({
  leads, onMove,
}: {
  leads: LeadRow[];
  onMove: (id: string, estado: LeadEstado) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<LeadEstado | null>(null);

  const byCol = (estado: LeadEstado) =>
    leads.filter((l) => l.estado === estado).sort((a, b) => leadScore(b) - leadScore(a));

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {COLUMNS.map((col) => {
        const items = byCol(col);
        return (
          <div
            key={col}
            onDragOver={(e) => { e.preventDefault(); setOverCol(col); }}
            onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain") || dragId;
              if (id) onMove(id, col);
              setDragId(null); setOverCol(null);
            }}
            className={`rounded-lg border border-t-4 bg-muted/20 p-2 transition-colors ${COL_ACCENT[col]} ${overCol === col ? "bg-accent/20 ring-2 ring-accent/40" : ""}`}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-sm font-semibold">{LEAD_ESTADO_LABELS[col]}</span>
              <Badge variant="secondary" className="text-xs">{items.length}</Badge>
            </div>
            <div className="space-y-2 min-h-[60px]">
              {items.map((lead) => {
                const sc = leadScore(lead);
                const tp = leadTemp(sc);
                return (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", lead.id); setDragId(lead.id); }}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    className={`cursor-grab rounded-md border bg-card p-2.5 shadow-sm active:cursor-grabbing ${dragId === lead.id ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-start gap-1.5">
                      <GripVertical className="mt-0.5 hidden sm:block h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium leading-tight">{lead.nombre}</span>
                          <Badge variant="outline" className={`text-[10px] gap-0.5 ${tp.color}`}>{tp.emoji} {sc}</Badge>
                          {/* Mover de columna sin arrastrar (imprescindible en móvil/táctil) */}
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              onPointerDown={(e) => e.stopPropagation()}
                              className="ml-auto inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                              title="Mover a otra columna"
                            >
                              <MoveRight className="h-3.5 w-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel className="text-xs">Mover a</DropdownMenuLabel>
                              {COLUMNS.filter((c) => c !== lead.estado).map((c) => (
                                <DropdownMenuItem key={c} onClick={() => onMove(lead.id, c)}>
                                  {LEAD_ESTADO_LABELS[c]}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        {lead.servicio && (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {SERVICE_TYPE_LABELS[lead.servicio as keyof typeof SERVICE_TYPE_LABELS] ?? lead.servicio}
                          </div>
                        )}
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          {lead.telefono && <span className="flex items-center gap-0.5"><Phone className="h-3 w-3" />{lead.telefono}</span>}
                          {lead.email && <Mail className="h-3 w-3" />}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && (
                <p className="px-1 py-3 text-center text-xs text-muted-foreground">Arrastra leads aquí</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
