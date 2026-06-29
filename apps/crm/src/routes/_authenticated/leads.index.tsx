import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, UserPlus, Phone, Mail, MapPin, MessageSquare, ExternalLink, MoreHorizontal, Sparkles, Plus, Inbox, Clock, LayoutGrid, List } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClientForm } from "@/components/clients/ClientForm";
import { LeadsKanban } from "@/components/leads/LeadsKanban";
import type { ClientFormValues } from "@/lib/clients-schema";
import {
  type LeadRow,
  type LeadEstado,
  LEAD_ESTADO_LABELS,
  LEAD_ESTADO_COLORS,
  LEAD_PRIORIDAD_LABELS,
  LEAD_PRIORIDAD_COLORS,
  leadScore,
  leadTemp,
} from "@/lib/leads-schema";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/leads/")({
  head: () => ({ meta: [{ title: "Leads — vaciadodepisos.cat" }] }),
  component: LeadsPage,
});

const FILTRO_OPTIONS = [
  { value: "activos",    label: "Activos (nuevos + contactados)" },
  { value: "nuevo",      label: "Nuevos" },
  { value: "contactado", label: "Contactados" },
  { value: "convertido", label: "Convertidos" },
  { value: "descartado", label: "Descartados" },
  { value: "todos",      label: "Todos" },
];

function toClientPayload(v: ClientFormValues, userId: string) {
  const n = (s: string | null | undefined) => (s === "" || s == null ? null : s);
  return {
    user_id:       userId,
    nombre:        v.nombre,
    nif_cif:       n(v.nif_cif),
    email:         n(v.email),
    telefono:      n(v.telefono),
    direccion:     n(v.direccion),
    poblacion:     n(v.poblacion),
    notas:         n(v.notas),
    tags:          v.tags,
    primera_fecha: n(v.primera_fecha),
    ultima_fecha:  n(v.ultima_fecha),
    num_trabajos:  v.num_trabajos,
    valoracion:    v.valoracion ?? null,
    recurrente:    v.recurrente,
    rgpd_consent:  v.rgpd_consent,
  };
}

function leadToClientDefaults(lead: LeadRow): Partial<ClientFormValues> {
  const notasParts = [
    lead.servicio ? `Servicio solicitado: ${lead.servicio}` : null,
    lead.mensaje  ? lead.mensaje : null,
  ].filter(Boolean);
  return {
    nombre:       lead.nombre,
    email:        lead.email     ?? "",
    telefono:     lead.telefono  ?? "",
    direccion:    lead.ubicacion ?? "",
    poblacion:    lead.ciudad    ?? "",
    notas:        notasParts.join("\n\n"),
    tags:         ["Lead web"],
    rgpd_consent: true,
    recurrente:   false,
    num_trabajos: 0,
  };
}

function LeadsPage() {
  const { user } = useAuth();
  const [leads, setLeads]                   = useState<LeadRow[]>([]);
  const [loading, setLoading]               = useState(true);
  const [filtro, setFiltro]                 = useState("activos");
  const [view, setView]                     = useState<"list" | "kanban">("list");
  const [convertingLead, setConvertingLead] = useState<LeadRow | null>(null);
  const [savingId, setSavingId]             = useState<string | null>(null);
  const [newOpen, setNewOpen]               = useState(false);
  const [creating, setCreating]             = useState(false);
  const emptyForm = { nombre: "", telefono: "", email: "", servicio: "", ciudad: "", mensaje: "" };
  const [form, setForm]                     = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    const q = supabase.from("leads").select("*").order("created_at", { ascending: false });
    // En el tablero se muestran todas las columnas → no se aplica el filtro de estado.
    if (view === "list") {
      if (filtro === "activos") q.in("estado", ["nuevo", "contactado"]);
      else if (filtro !== "todos") q.eq("estado", filtro as "nuevo" | "contactado" | "convertido" | "descartado");
    }
    const { data, error } = await q;
    if (error) toast.error("No se pudieron cargar los leads. Revisa tu conexión e inténtalo de nuevo.");
    else setLeads(data as LeadRow[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [filtro, view]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { estado } = (e as CustomEvent).detail as { estado?: string };
      if (estado) setFiltro(estado);
    };
    window.addEventListener("assistant:filterLeads", handler);
    return () => window.removeEventListener("assistant:filterLeads", handler);
  }, []);

  useEffect(() => {
    const handler = async (e: Event) => {
      const { nombre } = (e as CustomEvent).detail as { nombre?: string };
      const DIAC = new RegExp("[\\u0300-\\u036f]", "g");
      const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(DIAC, "").trim();

      // Traer leads activos (no convertidos/descartados), más recientes primero
      const { data } = await supabase
        .from("leads")
        .select("*")
        .in("estado", ["nuevo", "contactado"])
        .order("created_at", { ascending: false });
      const lista = (data ?? []) as LeadRow[];
      if (!lista.length) { toast.error("No hay leads activos para convertir."); return; }

      let lead: LeadRow | undefined;
      if (nombre && nombre.trim()) {
        const qn = norm(nombre);
        lead = lista.find((l) => norm(l.nombre).includes(qn) || qn.includes(norm(l.nombre)));
        if (!lead) { toast.error(`No encontré ningún lead activo llamado "${nombre}".`); return; }
      } else {
        lead = lista[0]; // más reciente
      }
      setConvertingLead(lead);
    };
    window.addEventListener("assistant:convertLead", handler as EventListener);
    return () => window.removeEventListener("assistant:convertLead", handler as EventListener);
  }, []);

  const updateEstado = async (id: string, estado: LeadEstado, extra?: Record<string, unknown>) => {
    setSavingId(id);
    const { error } = await supabase.from("leads").update({ estado, ...extra }).eq("id", id);
    if (error) toast.error("No se pudo actualizar el lead. Inténtalo otra vez.");
    else await load();
    setSavingId(null);
  };

  const handleCrearLead = async () => {
    if (!form.nombre.trim()) { toast.error("El nombre es obligatorio."); return; }
    setCreating(true);
    // tenant_id lo rellena solo el trigger; el Lead Agent lo analiza al insertarse.
    const { error } = await supabase.from("leads").insert({
      nombre:        form.nombre.trim(),
      telefono:      form.telefono.trim() || null,
      email:         form.email.trim() || null,
      servicio:      form.servicio.trim() || null,
      ciudad:        form.ciudad.trim() || null,
      mensaje:       form.mensaje.trim() || null,
      origen_pagina: "manual",
    });
    setCreating(false);
    if (error) { toast.error("No se pudo crear el lead. " + error.message); return; }
    toast.success("Lead creado. El asistente ya lo está analizando.");
    setForm(emptyForm);
    setNewOpen(false);
    await load();
  };

  const handleCrearCliente = async (values: ClientFormValues) => {
    if (!user || !convertingLead) return;
    const { data, error } = await supabase
      .from("clients").insert(toClientPayload(values, user.id)).select("id").single();
    if (error) { toast.error("No se pudo crear el cliente. " + error.message); return; }
    await updateEstado(convertingLead.id, "convertido", { client_id: data.id });
    toast.success(
      <span>Cliente creado.{" "}
        <Link to="/clientes/$id" params={{ id: data.id }} className="underline font-medium">Ver ficha →</Link>
      </span>
    );
    setConvertingLead(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Leads entrantes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Solicitudes recibidas desde vaciadodepisos.cat
          </p>
        </div>
        <div className="flex rounded-md border p-0.5">
          <button onClick={() => setView("list")} title="Lista"
            className={`rounded px-2 py-1 ${view === "list" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}>
            <List className="h-4 w-4" />
          </button>
          <button onClick={() => setView("kanban")} title="Tablero"
            className={`rounded px-2 py-1 ${view === "kanban" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}>
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
        {view === "list" && (
          <Select value={filtro} onValueChange={setFiltro}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTRO_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button onClick={() => setNewOpen(true)} className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" /> Nuevo lead
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : view === "kanban" ? (
        <LeadsKanban leads={leads} onMove={(id, estado) => updateEstado(id, estado)} />
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nada por aquí ahora mismo 🙂"
          message="No hay leads con este filtro. Prueba a poner el filtro de arriba en «Todos», o espera tranquilo: los nuevos llegan solos cuando alguien rellena el formulario de tu web."
          hint="También puedes apuntar uno a mano con el botón «Nuevo lead»."
        />
      ) : (
        <div className="space-y-3">
          {[...leads].sort((a, b) => leadScore(b) - leadScore(a)).map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              saving={savingId === lead.id}
              onConvertir={() => setConvertingLead(lead)}
              onContactado={() => updateEstado(lead.id, "contactado")}
              onDescartar={() => updateEstado(lead.id, "descartado")}
              onReactivar={() => updateEstado(lead.id, "nuevo")}
            />
          ))}
        </div>
      )}

      <Dialog open={!!convertingLead} onOpenChange={(o) => { if (!o) setConvertingLead(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crear cliente desde lead</DialogTitle>
            <DialogDescription>
              Los datos del formulario web ya están pre-rellenados. Completa el resto y guarda.
            </DialogDescription>
          </DialogHeader>
          {convertingLead && (
            <ClientForm
              initial={leadToClientDefaults(convertingLead) as any}
              onSubmit={handleCrearCliente}
              onCancel={() => setConvertingLead(null)}
              submitLabel="Crear cliente"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Nuevo lead a mano (llamada, WhatsApp, recomendación…) */}
      <Dialog open={newOpen} onOpenChange={(o) => { setNewOpen(o); if (!o) setForm(emptyForm); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo lead</DialogTitle>
            <DialogDescription>
              Apunta a alguien que te ha contactado por teléfono, WhatsApp o de palabra.
              Solo el nombre es obligatorio.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); void handleCrearLead(); }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="nl-nombre">Nombre *</Label>
              <Input id="nl-nombre" value={form.nombre} autoFocus
                onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="nl-tel">Teléfono</Label>
                <Input id="nl-tel" value={form.telefono} inputMode="tel"
                  onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nl-email">Email</Label>
                <Input id="nl-email" type="email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="nl-serv">Servicio</Label>
                <Input id="nl-serv" placeholder="vaciado, limpieza…" value={form.servicio}
                  onChange={(e) => setForm({ ...form, servicio: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nl-ciudad">Ciudad</Label>
                <Input id="nl-ciudad" value={form.ciudad}
                  onChange={(e) => setForm({ ...form, ciudad: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nl-msg">¿Qué necesita? (mensaje)</Label>
              <Textarea id="nl-msg" rows={3} value={form.mensaje}
                placeholder="Ej.: vaciado de un piso de 60 m² sin ascensor, urgente…"
                onChange={(e) => setForm({ ...form, mensaje: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setNewOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={creating}>
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Crear lead
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface LeadCardProps {
  lead: LeadRow;
  saving: boolean;
  onConvertir: () => void;
  onContactado: () => void;
  onDescartar: () => void;
  onReactivar: () => void;
}

function LeadCard({ lead, saving, onConvertir, onContactado, onDescartar, onReactivar }: LeadCardProps) {
  const isConverted  = lead.estado === "convertido";
  const isDescartado = lead.estado === "descartado";
  const isActivo     = !isConverted && !isDescartado;

  return (
    <div className="group card-lift rounded-lg border bg-card p-3 sm:p-4 space-y-3 hover:border-primary/30">
      {/* Fila superior: nombre + badges + acciones */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-base leading-tight">{lead.nombre}</span>
            <Badge className={LEAD_ESTADO_COLORS[lead.estado]}>
              {LEAD_ESTADO_LABELS[lead.estado]}
            </Badge>
            {(() => {
              const sc = leadScore(lead);
              const tp = leadTemp(sc);
              return (
                <Badge variant="outline" className={`text-xs gap-1 ${tp.color}`} title="Puntuación de conversión (0-100)">
                  {tp.emoji} {sc} · {tp.label}
                </Badge>
              );
            })()}
            {/* Lead frío: nuevo sin contactar desde hace +3 días → urgente */}
            {lead.estado === "nuevo" && (() => {
              const dias = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000);
              return dias >= 3 ? (
                <Badge variant="outline" className="text-xs gap-1 border-red-300 text-red-600 dark:border-red-700 dark:text-red-400">
                  <Clock className="h-3 w-3" /> Frío · {dias}d sin contactar
                </Badge>
              ) : null;
            })()}
            {/* Prioridad asignada por el Lead Agent (solo si destaca) */}
            {lead.prioridad && lead.prioridad !== "normal" && (
              <Badge
                variant="outline"
                className={`text-xs gap-1 ${LEAD_PRIORIDAD_COLORS[lead.prioridad]}`}
              >
                {lead.prioridad === "critica" ? "🔴" : "🟡"}
                {LEAD_PRIORIDAD_LABELS[lead.prioridad]}
              </Badge>
            )}
            {lead.servicio && (
              <Badge variant="outline" className="text-xs">{lead.servicio}</Badge>
            )}
          </div>
          {/* Resumen del agente (0 tokens) */}
          {lead.ai_resumen && (
            <div className="text-xs text-muted-foreground flex items-start gap-1">
              <Sparkles className="h-3 w-3 mt-0.5 shrink-0 text-accent" />
              <span>{lead.ai_resumen}</span>
            </div>
          )}
          <div className="text-xs text-muted-foreground">{formatDate(lead.created_at)}</div>
        </div>

        {/* Acciones — desktop: botones, móvil: dropdown */}
        <div className="flex-shrink-0 flex items-center gap-1.5">
          {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

          {isConverted && lead.client_id && (
            <Button size="sm" variant="outline" asChild>
              <Link to="/clientes/$id" params={{ id: lead.client_id }}>
                <ExternalLink className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Ver cliente</span>
              </Link>
            </Button>
          )}

          {isActivo && (
            <>
              {/* Botón principal visible siempre */}
              <Button size="sm" onClick={onConvertir} disabled={saving} className="whitespace-nowrap">
                <UserPlus className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Crear cliente</span>
              </Button>

              {/* Acciones secundarias: dropdown en móvil, botones en desktop */}
              <div className="hidden sm:flex items-center gap-1">
                {lead.estado === "nuevo" && (
                  <Button size="sm" variant="outline" onClick={onContactado} disabled={saving}>
                    Contactado
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={onDescartar} disabled={saving}
                  className="text-muted-foreground hover:text-destructive">
                  Descartar
                </Button>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="sm:hidden h-8 w-8" disabled={saving}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {lead.estado === "nuevo" && (
                    <DropdownMenuItem onClick={onContactado}>Marcar contactado</DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={onDescartar} className="text-destructive">
                    Descartar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}

          {isDescartado && (
            <Button size="sm" variant="ghost" onClick={onReactivar} disabled={saving}>
              Reactivar
            </Button>
          )}
        </div>
      </div>

      {/* Datos de contacto */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {lead.telefono && (
          <a href={`tel:${lead.telefono}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <Phone className="h-3.5 w-3.5 flex-shrink-0" />
            {lead.telefono}
          </a>
        )}
        {lead.email && (
          <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground truncate">
            <Mail className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{lead.email}</span>
          </a>
        )}
        {(lead.ubicacion || lead.ciudad) && (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
            {[lead.ubicacion, lead.ciudad].filter(Boolean).join(", ")}
          </span>
        )}
        {lead.mensaje && (
          <span className="flex items-start gap-1.5 text-muted-foreground sm:col-span-2">
            <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span className="line-clamp-2">{lead.mensaje}</span>
          </span>
        )}
      </div>
    </div>
  );
}
