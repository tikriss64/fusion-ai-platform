import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Users, Inbox, FileText, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";

type Hit = { id: string; label: string; sub?: string };

/**
 * Búsqueda global (Ctrl/Cmd + K): encuentra cualquier cliente, lead, presupuesto o
 * factura desde cualquier pantalla y navega a ello. Búsqueda en servidor (Supabase).
 */
export function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [clients, setClients] = useState<Hit[]>([]);
  const [leads, setLeads] = useState<Hit[]>([]);
  const [quotes, setQuotes] = useState<Hit[]>([]);
  const [invoices, setInvoices] = useState<Hit[]>([]);

  // Atajo de teclado Ctrl/Cmd + K.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("global-search:open", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("global-search:open", onOpen);
    };
  }, []);

  // Búsqueda en servidor (con pequeño retardo para no saturar).
  useEffect(() => {
    const safe = q.replace(/[,()%]/g, " ").trim();
    if (safe.length < 2) { setClients([]); setLeads([]); setQuotes([]); setInvoices([]); return; }
    const like = `%${safe}%`;
    const t = setTimeout(async () => {
      const [c, l, qu, inv] = await Promise.all([
        supabase.from("clients").select("id, nombre, email, telefono, poblacion").or(`nombre.ilike.${like},email.ilike.${like},telefono.ilike.${like}`).limit(6),
        supabase.from("leads").select("id, nombre, email, telefono, estado").or(`nombre.ilike.${like},email.ilike.${like},telefono.ilike.${like}`).limit(6),
        supabase.from("quotes").select("id, numero, estado").eq("is_template", false).ilike("numero", like).limit(6),
        supabase.from("invoices").select("id, serie, numero, estado").or(`numero.ilike.${like},serie.ilike.${like}`).limit(6),
      ]);
      setClients(((c.data ?? []) as any[]).map((x) => ({ id: x.id, label: x.nombre, sub: x.poblacion || x.email || x.telefono || "" })));
      setLeads(((l.data ?? []) as any[]).map((x) => ({ id: x.id, label: x.nombre, sub: x.estado })));
      setQuotes(((qu.data ?? []) as any[]).map((x) => ({ id: x.id, label: x.numero ?? "(sin nº)", sub: x.estado })));
      setInvoices(((inv.data ?? []) as any[]).map((x) => ({ id: x.id, label: `${x.serie ?? ""}-${x.numero ?? ""}`, sub: x.estado })));
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const go = (to: string, params?: Record<string, string>) => {
    setOpen(false);
    setQ("");
    navigate({ to: to as any, params: params as any });
  };

  // Para listas sin página de detalle (leads, presupuestos): navega y, una vez
  // montada la página, le pasa un filtro para dejar el registro a la vista.
  const goAndFilter = (to: string, event: string, detail: Record<string, unknown>) => {
    setOpen(false);
    setQ("");
    navigate({ to: to as any });
    setTimeout(() => window.dispatchEvent(new CustomEvent(event, { detail })), 350);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar cliente, lead, presupuesto o factura…" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>{q.trim().length < 2 ? "Escribe al menos 2 letras…" : "Sin resultados."}</CommandEmpty>
        {clients.length > 0 && (
          <CommandGroup heading="Clientes">
            {clients.map((h) => (
              <CommandItem key={`c-${h.id}`} value={`c-${h.id}-${h.label}`} onSelect={() => go("/clientes/$id", { id: h.id })}>
                <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{h.label}</span>
                {h.sub && <span className="text-xs text-muted-foreground">{h.sub}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {leads.length > 0 && (
          <CommandGroup heading="Leads">
            {leads.map((h) => (
              <CommandItem key={`l-${h.id}`} value={`l-${h.id}-${h.label}`} onSelect={() => goAndFilter("/leads", "assistant:filterLeads", { estado: h.sub })}>
                <Inbox className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{h.label}</span>
                {h.sub && <span className="text-xs text-muted-foreground">{h.sub}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {quotes.length > 0 && (
          <CommandGroup heading="Presupuestos">
            {quotes.map((h) => (
              <CommandItem key={`q-${h.id}`} value={`q-${h.id}-${h.label}`} onSelect={() => goAndFilter("/quotes", "assistant:filterQuotes", { search: h.label })}>
                <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{h.label}</span>
                {h.sub && <span className="text-xs text-muted-foreground">{h.sub}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {invoices.length > 0 && (
          <CommandGroup heading="Facturas">
            {invoices.map((h) => (
              <CommandItem key={`i-${h.id}`} value={`i-${h.id}-${h.label}`} onSelect={() => go("/invoices/$id", { id: h.id })}>
                <Receipt className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{h.label}</span>
                {h.sub && <span className="text-xs text-muted-foreground">{h.sub}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
