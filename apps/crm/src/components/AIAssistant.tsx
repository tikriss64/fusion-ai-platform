import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Mic, MicOff, Send, X, Loader2, Sparkles, Zap, Clock, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
const LS_GROQ   = "groq_api_key";
const LS_GEMINI = "gemini_api_key";
const LS_PREFER = "ai_provider_prefer"; // "gemini" | "groq"

// ── Command Router — base de datos de comandos sin tokens ──────────────────
type ClientData = { nombre?: string; telefono?: string; email?: string; direccion?: string; poblacion?: string; notas?: string };
type QuoteData  = { cliente_nombre?: string; tipo_servicio?: string; descripcion?: string; precio?: number; urgencia?: string; poblacion?: string; metros_cuadrados?: number; fecha?: string };
type QuickResult =
  | { type: "navigate"; section: string }
  | { type: "filterClientes"; search: string; tag?: string }
  | { type: "filterLeads"; estado: string }
  | { type: "filterInvoices"; search: string; estado: string }
  | { type: "filterQuotes"; search: string; estado: string }
  | { type: "createClientData"; data: ClientData }
  | { type: "createQuoteData"; data: QuoteData }
  | { type: "createClientAndQuote"; clientData: ClientData; quoteData: QuoteData }
  | { type: "convertLead"; nombre: string }
  | { type: "quoteFromLastLead" }
  | { type: "updateClient"; campo: string; nombre: string; valor: string }
  | null;

// Normaliza texto para comparar nombres ignorando acentos y mayúsculas
const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");
function normName(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(DIACRITICS_RE, "").trim();
}

// Extrae datos de presupuesto de texto libre — SIN IA, 0 tokens
function parseQuoteData(original: string): QuoteData {
  const data: QuoteData = {};
  const t = original.toLowerCase();

  // Cliente: "para [Nombre Apellido]"
  const cli = original.match(/\bpara\s+(?:el\s+cliente\s+|la\s+clienta?\s+|el\s+|la\s+)?([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+){0,2})/);
  if (cli) data.cliente_nombre = cli[1].trim();

  // Precio: número antes de euros/€
  const pre = original.match(/(\d+(?:[.,]\d+)?)\s*(?:euros?|€|eur)\b/i);
  if (pre) data.precio = parseFloat(pre[1].replace(",", "."));

  // Metros cuadrados: "75m2", "75 m²", "75 metros"
  const m2 = original.match(/(\d+(?:[.,]\d+)?)\s*(?:m[2²]|metros?\s*cuadrados?)\b/i);
  if (m2) data.metros_cuadrados = parseFloat(m2[1].replace(",", "."));

  // Fecha del servicio: "el 15 de junio 2026", "para el 15/06/2026"
  const MESES: Record<string, string> = {
    enero:"01", febrero:"02", marzo:"03", abril:"04", mayo:"05", junio:"06",
    julio:"07", agosto:"08", septiembre:"09", octubre:"10", noviembre:"11", diciembre:"12",
  };
  const fechaTexto = original.match(/\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})\b/i);
  if (fechaTexto) {
    const mes = MESES[fechaTexto[2].toLowerCase()];
    if (mes) data.fecha = `${fechaTexto[3]}-${mes}-${fechaTexto[1].padStart(2, "0")}`;
  } else {
    const fechaNum = original.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
    if (fechaNum) data.fecha = `${fechaNum[3]}-${fechaNum[2].padStart(2,"0")}-${fechaNum[1].padStart(2,"0")}`;
  }

  // Tipo de servicio
  if (/retirada\s+de\s+muebles|retirar\s+muebles|retirada\s+muebles/.test(t)) data.tipo_servicio = "retirada_muebles";
  else if (/vaciado/.test(t))  data.tipo_servicio = "vaciado";
  else if (/limpieza/.test(t)) data.tipo_servicio = "limpieza";
  else if (/mixto/.test(t))    data.tipo_servicio = "mixto";

  // Descripción del concepto: "por [concepto]" hasta coma / "en" / precio
  const desc = original.match(/\bpor\s+(.+?)(?:\s+en\s+[A-ZÁÉÍÓÚ]|\s*,|\s+\d+\s*(?:euros?|€)|$)/i);
  if (desc) data.descripcion = desc[1].trim();

  // Ubicación: "en [Lugar]" — busca ciudad real (no "en sabadell que se hará...")
  const loc = original.match(/\ben\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)?)/);
  if (loc) data.poblacion = loc[1].trim();

  // Urgencia
  if (/\burgente\b|urgencia|prisa|cuanto antes|lo antes posible/.test(t)) data.urgencia = "Urgente";

  return data;
}

// Extrae datos de cliente de texto libre — SIN IA, 0 tokens
function parseClientData(original: string): ClientData {
  const data: ClientData = {};

  // Email
  const email = original.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
  if (email) data.email = email;

  // Teléfono español: 9 dígitos seguidos, o con +34, o con espacios
  const phoneRaw = original.match(/(?:\+?34[\s-]?)?(?:\d[\s-]?){9}/)?.[0];
  const phone = phoneRaw?.replace(/[\s-]/g, "");
  if (phone && phone.replace(/^\+?34/, "").length >= 9) data.telefono = phone;

  // Quitar el disparador inicial + palabras de relleno ("llamado", "se llama", "de nombre")
  let rest = original
    .replace(/^.*?cliente(\s+nuevo)?\s*[:,-]?\s*/i, "")
    .replace(/^\s*(llamad[oa]|que\s+se\s+llama|se\s+llama|de\s+nombre|nombre)\s+/i, "")
    .trim();
  // Quitar email y teléfono del texto para aislar nombre/dirección/ciudad
  if (email) rest = rest.replace(email, "");
  rest = rest.replace(/(?:\+?34[\s-]?)?(?:\d[\s-]?){9}/g, "");

  // Servicio mencionado ("vaciado", "limpieza"…) → a notas (no se pierde el contexto).
  const svc = original.match(/\b(vaciado|limpieza|retirada\s+de\s+muebles|retirada|mudanza|desescombro|desatasco)\b/i);
  if (svc) data.notas = `Servicio solicitado: ${svc[1].toLowerCase()}`;

  // Cortar la cola de intención/servicio para que no contamine nombre/ciudad.
  rest = rest.replace(/\s+\b(para|que\s+(?:necesita|quiere|busca|pide|tiene)|porque|con\s+motivo|interesad[oa])\b.*$/i, "").trim();

  // Población explícita al final: "de/en/vive en [Ciudad]" (ciudad capitalizada).
  const cityM = rest.match(/\s\b(?:de|en|vive\s+en|reside\s+en)\s+([A-ZÁÉÍÓÚÑ][\wáéíóúüñ'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúüñ'-]+)?)\s*$/);
  if (cityM && cityM.index !== undefined) {
    data.poblacion = cityM[1].trim();
    rest = rest.slice(0, cityM.index).trim();
  }

  // Dividir por comas/punto y coma
  let parts = rest.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  // Sin comas: detectar dirección por palabras clave de vía pública
  if (parts.length === 1 && !/,/.test(rest)) {
    const STREET_RE = /\b(calle|c\/|avda?\.?|avenida|plaza|pza\.?|paseo|camino|carrer|carretera|via|travesia|travesía|ronda|gran\s+via|gran\s+vía)\b/i;
    const streetIdx = rest.search(STREET_RE);
    if (streetIdx > 0) {
      const namePart = rest.slice(0, streetIdx).trim();
      const addrCity = rest.slice(streetIdx).trim();
      // Separar ciudad: último token solo-letras de 3+ chars después del número
      const addrTokens = addrCity.split(/\s+/);
      let cityIdx = -1;
      for (let i = addrTokens.length - 1; i >= 0; i--) {
        if (/^[A-Za-záéíóúüñÁÉÍÓÚÜÑ]{3,}$/.test(addrTokens[i])) { cityIdx = i; break; }
      }
      if (namePart) {
        if (cityIdx > 0) {
          parts = [namePart, addrTokens.slice(0, cityIdx).join(" "), addrTokens.slice(cityIdx).join(" ")];
        } else {
          parts = [namePart, addrCity];
        }
      }
    } else {
      // Sin calle conocida: tomar 2-3 primeras palabras como nombre (acepta "m. Rajoy alberto")
      const nameMatch = rest.match(/^((?:[A-Za-záéíóúüñÁÉÍÓÚÜÑ][^\s]*\s+){0,2}[A-Za-záéíóúüñÁÉÍÓÚÜÑ][^\s]*)\s*(.*)/);
      if (nameMatch) {
        parts = [nameMatch[1].trim()];
        if (nameMatch[2]?.trim()) parts.push(nameMatch[2].trim());
      }
    }
  }
  const leftover: string[] = [];
  for (const part of parts) {
    const cleaned = part.replace(/[:,-]+$/, "").trim();
    if (cleaned && cleaned.length >= 2) leftover.push(cleaned);
  }

  // Heurística: 1er trozo de texto = nombre, último = ciudad si hay 2+
  if (leftover.length >= 1) data.nombre = leftover[0];
  if (leftover.length >= 2) {
    const last = leftover[leftover.length - 1];
    // Solo si parece dirección/ciudad (no otro nombre largo con varias palabras de pila)
    if (/\d/.test(last) || last.split(/\s+/).length <= 3) {
      // Si contiene número → dirección; si no → población
      if (/\d/.test(last)) data.direccion = last;
      else if (!data.poblacion) data.poblacion = last;
    }
  }
  if (leftover.length >= 3) {
    // nombre, dirección, ciudad
    data.nombre    = leftover[0];
    data.direccion = leftover[1];
    if (!data.poblacion) data.poblacion = leftover[2];
  }

  // Limpia conectores que cuelgan del nombre ("Julián Domínguez de" → "Julián Domínguez").
  if (data.nombre) data.nombre = data.nombre.replace(/\s+(?:de|del|en|la|las|los|y|para|el)$/i, "").trim();

  return data;
}

// ── Sistema de aprendizaje local (localStorage, 0 tokens, 0 red) ─────────────

const LS_HISTORY  = "crm_cmd_history_v1";
const LS_ENTITIES = "crm_entities_v1";
const LS_MACROS   = "crm_macros_v1";

type CmdEntry    = { text: string; norm: string; action: string; count: number; lastAt: number };
type EntityEntry = { type: "client" | "lead" | "quote"; id: string; nombre: string; extra?: string; lastAt: number };
export type MacroEntry  = { id: string; label: string; msg: string; count: number };

// Guarda un comando exitoso en el historial.
function logCmd(text: string, action: string) {
  try {
    const list: CmdEntry[] = JSON.parse(localStorage.getItem(LS_HISTORY) ?? "[]");
    const norm = text.toLowerCase().replace(/\s+/g, " ").trim();
    const idx  = list.findIndex(e => e.norm === norm);
    if (idx >= 0) { list[idx].count++; list[idx].lastAt = Date.now(); }
    else           { list.unshift({ text, norm, action, count: 1, lastAt: Date.now() }); }
    localStorage.setItem(LS_HISTORY, JSON.stringify(list.slice(0, 80)));
  } catch {}
}

// Top N comandos por frecuencia.
function getFreqCmd(n = 8): CmdEntry[] {
  try {
    return ([...JSON.parse(localStorage.getItem(LS_HISTORY) ?? "[]")] as CmdEntry[])
      .sort((a, b) => b.count - a.count).slice(0, n);
  } catch { return []; }
}

// Comandos del historial que contienen el texto parcial escrito.
function getSuggCmd(partial: string, n = 6): CmdEntry[] {
  if (partial.length < 2) return [];
  try {
    const norm = partial.toLowerCase();
    return (JSON.parse(localStorage.getItem(LS_HISTORY) ?? "[]") as CmdEntry[])
      .filter(e => e.norm.includes(norm) && e.norm !== norm).slice(0, n);
  } catch { return []; }
}

// Guarda nombres de entidades para autocompletar sin consultar la BD.
function cacheEntities(items: EntityEntry[]) {
  try {
    const existing: EntityEntry[] = JSON.parse(localStorage.getItem(LS_ENTITIES) ?? "[]");
    const now = Date.now();
    for (const item of items) {
      const idx = existing.findIndex(e => e.id === item.id);
      if (idx >= 0) existing[idx].lastAt = now;
      else existing.unshift({ ...item, lastAt: now });
    }
    localStorage.setItem(LS_ENTITIES, JSON.stringify(existing.slice(0, 200)));
  } catch {}
}

// Entidades cacheadas que coinciden con el texto parcial.
function getEntitySugg(partial: string, type?: EntityEntry["type"], n = 4): EntityEntry[] {
  if (partial.length < 2) return [];
  try {
    const nn = normName(partial);
    return (JSON.parse(localStorage.getItem(LS_ENTITIES) ?? "[]") as EntityEntry[])
      .filter(e => (!type || e.type === type) && normName(e.nombre).includes(nn))
      .slice(0, n);
  } catch { return []; }
}

// Macros guardados por el usuario (atajos personalizados).
function getMacros(): MacroEntry[] {
  try { return JSON.parse(localStorage.getItem(LS_MACROS) ?? "[]"); } catch { return []; }
}
function saveMacro(label: string, msg: string) {
  const list = getMacros().filter(m => m.msg !== msg);
  list.unshift({ id: Date.now().toString(), label, msg, count: 0 });
  try { localStorage.setItem(LS_MACROS, JSON.stringify(list.slice(0, 20))); } catch {}
}
function deleteMacro(id: string) {
  try { localStorage.setItem(LS_MACROS, JSON.stringify(getMacros().filter(m => m.id !== id))); } catch {}
}

// Sugerencias contextuales por sección del CRM.
const PAGE_HINTS: Record<string, Array<{ label: string; msg: string }>> = {
  "/leads":        [
    { label: "Leads sin atender", msg: "Leads nuevos sin atender" },
    { label: "Contactados",       msg: "Leads contactados" },
    { label: "Convertir último",  msg: "Convertir el último lead a cliente" },
  ],
  "/quotes":       [
    { label: "Sin respuesta",     msg: "Presupuestos sin respuesta" },
    { label: "Aceptados",         msg: "Presupuestos aceptados" },
    { label: "Nuevo presupuesto", msg: "Nuevo presupuesto" },
  ],
  "/invoices":     [
    { label: "Vencidas",          msg: "Facturas vencidas" },
    { label: "Por cobrar",        msg: "Facturas pendientes de cobro" },
    { label: "Últimas facturas",  msg: "Todas las facturas" },
  ],
  "/clientes":     [
    { label: "Nuevo cliente",     msg: "Nuevo cliente" },
    { label: "Recurrentes",       msg: "Clientes recurrentes" },
  ],
  "/agenda":       [
    { label: "Esta semana",       msg: "Agenda esta semana" },
    { label: "Hoy",               msg: "Trabajos de hoy" },
    { label: "Nuevo trabajo",     msg: "Nuevo trabajo en agenda" },
  ],
  "/riesgos":      [
    { label: "Resumen riesgos",   msg: "Dame un resumen de riesgos y oportunidades" },
  ],
  "/dashboard":    [
    { label: "Estado del negocio", msg: "Dame un resumen del estado actual del negocio" },
    { label: "Ingresos del mes",   msg: "Ingresos de este mes" },
  ],
  "/mission-control": [
    { label: "Resumen IA",        msg: "Dame un resumen del estado actual del negocio" },
  ],
};

// Frases de tiempo que NO son nombres de cliente
// Frases que NO son nombres de cliente ni filtros de texto
const TIME_PHRASES  = /más reciente|último|última|de hoy|de esta semana|reciente|nuevo|nueva|antiguo/i;
const DATA_PHRASES  = /llama(do|se)?|se llama|nombre|teléfono|tel[eé]f|email|mail|dirección|calle|ciudad|poblacion/i;

// Trigger de acción de navegación (todas las formas del español)
const NAV_RE = /\b(abre?|ve a?l?|ir a?l?|enseña(me)?|naveg|abrir|muestra(me)?|dame|dime|ver|mira|revisa|lista|entra|abre|accede?|consulta?|comprueba?)\b/i;

function tryQuickCommand(text: string): QuickResult {
  const t = text.toLowerCase().trim();

  // ══ SECCIÓN -4: Actualizar dato de cliente ═══════════════════════════════
  // "actualiza/cambia/modifica el teléfono de Juan Pérez a 611223344"
  const upd = text.match(/(?:actualiza|cambia|modifica|edita|pon|corrige)\s+(?:el\s+|la\s+)?(tel[eé]fono|m[oó]vil|email|correo|e-?mail|direcci[oó]n|ciudad|poblaci[oó]n)\s+(?:de\s+|del?\s+cliente\s+)?(.+?)\s+(?:a|por|como)\s+(.+?)[.\s]*$/i);
  if (upd) {
    const campoRaw = upd[1].toLowerCase();
    const campo =
      /tel|m[oó]vil/.test(campoRaw) ? "telefono" :
      /email|correo|mail/.test(campoRaw) ? "email" :
      /direcci/.test(campoRaw) ? "direccion" :
      "poblacion";
    return { type: "updateClient", campo, nombre: upd[2].trim(), valor: upd[3].trim() };
  }

  // ══ SECCIÓN -3: Presupuesto para el último lead ══════════════════════════
  if (/presupuesto|devis|cotizaci[oó]n|oferta/i.test(t)
    && /(últim[oa]|ultim[oa]|reciente|nuev[oa])\s+(lead|solicitud|contacto|entrante)/i.test(t)) {
    return { type: "quoteFromLastLead" };
  }

  // ══ SECCIÓN -2: Convertir lead en cliente ════════════════════════════════
  if (/\b(convierte|convertir|transforma|transformar|pasa|pasar)\b.*\blead\b/i.test(t)
    || /\blead\b.*\b(a|en)\s+cliente\b/i.test(t)) {
    // ¿Por nombre o "el más reciente"?
    if (/más\s+reciente|ultimo|último|el\s+nuevo|recién/i.test(t)) {
      return { type: "convertLead", nombre: "" };  // "" = más reciente
    }
    const nom = t.match(/lead\s+(?:de\s+|del?\s+)?([a-záéíóúñ][\wáéíóúñ\s]{1,30}?)(?:\s+(?:a|en)\s+cliente|$)/i)?.[1];
    return { type: "convertLead", nombre: (nom ?? "").trim() };
  }

  // ══ SECCIÓN -1: Crear / abrir PRESUPUESTO con datos ════════════════════════
  // Acepta tanto "crea un presupuesto para X" como la forma directa "presupuesto para X".
  // Sin verbo explícito también vale: el usuario quiere abrir el formulario con esos datos.
  const hasPara = /\bpara\b/i.test(t);
  const hasPresupuesto = /\b(presupuesto|devis|cotizaci[oó]n|oferta)\b/i.test(t);
  const hasCreateVerb = /\b(crea|crear|genera|generar|haz|hacer|nuevo|nueva|elabora|prepara|hazme|hacedme)\b/i.test(t);
  // Excluir: "presupuesto para el último lead" (lo maneja sección -3) y encadenados con cliente nuevo
  const isClienteNuevo = /\b(nuevo|nueva)\b.*\bcliente\b|\bcliente\b.*\b(nuevo|nueva)\b/i.test(t);
  if (hasPresupuesto && hasPara && !isClienteNuevo) {
    const data = parseQuoteData(text);
    if (data.cliente_nombre || data.precio || data.tipo_servicio || data.metros_cuadrados) {
      return { type: "createQuoteData", data };
    }
  }
  // Con verbo explícito aunque no haya "para"
  if (hasPresupuesto && hasCreateVerb && !isClienteNuevo) {
    const data = parseQuoteData(text);
    if (data.cliente_nombre || data.precio || data.tipo_servicio) {
      return { type: "createQuoteData", data };
    }
  }

  // ══ SECCIÓN 0: Buscar cliente por nombre (PRIORIDAD — antes de navegación) ═
  // "abre el cliente García", "busca al cliente Chris", "cliente Marta López"
  // EXCLUYE frases de respuesta conversacional: "el cliente ya existe", "el cliente es X", etc.
  const CONV_WORDS = /^(ya\s|es\s|no\s|sí\s|si\s|también|tambi|tiene\s|existe|está\s|con\s|fue\s|del?\s|un\s|una\s)/i;
  const clienteNombrePre =
    t.match(/(?:abre?|busca|muestra|muéstrame|encuentra|enseña|localiza|ve\s+al?)\s+(?:al?\s+|el\s+|la\s+)?cliente\s+(.+)$/i)?.[1]
    ?? t.match(/^(?:el\s+|la\s+)?cliente\s+(.{2,})$/i)?.[1];
  if (clienteNombrePre && !TIME_PHRASES.test(clienteNombrePre)
      && !CONV_WORDS.test(clienteNombrePre)
      && !/^(nuevo|nueva)\b/.test(clienteNombrePre)
      && clienteNombrePre.split(/\s+/).length <= 4) {
    return { type: "filterClientes", search: clienteNombrePre.trim() };
  }

  // ══ SECCIÓN 1: Palabras solas o muy cortas (≤5 palabras) ══════════════════
  const words = t.split(/\s+/);
  if (words.length <= 5) {
    // Normaliza quitando trigger inicial + artículos para casar "muéstrame el dashboard"
    const core = t
      .replace(/^(abre?|ábre?me|ve\s+a?l?|ir\s+a?l?|enséña?me|enseña|naveg\w*|abrir|muéstra?me|muestra|dame|dime|ver|mira|revisa|entra\s+(?:a|en)?|accede\s+a?|consulta|comprueba)\s+/i, "")
      .replace(/^(el|la|los|las)\s+/i, "")
      .trim();

    if (/^dashboard$|^inicio$|^resumen$/.test(core))           return { type: "navigate", section: "dashboard" };
    if (/^leads?$|^solicitudes?$/.test(core))                  return { type: "navigate", section: "leads" };
    if (/^clientes?$/.test(core))                              return { type: "navigate", section: "clientes" };
    if (/^presupuestos?$|^ofertas?$/.test(core))               return { type: "navigate", section: "presupuestos" };
    if (/^facturas?$/.test(core))                              return { type: "navigate", section: "facturas" };
    if (/^agenda$|^calendario$|^trabajos?$/.test(core))        return { type: "navigate", section: "agenda" };
    if (/^ajustes?$|^configuraci[oó]n$|^settings?$/.test(core)) return { type: "navigate", section: "ajustes" };
  }
  if (words.length <= 4) {
    if (/^(el\s+)?dashboard$|^inicio$|^resumen$/.test(t))           return { type: "navigate", section: "dashboard" };
    if (/^(los\s+)?leads?$|^solicitudes?$/.test(t))                  return { type: "navigate", section: "leads" };
    if (/^(los\s+)?clientes?$/.test(t))                              return { type: "navigate", section: "clientes" };
    if (/^(los\s+)?presupuestos?$|^ofertas?$/.test(t))               return { type: "navigate", section: "presupuestos" };
    if (/^(las\s+)?facturas?$/.test(t))                              return { type: "navigate", section: "facturas" };
    if (/^(la\s+)?agenda$|^calendario$|^trabajos?$/.test(t))         return { type: "navigate", section: "agenda" };
    if (/^ajustes?$|^configuraci[oó]n$|^settings?$/.test(t))        return { type: "navigate", section: "ajustes" };
    // estados rápidos
    if (/^leads?\s+nuevos?$/.test(t))                                return { type: "filterLeads", estado: "nuevo" };
    if (/^leads?\s+contactados?$/.test(t))                           return { type: "filterLeads", estado: "contactado" };
    if (/^leads?\s+convertidos?$/.test(t))                           return { type: "filterLeads", estado: "convertido" };
    if (/^leads?\s+descartados?$/.test(t))                           return { type: "filterLeads", estado: "descartado" };
    if (/^leads?\s+activos?$|^leads?\s+pendientes?$/.test(t))        return { type: "filterLeads", estado: "activos" };
    if (/^facturas?\s+vencidas?$|^facturas?\s+atrasadas?$/.test(t))  return { type: "filterInvoices", search: "", estado: "vencida" };
    if (/^facturas?\s+pagadas?$|^facturas?\s+cobradas?$/.test(t))    return { type: "filterInvoices", search: "", estado: "pagada" };
    if (/^facturas?\s+pendientes?$/.test(t))                         return { type: "filterInvoices", search: "", estado: "pendiente" };
    if (/^facturas?\s+parciales?$/.test(t))                          return { type: "filterInvoices", search: "", estado: "parcial" };
    if (/^presupuestos?\s+(pendientes?|en espera|sin respuesta)$/.test(t)) return { type: "filterQuotes", search: "", estado: "enviado" };
    if (/^presupuestos?\s+enviados?$/.test(t))                       return { type: "filterQuotes", search: "", estado: "enviado" };
    if (/^presupuestos?\s+aceptados?$/.test(t))                      return { type: "filterQuotes", search: "", estado: "aceptado" };
    if (/^presupuestos?\s+rechazados?$/.test(t))                     return { type: "filterQuotes", search: "", estado: "rechazado" };
    if (/^presupuestos?\s+facturados?$/.test(t))                     return { type: "filterQuotes", search: "", estado: "facturado" };
    if (/^presupuestos?\s+(borrador|borradores?)$/.test(t))          return { type: "filterQuotes", search: "", estado: "borrador" };
  }

  // ══ SECCIÓN 2: Navegación con trigger ════════════════════════════════════
  const hasNav = NAV_RE.test(t);
  // No tiene modificadores que lo conviertan en búsqueda o creación compleja
  const noComplex = !/\b(de\s+\w+|para\s+\w+|del?\s+cliente|del?\s+mes|de\s+este|de\s+abril|de\s+mayo|de\s+junio)\b/.test(t);

  if (hasNav && noComplex) {
    if (/dashboard|inicio|resumen general/.test(t))                  return { type: "navigate", section: "dashboard" };
    if (/\bleads?\b|solicitudes?/.test(t) && !/estado|filtro/.test(t)) return { type: "navigate", section: "leads" };
    if (/\bagenda\b|calendar|próximos?\s+trabajos?|semana/.test(t))  return { type: "navigate", section: "agenda" };
    if (/ajustes?|configuraci[oó]n|settings?/.test(t))               return { type: "navigate", section: "ajustes" };
    if (/presupuestos?|ofertas?/.test(t) && !/pendiente|enviado|acept|rechaz|factur|borrador|sin resp/.test(t))
      return { type: "navigate", section: "presupuestos" };
    if (/facturas?/.test(t) && !/pendiente|vencid|pagad|parcial|sin pagar|cobrad|atrasad/.test(t))
      return { type: "navigate", section: "facturas" };
    if (/\bclientes?\b/.test(t) && !/etiqueta|tag|de \w+|nuevo|crear/.test(t))
      return { type: "navigate", section: "clientes" };
  }

  // ══ SECCIÓN 3: Clientes con etiqueta ════════════════════════════════════
  const tagMatch = t.match(/clientes?\s+(?:con\s+)?(?:etiqueta|tag)\s+(\w+)/i)
    ?? t.match(/(?:etiqueta|tag)\s+(\w+)\s+(?:en\s+)?clientes?/i)
    ?? t.match(/clientes?\s+(vip|urgente|dif[ií]cil|recurrente|empresa|particular)/i);
  if (tagMatch) {
    return { type: "filterClientes", search: "", tag: tagMatch[1].toUpperCase() };
  }

  // ══ SECCIÓN 4: Clientes por ciudad ══════════════════════════════════════
  const ciudadMatch = t.match(/clientes?\s+(?:de|en)\s+([a-záéíóúüñ][a-záéíóúüñ\s]{2,25})$/i);
  if (ciudadMatch) {
    return { type: "filterClientes", search: ciudadMatch[1].trim() };
  }

  // ══ SECCIÓN 5: Buscar cliente por nombre ════════════════════════════════
  const clienteNombre =
    t.match(/(?:abre?|busca|muestra|encuentra|enseña|localiza)\s+(?:al?\s+|el\s+|la\s+)?cliente\s+(.+)$/i)?.[1]
    ?? t.match(/^(?:el\s+|la\s+)?cliente\s+(.{2,})$/i)?.[1];
  if (clienteNombre && !TIME_PHRASES.test(clienteNombre) && clienteNombre.split(/\s+/).length <= 4) {
    return { type: "filterClientes", search: clienteNombre.trim() };
  }

  // ══ SECCIÓN 6: Leads por estado (formas extendidas) ══════════════════════
  if (/leads?\s+(?:sin\s+convertir|activos?|pendientes?|por\s+gestionar)/i.test(t)
    || /(?:activos?|sin\s+convertir)\s+leads?/i.test(t)
    || /solicitudes?\s+(?:sin\s+gestionar|pendientes?|activas?)/i.test(t)) {
    return { type: "filterLeads", estado: "activos" };
  }
  if (/todos?\s+(?:los\s+)?leads?|leads?\s+todos?/i.test(t))        return { type: "filterLeads", estado: "todos" };

  const leadsEstado =
    t.match(/leads?\s+(nuevos?|contactados?|convertidos?|descartados?)/i)
    ?? t.match(/(nuevos?|contactados?|convertidos?|descartados?)\s+leads?/i)
    ?? t.match(/solicitudes?\s+(nuevas?|contactadas?|convertidas?|descartadas?)/i);
  if (leadsEstado) {
    const raw    = leadsEstado[1].toLowerCase();
    const estado = raw.replace(/s$/, "").replace(/a$/, "o").replace(/e$/, "o");
    const valid: Record<string, string> = { nuevo: "nuevo", contactado: "contactado", convertido: "convertido", descartado: "descartado" };
    return { type: "filterLeads", estado: valid[estado] ?? "activos" };
  }
  if (hasNav && /leads?|solicitudes?/.test(t))                       return { type: "navigate", section: "leads" };

  // ══ SECCIÓN 7: Presupuestos por estado (formas extendidas) ══════════════
  const qPendRe   = /presupuestos?.*(?:pendientes?|en\s+espera|sin\s+respuesta|sin\s+contestar|esperando)/i;
  const qEnvRe    = /presupuestos?.*(?:enviados?|mandados?)/i;
  const qAceptRe  = /presupuestos?.*(?:aceptados?|confirmados?|aprobados?|ganados?)/i;
  const qRechRe   = /presupuestos?.*(?:rechazados?|denegados?|perdidos?|no\s+aceptados?)/i;
  const qFactRe   = /presupuestos?.*(?:facturados?|convertidos?\s+a\s+factura)/i;
  const qBorrRe   = /presupuestos?.*(?:borrador|borradores?|sin\s+enviar)/i;
  if (qPendRe.test(t) || /(?:pendientes?|sin\s+respuesta).*presupuestos?/i.test(t))   return { type: "filterQuotes", search: "", estado: "enviado" };
  if (qEnvRe.test(t))    return { type: "filterQuotes", search: "", estado: "enviado" };
  if (qAceptRe.test(t))  return { type: "filterQuotes", search: "", estado: "aceptado" };
  if (qRechRe.test(t))   return { type: "filterQuotes", search: "", estado: "rechazado" };
  if (qFactRe.test(t))   return { type: "filterQuotes", search: "", estado: "facturado" };
  if (qBorrRe.test(t))   return { type: "filterQuotes", search: "", estado: "borrador" };
  if (/todos?\s+(?:los\s+)?presupuestos?|presupuestos?\s+todos?/i.test(t)) return { type: "navigate", section: "presupuestos" };

  // ══ SECCIÓN 8: Facturas por estado (formas extendidas) ═══════════════════
  if (/facturas?\s+(?:sin\s+pagar|impagadas?|sin\s+cobrar|no\s+cobradas?)/i.test(t)
    || /(?:sin\s+pagar|impagadas?)\s+facturas?/i.test(t))            return { type: "filterInvoices", search: "", estado: "pendiente" };
  if (/facturas?\s+(?:vencidas?|atrasadas?|caducadas?|con\s+retraso)/i.test(t)
    || /(?:vencidas?|atrasadas?)\s+facturas?/i.test(t))              return { type: "filterInvoices", search: "", estado: "vencida" };
  if (/facturas?\s+(?:pagadas?|cobradas?|liquidadas?)/i.test(t)
    || /(?:pagadas?|cobradas?)\s+facturas?/i.test(t))                return { type: "filterInvoices", search: "", estado: "pagada" };
  if (/facturas?\s+(?:parciales?|parcialmente\s+pagadas?)/i.test(t)) return { type: "filterInvoices", search: "", estado: "parcial" };
  if (/facturas?\s+pendientes?/i.test(t))                            return { type: "filterInvoices", search: "", estado: "pendiente" };
  if (/todas?\s+(?:las\s+)?facturas?|facturas?\s+todas?/i.test(t))   return { type: "navigate", section: "facturas" };

  // ══ SECCIÓN 9: Crear cliente ─ con o sin datos (0 tokens) ════════════════
  const isCreateClient = /\b(crea|crear|nuevo|nueva|añade?|añadir|agrega?|agregar|alta\s+de?|registra|registrar|da\s+de\s+alta|dar\s+de\s+alta|nuevo\s+cliente)\b.*\bcliente\b/i.test(t)
    || /\bcliente\s+nuevo\b/i.test(t)
    || /\b(da|dar)\s+de\s+alta\b/i.test(t);
  if (isCreateClient) {
    // Comando encadenado: "nuevo cliente X [y preparar] presupuesto Y" → manejar localmente sin IA.
    const tambiénPresupuesto = /\b(presupuesto|devis|oferta|cotizaci[oó]n)\b/i.test(t)
      && /\b(prepara|preparar|crea|crear|haz|hacer|genera|generar|elabora|elaborar)\b/i.test(t);
    if (tambiénPresupuesto) {
      // Separar la parte del cliente de la del presupuesto por el conector "y [verbo] presupuesto"
      const split = text.match(/^(.*?)\s+y\s+(?:preparar|crear|hacer|elaborar|generar)?\s*(?:un\s+)?(?:el\s+)?presupuesto\b(.*)$/i);
      const clientText = split ? split[1] : text;
      const quoteText  = split ? split[2] : "";
      const clientData = parseClientData(clientText);
      const quoteData  = parseQuoteData(quoteText || text);
      return { type: "createClientAndQuote", clientData, quoteData };
    }
    const data = parseClientData(text);  // usa texto original (conserva mayúsculas)
    // Validar que el nombre no sea basura de una petición encadenada o multi-paso
    const nombreInvalido = data.nombre && /\b(y\s+luego|luego|después|despues|y\s+despu|presupuesto|factura|devis|y\s+un|y\s+crea|también|tambien)\b/i.test(data.nombre);
    if (nombreInvalido) {
      // Petición encadenada/ambigua → abrir formulario vacío, no crear con datos corruptos
      return { type: "filterClientes", search: "__new__" };
    }
    // Si extrajo nombre + (teléfono o email), pre-rellena
    if (data.nombre && (data.telefono || data.email)) {
      return { type: "createClientData", data };
    }
    // Si solo dio el nombre (y parece un nombre real), lo pre-rellenamos
    if (data.nombre && data.nombre.length >= 2 && data.nombre.split(/\s+/).length <= 4 && !DATA_PHRASES.test(data.nombre)) {
      return { type: "createClientData", data };
    }
    // Sin datos útiles → formulario vacío
    return { type: "filterClientes", search: "__new__" };
  }

  const newQuoteNoData = /\b(nuevo|nueva|crear?|añade?|hacer|elaborar)\b.*\bpresupuesto\b/i.test(t)
    && !/\bcliente\b|\bpara\b.*\b\w{3}/.test(t);
  if (newQuoteNoData)                                                 return { type: "filterQuotes", search: "__new__", estado: "" };

  const newInvoiceNoData = /\b(nueva|crear?|añade?|hacer)\b.*\bfactura\b/i.test(t)
    && !/\bcliente\b|\bpara\b.*\b\w{3}/.test(t);
  if (newInvoiceNoData)                                               return { type: "navigate", section: "facturas" };

  // ══ SECCIÓN 10: Estadísticas / dashboard ═════════════════════════════════
  if (/estadístic|cómo\s+va|resumen\s+del?\s+negocio|datos\s+del?\s+negocio|informe\s+general|vista\s+general/i.test(t))
    return { type: "navigate", section: "dashboard" };

  // ══ SECCIÓN 11: Agenda / trabajos ════════════════════════════════════════
  if (/próximos?\s+trabajos?|trabajos?\s+programados?|ver\s+(?:la\s+)?semana|agenda\s+(?:de\s+)?hoy/i.test(t))
    return { type: "navigate", section: "agenda" };

  // ══ SECCIÓN 12: Nuevo trabajo en agenda (0 tokens) ═══════════════════════
  // "nuevo trabajo / crear trabajo vaciado para García el 20 de junio en Sabadell"
  const isNewWork = /\b(nuevo|nueva|crea|crear|añade?|añadir|programa|programar|agenda|agendar)\b.*\btrabajo\b/i.test(t)
    || /\btrabajo\s+(nuevo|en\s+agenda)\b/i.test(t);
  if (isNewWork) {
    const qd = parseQuoteData(text); // reutiliza el mismo parser para fecha/tipo/ubicación
    const clientMatch = text.match(/\bpara\s+(?:el\s+cliente\s+|la\s+clienta?\s+)?([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)?)/i);
    return {
      type: "createQuoteData",
      data: {
        cliente_nombre: clientMatch?.[1]?.trim(),
        tipo_servicio:  qd.tipo_servicio,
        poblacion:      qd.poblacion,
        fecha:          qd.fecha,
      },
    };
  }

  // ══ SECCIÓN 13: Riesgos / oportunidades ═════════════════════════════════
  if (/\briesgos?\b|\breclamaci[oó]n\b|\bradar\b/i.test(t)) return { type: "navigate", section: "riesgos" };
  if (/esperando|compromisos?|promesas?/i.test(t))           return { type: "navigate", section: "esperando" };
  if (/mission[\s-]control|operaciones?\s+ia/i.test(t))     return { type: "navigate", section: "mission-control" };

  return null;
}

const SYSTEM_PROMPT = `Eres el asistente del CRM de VaciadoDePisos.cat (ZAFIRO LANCER S.L., vaciado de pisos en Barcelona). Responde en español, conciso. Usa SIEMPRE las funciones disponibles — nunca respondas solo con texto cuando hay una herramienta aplicable.

REGLA CRÍTICA: NO hagas preguntas de sí/no al usuario. El usuario no puede responder "sí" ni "no" de forma útil. Si necesitas actuar, ACTÚA directamente con los datos disponibles. Si algo falla, da instrucciones concretas de qué escribir.

Reglas de creación:
- "presupuesto para X" → llama crear_presupuesto_real con cliente_nombre="X". Si no lo encuentra, responde: Escribe "nuevo cliente X y presupuesto [tipo]" para crearlos juntos.
- "nuevo cliente X y presupuesto Y" → llama crear_cliente_real primero, toma el client_id del JSON, luego crear_presupuesto_real con ese id. Sin pedir confirmación.
- Para crear solo un cliente: usa crear_cliente_real si tienes datos. Usa create_client_form solo si el usuario quiere rellenar el formulario él mismo.
- "Presupuestos pendientes" = estado "enviado". "Leads sin convertir" = activos (nuevo+contactado).
- "Cliente más reciente" = search_clients con query vacío.
- Meses en español → YYYY-MM (año 2026). El campo notas acepta texto libre con dirección, fecha y detalles del trabajo.`;

const TOOL_DECLARATIONS = [
  {
    name: "navigate",
    description: "Ir a una sección del CRM",
    parameters: { type: "object", properties: { section: { type: "string", enum: ["dashboard","leads","clientes","presupuestos","facturas","agenda","ajustes","riesgos","esperando","bandeja","enviados","documentos","mission-control"] } }, required: ["section"] },
  },
  {
    name: "get_stats",
    description: "Estadísticas del negocio: clientes, leads nuevos, facturado, pendiente cobro",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_monthly_summary",
    description: "Resumen financiero de un mes (YYYY-MM). Sin mes usa el actual.",
    parameters: { type: "object", properties: { mes: { type: "string" } } },
  },
  {
    name: "search_clients",
    description: "Buscar clientes por nombre, teléfono, email o etiqueta (tag)",
    parameters: { type: "object", properties: { query: { type: "string" }, tag: { type: "string", description: "Filtrar por etiqueta exacta ej: VIP" } }, required: ["query"] },
  },
  {
    name: "get_client_detail",
    description: "Info completa de un cliente y navega a su ficha",
    parameters: { type: "object", properties: { nombre: { type: "string" } }, required: ["nombre"] },
  },
  {
    name: "create_client_form",
    description: "Abrir formulario nuevo cliente pre-rellenado. Pide nombre mínimo antes de llamar. tags es array de strings ej: ['VIP','Urgente']",
    parameters: { type: "object", properties: { nombre: { type: "string" }, telefono: { type: "string" }, email: { type: "string" }, direccion: { type: "string" }, poblacion: { type: "string" }, notas: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["nombre"] },
  },
  {
    name: "search_invoices",
    description: "Buscar facturas por cliente, estado (pendiente/pagada/parcial/vencida) o mes. Navega y filtra.",
    parameters: { type: "object", properties: { cliente: { type: "string" }, estado: { type: "string" }, mes: { type: "string" }, numero: { type: "string" } } },
  },
  {
    name: "search_quotes",
    description: "Buscar presupuestos por cliente, estado (borrador/enviado/aceptado/rechazado/facturado) o mes. Navega y filtra.",
    parameters: { type: "object", properties: { cliente: { type: "string" }, estado: { type: "string" }, mes: { type: "string" } } },
  },
  {
    name: "create_quote_form",
    description: "Abrir formulario nuevo presupuesto, opcionalmente con cliente",
    parameters: { type: "object", properties: { cliente_nombre: { type: "string" } } },
  },
  {
    name: "get_leads",
    description: "Ver leads por estado: nuevo, contactado, convertido, descartado, todos",
    parameters: { type: "object", properties: { estado: { type: "string" } } },
  },
  {
    name: "update_lead_status",
    description: "Cambiar estado de un lead buscando por nombre",
    parameters: { type: "object", properties: { nombre: { type: "string" }, estado: { type: "string", enum: ["nuevo","contactado","convertido","descartado"] } }, required: ["nombre","estado"] },
  },
  {
    name: "get_agenda",
    description: "Ver próximos trabajos. days = días hacia adelante (def. 7)",
    parameters: { type: "object", properties: { days: { type: "number" } } },
  },
  {
    name: "crear_lead",
    description: "Crea un nuevo lead/solicitud de cliente potencial en el CRM",
    parameters: { type: "object", properties: { nombre: { type: "string" }, email: { type: "string" }, telefono: { type: "string" }, servicio: { type: "string" }, ubicacion: { type: "string" }, ciudad: { type: "string" }, mensaje: { type: "string" } }, required: ["nombre"] },
  },
  {
    name: "registrar_pago",
    description: "Registra un pago en una factura y actualiza su estado. Busca la factura por número o cliente si no tienes el ID.",
    parameters: { type: "object", properties: { numero_factura: { type: "string" }, cliente_nombre: { type: "string" }, importe: { type: "number" }, fecha: { type: "string" }, notas: { type: "string" } }, required: ["importe"] },
  },
  {
    name: "actualizar_estado_factura",
    description: "Cambia el estado de una factura: pendiente, pagada, parcial, vencida",
    parameters: { type: "object", properties: { numero_factura: { type: "string" }, cliente_nombre: { type: "string" }, estado: { type: "string" } }, required: ["estado"] },
  },
  {
    name: "actualizar_estado_presupuesto",
    description: "Cambia el estado de un presupuesto: borrador, enviado, aceptado, rechazado, facturado",
    parameters: { type: "object", properties: { numero: { type: "string" }, cliente_nombre: { type: "string" }, estado: { type: "string" } }, required: ["estado"] },
  },
  {
    name: "crear_trabajo",
    description: "Crea un nuevo trabajo en la agenda",
    parameters: { type: "object", properties: { cliente_nombre: { type: "string" }, fecha: { type: "string" }, hora: { type: "string" }, tipo_servicio: { type: "string", enum: ["vaciado","limpieza","retirada_muebles","mixto"] }, direccion: { type: "string" }, notas: { type: "string" } }, required: ["fecha"] },
  },
  {
    name: "actualizar_estado_trabajo",
    description: "Cambia el estado de un trabajo: pendiente, confirmado, en_curso, completado, cancelado",
    parameters: { type: "object", properties: { fecha: { type: "string" }, direccion: { type: "string" }, estado: { type: "string" } }, required: ["estado"] },
  },
  {
    name: "crear_cliente_real",
    description: "Crea un cliente directamente en el CRM (sin abrir formulario). Úsalo cuando tengas los datos y en peticiones encadenadas. Devuelve JSON con client_id para usar en crear_presupuesto_real.",
    parameters: { type: "object", properties: { nombre: { type: "string" }, email: { type: "string" }, telefono: { type: "string" }, direccion: { type: "string" }, poblacion: { type: "string", description: "Ciudad" }, notas: { type: "string" } }, required: ["nombre"] },
  },
  {
    name: "crear_presupuesto_real",
    description: "Crea un presupuesto directamente en el CRM. Requiere client_id (obtenido de crear_cliente_real o buscando el cliente). Úsalo siempre tras crear_cliente_real en peticiones encadenadas.",
    parameters: { type: "object", properties: { client_id: { type: "string", description: "ID del cliente (campo client_id del JSON de crear_cliente_real)" }, cliente_nombre: { type: "string", description: "Nombre si no tienes client_id" }, tipo_servicio: { type: "string", description: "vaciado|limpieza|retirada_muebles|mixto" }, metros_cuadrados: { type: "number" }, fecha: { type: "string", description: "YYYY-MM-DD, por defecto hoy" }, notas: { type: "string", description: "Dirección del trabajo, fecha del servicio, detalles" } }, required: [] },
  },
];

const QUICK_ACTIONS = [
  { label: "Resumen del negocio",    msg: "Dame un resumen del estado actual del negocio" },
  { label: "Leads nuevos",           msg: "Leads nuevos sin atender" },
  { label: "Facturas pendientes",    msg: "Facturas pendientes de cobro" },
  { label: "Agenda esta semana",     msg: "Trabajos programados esta semana" },
  { label: "Presupuestos enviados",  msg: "Presupuestos enviados esperando respuesta" },
  { label: "Clientes recurrentes",   msg: "Clientes recurrentes" },
];

type ChatMessage = { role: "user" | "assistant"; text: string };
type OAIMessage  = { role: string; content: string | null; tool_calls?: any[]; tool_call_id?: string; name?: string };

const GROQ_TOOLS = TOOL_DECLARATIONS.map((t) => ({ type: "function" as const, function: t }));

// Selector inteligente: solo manda las herramientas relevantes según el texto
function selectTools(text: string, history: OAIMessage[]): typeof GROQ_TOOLS {
  const ctx = [text, ...history.slice(-3).map((m) => m.content ?? "")].join(" ").toLowerCase();
  const has = (...w: string[]) => w.some((x) => ctx.includes(x));

  const names = new Set<string>(["navigate"]);

  if (has("cliente", "contacto", "nombre", "persona"))
    ["search_clients", "get_client_detail", "create_client_form", "crear_cliente_real"].forEach((n) => names.add(n));
  if (has("factura", "cobro", "pago", "pagada", "vencida", "pendiente de cobro"))
    ["search_invoices"].forEach((n) => names.add(n));
  if (has("presupuesto", "oferta", "cotiz", "devis"))
    ["search_quotes", "create_quote_form", "crear_presupuesto_real"].forEach((n) => names.add(n));
  if (has("lead", "solicitud", "web"))
    ["get_leads", "update_lead_status"].forEach((n) => names.add(n));
  if (has("agenda", "trabajo", "programad", "semana"))
    ["get_agenda"].forEach((n) => names.add(n));
  if (has("estadíst", "total factur", "pendiente", "resumen", "negocio", "cuánto", "cuanto", "mes"))
    ["get_stats", "get_monthly_summary"].forEach((n) => names.add(n));

  // Si solo queda navigate (no detectó contexto), manda todo
  if (names.size <= 1) return GROQ_TOOLS;

  return GROQ_TOOLS.filter((t) => names.has(t.function.name));
}

export function AIAssistant() {
  const navigate  = useNavigate();
  const pathname  = useRouterState({ select: r => r.location.pathname });

  const [open, setOpen]               = useState(false);
  const [messages, setMessages]       = useState<ChatMessage[]>([]);
  const [input, setInput]             = useState("");
  const [isThinking, setIsThinking]   = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [suggestions, setSuggestions] = useState<CmdEntry[]>([]);
  const [showMacros, setShowMacros]   = useState(false);
  const [macros, setMacros]           = useState<MacroEntry[]>([]);
  const [activeProvider, setActiveProvider] = useState<"gemini" | "groq">(
    () => { try { return localStorage.getItem(LS_GEMINI) ? "gemini" : "groq"; } catch { return "groq"; } }
  );
  const [apiStatus, setApiStatus] = useState<{ gemini: boolean | null; groq: boolean | null }>({ gemini: null, groq: null });

  // Acciones dinámicas: contexto de página + frecuentes del historial + estáticas
  const dynamicActions = useMemo(() => {
    const pageHints = PAGE_HINTS[pathname] ?? PAGE_HINTS["/dashboard"] ?? [];
    const frequent  = getFreqCmd(4).map(e => ({ label: e.text.slice(0, 28), msg: e.text }));
    // Mezcla: 2 hints de página + 2 frecuentes + 2 estáticas (sin repetir)
    const seen = new Set<string>();
    const merge = (arr: Array<{ label: string; msg: string }>) =>
      arr.filter(a => { if (seen.has(a.msg)) return false; seen.add(a.msg); return true; });
    return [
      ...merge(pageHints.slice(0, 2)),
      ...merge(frequent.slice(0, 2)),
      ...merge(QUICK_ACTIONS),
    ].slice(0, 6);
  }, [pathname, open]); // recalcula al abrir y al cambiar de página

  const conversationRef = useRef<OAIMessage[]>([]);
  const recognitionRef  = useRef<any>(null);
  const bottomRef       = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // Carga macros al abrir
  useEffect(() => { if (open) setMacros(getMacros()); }, [open]);

  // Actualiza sugerencias de autocompletado mientras el usuario escribe
  useEffect(() => {
    if (input.length >= 2) setSuggestions(getSuggCmd(input, 5));
    else setSuggestions([]);
  }, [input]);

  useEffect(() => {
    if (open) {
      conversationRef.current = [{ role: "system", content: SYSTEM_PROMPT }];
      setMessages([]);
      setActiveProvider(localStorage.getItem(LS_GEMINI) ? "gemini" : "groq");
      setApiStatus({ gemini: null, groq: null });
      // Verificar estado de las APIs sin consumir tokens
      const gKey = localStorage.getItem(LS_GEMINI) ?? "";
      const rKey = localStorage.getItem(LS_GROQ)   ?? "";
      fetch("/api/ai/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geminiKey: gKey, groqKey: rKey }),
      })
        .then((r) => r.json())
        .then((d) => setApiStatus({ gemini: d.gemini ?? false, groq: d.groq ?? false }))
        .catch(() => setApiStatus({ gemini: false, groq: false }));
    }
  }, [open]);

  const executeTool = useCallback(
    async (name: string, args: Record<string, any>): Promise<string> => {
      try {
        switch (name) {
          // ── Navegación ────────────────────────────────────────────────────
          case "navigate": {
            const PATHS: Record<string, string> = {
              dashboard:       "/dashboard",
              leads:           "/leads",
              clientes:        "/clientes",
              presupuestos:    "/quotes",
              facturas:        "/invoices",
              agenda:          "/agenda",
              ajustes:         "/settings",
              riesgos:         "/riesgos",
              esperando:       "/esperando",
              enviados:        "/enviados",
              bandeja:         "/bandeja",
              documentos:      "/documentos",
              "mission-control": "/mission-control",
            };
            const path = PATHS[args.section];
            if (!path) return `Sección desconocida: "${args.section}". Secciones disponibles: ${Object.keys(PATHS).join(", ")}.`;
            await navigate({ to: path as any });
            return `Navegando a ${args.section}.`;
          }

          // ── Estadísticas globales ─────────────────────────────────────────
          case "get_stats": {
            const [
              { count: nClientes },
              { count: nLeads },
              { data: invoices },
              { data: quotes },
            ] = await Promise.all([
              supabase.from("clients").select("id", { count: "exact", head: true }),
              supabase.from("leads").select("id", { count: "exact", head: true }).eq("estado", "nuevo"),
              supabase.from("invoices").select("total, estado"),
              supabase.from("quotes").select("estado").eq("is_template", false),
            ]);
            const total     = (invoices ?? []).reduce((s, i) => s + Number(i.total), 0);
            const pendiente = (invoices ?? [])
              .filter((i) => ["pendiente", "parcial", "vencida"].includes(i.estado))
              .reduce((s, i) => s + Number(i.total), 0);
            return JSON.stringify({
              clientes:              nClientes ?? 0,
              leads_nuevos:          nLeads ?? 0,
              total_facturado:       `${total.toFixed(2)} €`,
              pendiente_cobro:       `${pendiente.toFixed(2)} €`,
              presupuestos_enviados: (quotes ?? []).filter((q) => q.estado === "enviado").length,
            });
          }

          // ── Resumen mensual ───────────────────────────────────────────────
          case "get_monthly_summary": {
            const mes   = args.mes ?? new Date().toISOString().slice(0, 7);
            const inicio = `${mes}-01`;
            const finDate = new Date(`${mes}-01`);
            finDate.setMonth(finDate.getMonth() + 1);
            const fin = finDate.toISOString().slice(0, 10);

            const { data: invs } = await supabase
              .from("invoices")
              .select("total, estado")
              .gte("fecha_emision", inicio)
              .lt("fecha_emision", fin);

            const emitidas  = invs?.length ?? 0;
            const total     = (invs ?? []).reduce((s, i) => s + Number(i.total), 0);
            const cobradas  = (invs ?? []).filter((i) => i.estado === "pagada").reduce((s, i) => s + Number(i.total), 0);
            const pendiente = total - cobradas;
            return JSON.stringify({ mes, facturas_emitidas: emitidas, total_facturado: `${total.toFixed(2)} €`, cobrado: `${cobradas.toFixed(2)} €`, pendiente: `${pendiente.toFixed(2)} €` });
          }

          // ── Clientes ──────────────────────────────────────────────────────
          case "search_clients": {
            if (args.tag) {
              const { data } = await supabase
                .from("clients").select("nombre, telefono, email, poblacion, tags")
                .contains("tags", [args.tag]).limit(10);
              return data?.length
                ? JSON.stringify(data)
                : `No hay clientes con etiqueta "${args.tag}".`;
            }
            // Búsqueda por nombre/email/teléfono ignorando acentos
            const { data: allC } = await supabase
              .from("clients").select("nombre, telefono, email, poblacion, tags");
            const qn = normName(args.query ?? "");
            const matches = (allC ?? []).filter((c: any) => {
              const hay = normName([c.nombre, c.email, c.telefono, c.poblacion].filter(Boolean).join(" "));
              return hay.includes(qn);
            }).slice(0, 10);
            if (matches.length) {
              cacheEntities(matches.map((c: any) => ({ type: "client" as const, id: c.id || normName(c.nombre), nombre: c.nombre, extra: c.telefono, lastAt: Date.now() })));
              return JSON.stringify(matches.map((c: any) => ({ nombre: c.nombre, telefono: c.telefono, email: c.email, poblacion: c.poblacion, tags: c.tags })));
            }
            return `No encontré clientes con "${args.query}".`;
          }

          case "get_client_detail": {
            const { data: allC } = await supabase
              .from("clients")
              .select("id, nombre, telefono, email, direccion, poblacion, notas, tags, valoracion, recurrente");
            const qn = normName(args.nombre ?? "");
            const clients = (allC ?? []).filter(
              (c: any) => normName(c.nombre).includes(qn) || qn.includes(normName(c.nombre)),
            );
            if (!clients.length) return `No encontré ningún cliente con el nombre "${args.nombre}".`;
            const c = clients[0];
            const [{ count: nQ }, { count: nI }, { count: nT }] = await Promise.all([
              supabase.from("quotes").select("id", { count: "exact", head: true }).eq("client_id", c.id),
              supabase.from("invoices").select("id", { count: "exact", head: true }).eq("client_id", c.id),
              supabase.from("trabajos").select("id", { count: "exact", head: true }).eq("client_id", c.id),
            ]);
            await navigate({ to: "/clientes/$id" as any, params: { id: c.id } as any });
            return JSON.stringify({ ...c, presupuestos: nQ ?? 0, facturas: nI ?? 0, trabajos: nT ?? 0 });
          }

          case "create_client_form": {
            await navigate({ to: "/clientes" as any });
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent("assistant:createClient", { detail: args }));
            }, 350);
            return "Formulario de nuevo cliente abierto con los datos indicados.";
          }

          // ── Facturas ──────────────────────────────────────────────────────
          case "search_invoices": {
            await navigate({ to: "/invoices" as any });
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent("assistant:filterInvoices", {
                detail: { search: args.cliente ?? "", estado: args.estado ?? "" },
              }));
            }, 350);

            let q = supabase
              .from("invoices")
              .select("numero, fecha_emision, total, estado, client_id")
              .order("fecha_emision", { ascending: false });
            if (args.estado) q = q.eq("estado", args.estado);
            if (args.numero) q = q.ilike("numero", `%${args.numero}%`);
            const { data: invRaw } = await q.limit(30);
            let results = invRaw ?? [];

            if (args.mes) {
              results = results.filter((i) => i.fecha_emision?.startsWith(args.mes));
            }

            if (results.length) {
              const ids = [...new Set(results.map((i) => i.client_id).filter(Boolean))] as string[];
              const { data: cls } = ids.length
                ? await supabase.from("clients").select("id, nombre").in("id", ids)
                : { data: [] };
              const cm: Record<string, string> = Object.fromEntries((cls ?? []).map((c) => [c.id, c.nombre]));
              if (args.cliente) {
                const q2 = args.cliente.toLowerCase();
                results = results.filter((i) => (cm[i.client_id ?? ""] ?? "").toLowerCase().includes(q2));
              }
              return JSON.stringify(results.slice(0, 15).map((i) => ({
                numero: i.numero, fecha: i.fecha_emision,
                cliente: cm[i.client_id ?? ""] ?? "Sin cliente",
                total: `${Number(i.total).toFixed(2)} €`, estado: i.estado,
              })));
            }
            return "No se encontraron facturas con esos criterios.";
          }

          // ── Presupuestos ──────────────────────────────────────────────────
          case "search_quotes": {
            await navigate({ to: "/quotes" as any });
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent("assistant:filterQuotes", {
                detail: { search: args.cliente ?? "", estado: args.estado ?? "" },
              }));
            }, 350);

            let q = supabase
              .from("quotes")
              .select("numero, fecha, total, estado, client_id, tipo_servicio")
              .eq("is_template", false)
              .order("fecha", { ascending: false });
            if (args.estado) q = q.eq("estado", args.estado);
            const { data: qtRaw } = await q.limit(30);
            let results = qtRaw ?? [];

            if (args.mes) {
              results = results.filter((q2) => q2.fecha?.startsWith(args.mes));
            }

            if (results.length) {
              const ids = [...new Set(results.map((q2) => q2.client_id).filter(Boolean))] as string[];
              const { data: cls } = ids.length
                ? await supabase.from("clients").select("id, nombre").in("id", ids)
                : { data: [] };
              const cm: Record<string, string> = Object.fromEntries((cls ?? []).map((c) => [c.id, c.nombre]));
              if (args.cliente) {
                const q3 = args.cliente.toLowerCase();
                results = results.filter((q2) => (cm[q2.client_id ?? ""] ?? "").toLowerCase().includes(q3));
              }
              return JSON.stringify(results.slice(0, 15).map((q2) => ({
                numero: q2.numero, fecha: q2.fecha,
                cliente: cm[q2.client_id ?? ""] ?? "Sin cliente",
                total: `${Number(q2.total).toFixed(2)} €`,
                estado: q2.estado, servicio: q2.tipo_servicio,
              })));
            }
            return "No se encontraron presupuestos con esos criterios.";
          }

          case "create_quote_form": {
            await navigate({ to: "/quotes" as any });
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent("assistant:createQuote", {
                detail: { cliente_nombre: args.cliente_nombre ?? "" },
              }));
            }, 350);
            return "Abriendo formulario de nuevo presupuesto.";
          }

          // ── Leads ─────────────────────────────────────────────────────────
          case "get_leads": {
            let q = supabase
              .from("leads")
              .select("nombre, telefono, email, servicio, ciudad, estado, created_at")
              .order("created_at", { ascending: false })
              .limit(8);
            if (args.estado && args.estado !== "todos") q = q.eq("estado", args.estado);
            else q = q.in("estado", ["nuevo", "contactado"]);
            const { data } = await q;
            return data?.length ? JSON.stringify(data) : "No hay leads con ese filtro.";
          }

          case "update_lead_status": {
            const { data: allL } = await supabase.from("leads").select("id, nombre");
            const qn = normName(args.nombre ?? "");
            const match = (allL ?? []).find(
              (l: any) => normName(l.nombre).includes(qn) || qn.includes(normName(l.nombre)),
            );
            if (!match) return `No encontré ningún lead con el nombre "${args.nombre}".`;
            await supabase.from("leads").update({ estado: args.estado }).eq("id", match.id);
            return `Lead de ${match.nombre} actualizado a "${args.estado}".`;
          }

          // ── Agenda ────────────────────────────────────────────────────────
          case "get_agenda": {
            const days = Number(args.days ?? 7);
            const hoy  = new Date().toISOString().slice(0, 10);
            const fin  = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
            const { data } = await supabase
              .from("trabajos")
              .select("fecha, hora, direccion, estado, tipo_servicio")
              .gte("fecha", hoy).lte("fecha", fin)
              .order("fecha").order("hora").limit(10);
            return data?.length
              ? JSON.stringify(data)
              : `No hay trabajos en los próximos ${days} días.`;
          }

          // ── Crear lead ───────────────────────────────────────────────────
          case "crear_lead": {
            const { error, data } = await supabase.from("leads").insert({
              nombre: args.nombre, email: args.email ?? null, telefono: args.telefono ?? null,
              servicio: args.servicio ?? null, ubicacion: args.ubicacion ?? null,
              ciudad: args.ciudad ?? null, mensaje: args.mensaje ?? null, estado: "nuevo",
            }).select("id, nombre").single();
            if (error) return `Error al crear el lead: ${error.message}`;
            await navigate({ to: "/leads" as any });
            return `Lead creado: ${data.nombre} (ID: ${data.id}). Estado: nuevo.`;
          }

          // ── Registrar pago en factura ─────────────────────────────────────
          case "registrar_pago": {
            let invoiceId: string | null = null;
            let invoiceTotal = 0;
            // Buscar factura por número o cliente
            if (args.numero_factura) {
              const { data } = await supabase.from("invoices").select("id, total").ilike("numero", `%${args.numero_factura}%`).limit(1);
              if (data?.[0]) { invoiceId = data[0].id; invoiceTotal = Number(data[0].total); }
            } else if (args.cliente_nombre) {
              const { data: cls } = await supabase.from("clients").select("id, nombre");
              const qn = normName(args.cliente_nombre);
              const cl = (cls ?? []).find((c: any) => normName(c.nombre).includes(qn));
              if (cl) {
                const { data } = await supabase.from("invoices").select("id, total").eq("client_id", cl.id).in("estado", ["pendiente","parcial"]).order("fecha_emision", { ascending: false }).limit(1);
                if (data?.[0]) { invoiceId = data[0].id; invoiceTotal = Number(data[0].total); }
              }
            }
            if (!invoiceId) return "No encontré la factura. Especifica el número o el nombre del cliente.";
            const { error: pe } = await (supabase as any).from("invoice_payments").insert({ invoice_id: invoiceId, importe: args.importe, fecha: args.fecha ?? new Date().toISOString().slice(0, 10), notas: args.notas ?? "" });
            if (pe) return `Error al registrar el pago: ${pe.message}`;
            const { data: pagos } = await supabase.from("invoice_payments").select("importe").eq("invoice_id", invoiceId);
            const totalPagado = (pagos ?? []).reduce((s: number, p: any) => s + Number(p.importe), 0);
            const nuevoEstado = totalPagado >= invoiceTotal ? "pagada" : "parcial";
            await supabase.from("invoices").update({ estado: nuevoEstado }).eq("id", invoiceId);
            await navigate({ to: "/invoices" as any });
            return `Pago de ${args.importe}€ registrado. Pagado: ${totalPagado}€ / ${invoiceTotal}€. Factura: ${nuevoEstado}.`;
          }

          // ── Actualizar estado de factura ──────────────────────────────────
          case "actualizar_estado_factura": {
            let q = supabase.from("invoices").select("id, numero");
            if (args.numero_factura) q = (q as any).ilike("numero", `%${args.numero_factura}%`);
            else if (args.cliente_nombre) {
              const { data: cls } = await supabase.from("clients").select("id, nombre");
              const cl = (cls ?? []).find((c: any) => normName(c.nombre).includes(normName(args.cliente_nombre)));
              if (cl) q = (q as any).eq("client_id", cl.id);
            }
            const { data: invs } = await (q as any).limit(1);
            if (!invs?.length) return "No encontré la factura.";
            await supabase.from("invoices").update({ estado: args.estado }).eq("id", invs[0].id);
            await navigate({ to: "/invoices" as any });
            return `Factura ${invs[0].numero ?? ""} actualizada a "${args.estado}".`;
          }

          // ── Actualizar estado de presupuesto ──────────────────────────────
          case "actualizar_estado_presupuesto": {
            let q = supabase.from("quotes").select("id, numero").eq("is_template", false);
            if (args.numero) q = (q as any).ilike("numero", `%${args.numero}%`);
            else if (args.cliente_nombre) {
              const { data: cls } = await supabase.from("clients").select("id, nombre");
              const cl = (cls ?? []).find((c: any) => normName(c.nombre).includes(normName(args.cliente_nombre)));
              if (cl) q = (q as any).eq("client_id", cl.id);
            }
            const { data: qts } = await (q as any).limit(1);
            if (!qts?.length) return "No encontré el presupuesto.";
            await supabase.from("quotes").update({ estado: args.estado }).eq("id", qts[0].id);
            await navigate({ to: "/quotes" as any });
            return `Presupuesto ${qts[0].numero ?? ""} actualizado a "${args.estado}".`;
          }

          // ── Crear trabajo en agenda ────────────────────────────────────────
          case "crear_trabajo": {
            let clientId: string | undefined;
            if (args.cliente_nombre) {
              const { data: cls } = await supabase.from("clients").select("id, nombre");
              const cl = (cls ?? []).find((c: any) => normName(c.nombre).includes(normName(args.cliente_nombre)));
              clientId = cl?.id;
            }
            const { error, data } = await (supabase as any).from("trabajos").insert({
              client_id: clientId ?? null, fecha: args.fecha, hora: args.hora ?? null,
              tipo_servicio: args.tipo_servicio ?? null, direccion: args.direccion ?? null,
              notas: args.notas ?? null, estado: "pendiente", fotos_antes: [], fotos_despues: [],
            }).select("id").single();
            if (error) return `Error al crear el trabajo: ${error.message}`;
            await navigate({ to: "/agenda" as any });
            return `Trabajo creado para el ${args.fecha}${args.hora ? ` a las ${args.hora}` : ""}${args.direccion ? ` en ${args.direccion}` : ""}. ID: ${data.id}.`;
          }

          // ── Actualizar estado de trabajo ──────────────────────────────────
          case "actualizar_estado_trabajo": {
            let q = supabase.from("trabajos").select("id, fecha, direccion");
            if (args.fecha) q = (q as any).eq("fecha", args.fecha);
            if (args.direccion) q = (q as any).ilike("direccion", `%${args.direccion}%`);
            const { data: jobs } = await (q as any).limit(1);
            if (!jobs?.length) return "No encontré el trabajo. Especifica la fecha o dirección.";
            await supabase.from("trabajos").update({ estado: args.estado }).eq("id", jobs[0].id);
            await navigate({ to: "/agenda" as any });
            return `Trabajo del ${jobs[0].fecha}${jobs[0].direccion ? ` (${jobs[0].direccion})` : ""} actualizado a "${args.estado}".`;
          }

          // ── Crear cliente directamente en BD ─────────────────────────────
          case "crear_cliente_real": {
            const { data: nuevo, error } = await (supabase as any)
              .from("clients")
              .insert([{
                nombre: args.nombre,
                email: args.email ?? null,
                telefono: args.telefono ?? null,
                direccion: args.direccion ?? null,
                poblacion: args.poblacion ?? null,
                notas: args.notas ?? null,
                num_trabajos: 0,
                recurrente: false,
                rgpd_consent: false,
                tags: [],
              }])
              .select("id, nombre")
              .single();
            if (error) return `Error al crear el cliente: ${error.message}`;
            cacheEntities([{ type: "client", id: nuevo.id, nombre: nuevo.nombre, lastAt: Date.now() }]);
            await navigate({ to: "/clientes/$id" as any, params: { id: nuevo.id } as any });
            return JSON.stringify({ ok: true, client_id: nuevo.id, nombre: nuevo.nombre });
          }

          // ── Crear presupuesto directamente en BD ──────────────────────────
          case "crear_presupuesto_real": {
            let clientId: string | null = args.client_id ?? null;
            // Si no hay client_id directo, intentar resolver por nombre
            if (!clientId && args.cliente_nombre) {
              const { data: allC } = await supabase.from("clients").select("id, nombre");
              const qn = normName(args.cliente_nombre);
              const found = (allC ?? []).find(
                (c: any) => normName(c.nombre).includes(qn) || qn.includes(normName(c.nombre)),
              );
              clientId = found?.id ?? null;
            }
            if (!clientId) return "No encontré el cliente. Indica el nombre exacto o crea el cliente primero.";
            const hoy = new Date().toISOString().slice(0, 10);
            const { data: pres, error } = await (supabase as any)
              .from("quotes")
              .insert([{
                client_id: clientId,
                fecha: args.fecha ?? hoy,
                estado: "borrador",
                tipo_servicio: args.tipo_servicio ?? null,
                metros_cuadrados_estimados: args.metros_cuadrados ? Number(args.metros_cuadrados) : null,
                notas_operativas: args.notas ?? null,
                is_template: false,
              }])
              .select("id, numero, estado")
              .single();
            if (error) return `Error al crear el presupuesto: ${error.message}`;
            await navigate({ to: "/quotes" as any });
            return `Presupuesto creado: ID ${pres.id}${pres.numero ? ` (${pres.numero})` : ""}, estado borrador. Ve a Presupuestos para añadir líneas y enviarlo.`;
          }

          default:
            return "Función no disponible.";
        }
      } catch (err) {
        return `Error: ${String(err)}`;
      }
    },
    [navigate],
  );

  const toggleProvider = useCallback(() => {
    const next = activeProvider === "gemini" ? "groq" : "gemini";
    setActiveProvider(next);
    localStorage.setItem(LS_PREFER, next);
  }, [activeProvider]);

  const callGemini = useCallback(
    async (userText: string) => {
      const groqKey   = localStorage.getItem(LS_GROQ)   ?? "";
      const geminiKey = localStorage.getItem(LS_GEMINI) ?? "";

      // ── Command Router: siempre primero, no necesita claves de IA ───────
      // Si estamos en una conversación activa con la IA y la respuesta parece
      // una réplica conversacional (sí/no/confirmación/aclaración), ir directo
      // a la IA para no romper el hilo.
      const isConvReply = messages.length > 0
        && /^(sí|si|no|ya|claro|ok|vale|el cliente|exacto|correcto|incorrecto|efectivamente|existe|es [a-záéíóúñ]|se llama|es correcto|no existe)/i.test(userText.trim());
      const quick = isConvReply ? null : tryQuickCommand(userText);
      if (quick) {
        setMessages((m) => [...m, { role: "user", text: userText }]);
        let confirmText = "";
        if (quick.type === "navigate") {
          await executeTool("navigate", { section: quick.section });
          confirmText = `✓ Abriendo ${quick.section}.`;
        } else if (quick.type === "filterClientes") {
          await executeTool("navigate", { section: "clientes" });
          if (quick.search === "__new__") {
            // Abrir formulario nuevo cliente directamente
            setTimeout(() => window.dispatchEvent(new CustomEvent("assistant:createClient", { detail: {} })), 350);
            confirmText = "✓ Abriendo formulario de nuevo cliente.";
          } else {
            setTimeout(() => window.dispatchEvent(new CustomEvent("assistant:filterClientes", { detail: { search: quick.search, tag: quick.tag } })), 350);
            confirmText = quick.tag
              ? `✓ Mostrando clientes con etiqueta "${quick.tag}".`
              : `✓ Buscando cliente "${quick.search}".`;
          }
        } else if (quick.type === "filterLeads") {
          await executeTool("navigate", { section: "leads" });
          setTimeout(() => window.dispatchEvent(new CustomEvent("assistant:filterLeads", { detail: { estado: quick.estado } })), 350);
          confirmText = `✓ Mostrando leads ${quick.estado}.`;
        } else if (quick.type === "filterInvoices") {
          await executeTool("navigate", { section: "facturas" });
          setTimeout(() => window.dispatchEvent(new CustomEvent("assistant:filterInvoices", { detail: { search: quick.search, estado: quick.estado } })), 350);
          confirmText = `✓ Mostrando facturas ${quick.estado}.`;
        } else if (quick.type === "filterQuotes") {
          await executeTool("navigate", { section: "presupuestos" });
          if (quick.search === "__new__") {
            setTimeout(() => window.dispatchEvent(new CustomEvent("assistant:createQuote", { detail: {} })), 350);
            confirmText = "✓ Abriendo formulario de nuevo presupuesto.";
          } else {
            setTimeout(() => window.dispatchEvent(new CustomEvent("assistant:filterQuotes", { detail: { search: quick.search, estado: quick.estado } })), 350);
            confirmText = quick.estado ? `✓ Mostrando presupuestos ${quick.estado}.` : "✓ Abriendo presupuestos.";
          }
        } else if (quick.type === "createClientData") {
          await executeTool("navigate", { section: "clientes" });
          setTimeout(() => window.dispatchEvent(new CustomEvent("assistant:createClient", { detail: quick.data })), 350);
          const campos = Object.entries(quick.data)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");
          confirmText = `✓ Formulario de nuevo cliente con: ${campos}. Revisa y guarda.`;

        } else if (quick.type === "createClientAndQuote") {
          // ── Crear cliente + presupuesto directo en Supabase, sin IA ni formularios ──
          const hoy = new Date().toISOString().slice(0, 10);
          const { clientData, quoteData } = quick;

          if (!clientData.nombre) {
            confirmText = "No pude extraer el nombre del cliente. Escribe: 'nuevo cliente Juan García, Calle X 12, Barcelona y presupuesto vaciado 80m2'";
          } else {
            const { data: newClient, error: clientErr } = await (supabase as any)
              .from("clients")
              .insert([{
                nombre: clientData.nombre,
                email: clientData.email ?? null,
                telefono: clientData.telefono ?? null,
                direccion: clientData.direccion ?? null,
                poblacion: clientData.poblacion ?? null,
                num_trabajos: 0,
                recurrente: false,
                rgpd_consent: false,
                tags: [],
              }])
              .select("id, nombre")
              .single();

            if (clientErr) {
              confirmText = `Error al crear el cliente: ${clientErr.message}`;
            } else {
              cacheEntities([{ type: "client", id: newClient.id, nombre: newClient.nombre, lastAt: Date.now() }]);
              const notasOp = [
                quoteData.poblacion ? `Trabajo en: ${quoteData.poblacion}` : "",
                quoteData.fecha ? `Fecha del servicio: ${quoteData.fecha}` : "",
                quoteData.descripcion ?? "",
              ].filter(Boolean).join(" · ") || null;

              const { data: newQuote, error: quoteErr } = await (supabase as any)
                .from("quotes")
                .insert([{
                  client_id: newClient.id,
                  fecha: hoy,
                  estado: "borrador",
                  tipo_servicio: quoteData.tipo_servicio ?? null,
                  metros_cuadrados_estimados: quoteData.metros_cuadrados ?? null,
                  notas_operativas: notasOp,
                  is_template: false,
                }])
                .select("id")
                .single();

              if (quoteErr) {
                confirmText = `✓ Cliente "${newClient.nombre}" creado. Error en presupuesto: ${quoteErr.message}`;
                await navigate({ to: "/clientes/$id" as any, params: { id: newClient.id } as any });
              } else {
                await navigate({ to: "/quotes" as any });
                const resumen = [
                  quoteData.tipo_servicio,
                  quoteData.metros_cuadrados ? `${quoteData.metros_cuadrados}m²` : "",
                  quoteData.poblacion ? `en ${quoteData.poblacion}` : "",
                  quoteData.fecha ? `para el ${quoteData.fecha}` : "",
                ].filter(Boolean).join(" ");
                confirmText = `✓ Cliente "${newClient.nombre}" creado y presupuesto en borrador generado${resumen ? ` (${resumen})` : ""}. Abre el presupuesto para añadir precio y enviarlo.`;
              }
            }
          }

        } else if (quick.type === "convertLead") {
          await executeTool("navigate", { section: "leads" });
          setTimeout(() => window.dispatchEvent(new CustomEvent("assistant:convertLead", { detail: { nombre: quick.nombre } })), 350);
          confirmText = quick.nombre
            ? `✓ Abriendo conversión del lead "${quick.nombre}" a cliente.`
            : "✓ Abriendo conversión del lead más reciente a cliente.";
        } else if (quick.type === "updateClient") {
          // Buscar cliente por nombre (ignorando acentos) y actualizar el campo
          const { data: allC } = await supabase.from("clients").select("id, nombre, telefono, email");
          const qn = normName(quick.nombre);
          const matches = (allC ?? []).filter(
            (c: any) => normName(c.nombre).includes(qn) || qn.includes(normName(c.nombre)),
          );
          if (matches.length === 0) {
            confirmText = `No encontré ningún cliente llamado "${quick.nombre}".`;
          } else if (matches.length > 1) {
            confirmText = `Hay ${matches.length} clientes que coinciden con "${quick.nombre}": ${matches.map((c: any) => c.nombre).join(", ")}. Sé más específico.`;
          } else {
            const valor = quick.campo === "telefono" ? quick.valor.replace(/[\s-]/g, "") : quick.valor;
            const { error } = await supabase.from("clients").update({ [quick.campo]: valor } as any).eq("id", matches[0].id);
            const etiq: Record<string, string> = { telefono: "teléfono", email: "email", direccion: "dirección", poblacion: "población" };
            confirmText = error
              ? `Error al actualizar: ${error.message}`
              : `✓ ${etiq[quick.campo]} de ${matches[0].nombre} actualizado a "${valor}".`;
          }
        } else if (quick.type === "quoteFromLastLead") {
          // Buscar el último lead activo (sin tokens)
          const { data } = await supabase
            .from("leads")
            .select("nombre, servicio, ciudad, ubicacion")
            .in("estado", ["nuevo", "contactado"])
            .order("created_at", { ascending: false })
            .limit(1);
          if (!data?.length) {
            confirmText = "No hay leads entrantes activos para crear un presupuesto.";
          } else {
            const lead = data[0] as any;
            const sv = (lead.servicio ?? "").toLowerCase();
            const tipo = /retirada|muebles/.test(sv) ? "retirada_muebles"
              : /vaciado/.test(sv) ? "vaciado"
              : /limpieza/.test(sv) ? "limpieza"
              : /mixto/.test(sv) ? "mixto" : undefined;
            await executeTool("navigate", { section: "presupuestos" });
            setTimeout(() => window.dispatchEvent(new CustomEvent("assistant:createQuote", {
              detail: {
                cliente_nombre: lead.nombre,
                tipo_servicio: tipo,
                descripcion: lead.servicio || undefined,
                poblacion: lead.ciudad || lead.ubicacion || undefined,
              },
            })), 350);
            confirmText = `✓ Presupuesto para el último lead (${lead.nombre}${lead.servicio ? ` · ${lead.servicio}` : ""}). Revisa y guarda.`;
          }
        } else if (quick.type === "createQuoteData") {
          const d = quick.data;
          // Si indica cliente por nombre, verificar en caché si existe
          // (si no existe, dar pista sobre cómo crear ambos de golpe)
          if (d.cliente_nombre) {
            const cached = getEntitySugg(d.cliente_nombre, "client", 1);
            if (!cached.length) {
              // Intentar buscar en Supabase antes de navegar
              const { data: found } = await (supabase as any)
                .from("clients")
                .select("id, nombre")
                .ilike("nombre", `%${d.cliente_nombre.trim()}%`)
                .limit(1);
              if (!found?.length) {
                // El cliente no existe: sugerir el flujo correcto
                confirmText = `El cliente "${d.cliente_nombre}" no existe aún.\n\nEscribe: "nuevo cliente ${d.cliente_nombre} y presupuesto${d.tipo_servicio ? ` ${d.tipo_servicio}` : ""}${d.metros_cuadrados ? ` ${d.metros_cuadrados}m²` : ""}" para crearlos juntos de una vez.`;
                setMessages((m) => [...m, { role: "user", text: userText }, { role: "assistant", text: confirmText }]);
                return;
              } else {
                // Existe en DB aunque no en caché → cachear y continuar
                cacheEntities([{ type: "client", id: found[0].id, nombre: found[0].nombre, lastAt: Date.now() }]);
              }
            }
          }
          await executeTool("navigate", { section: "presupuestos" });
          setTimeout(() => window.dispatchEvent(new CustomEvent("assistant:createQuote", { detail: d })), 400);
          const partes = [
            d.cliente_nombre && `cliente: ${d.cliente_nombre}`,
            d.tipo_servicio && `servicio: ${d.tipo_servicio}`,
            d.metros_cuadrados && `${d.metros_cuadrados}m²`,
            d.descripcion && `concepto: ${d.descripcion}`,
            d.precio && `${d.precio}€`,
            d.urgencia && "urgente",
          ].filter(Boolean).join(", ");
          confirmText = `✓ Presupuesto abierto${partes ? ` (${partes})` : ""}. Revisa y guarda.`;
        }
        // Aprender: guardar comando exitoso en el historial local
        if (confirmText && !confirmText.startsWith("No ") && !confirmText.startsWith("Error")) {
          logCmd(userText, quick.type);
        }
        setMessages((m) => [...m, { role: "assistant", text: confirmText }]);
        return;
      }

      // Sin comando rápido → necesita IA. NO exigimos clave en este navegador:
      // si el dispositivo no tiene clave, el servidor usa las suyas (centralizadas,
      // las mismas en todos los dispositivos). Si no hubiera ninguna ni aquí ni en
      // el servidor, /api/ai responde con un aviso claro que se muestra abajo.

      setIsThinking(true);
      setMessages((m) => [...m, { role: "user", text: userText }]);
      conversationRef.current = [...conversationRef.current, { role: "user", content: userText }];

      for (let i = 0; i < 8; i++) {
        try {
          // Recorta historial: sistema + últimos 8 mensajes para no exceder TPM
          const sys     = conversationRef.current[0];
          const rest    = conversationRef.current.slice(1);
          const trimmed = rest.length > 4 ? rest.slice(-4) : rest;
          const tools   = selectTools(userText, trimmed);

          const res = await fetch("/api/ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages:   [sys, ...trimmed],
              tools,
              geminiKey,
              groqKey,
              prefer:     activeProvider,
            }),
          });
          const resData = await res.json();
          if (!res.ok || resData.error) {
            throw new Error(resData.error ?? `HTTP ${res.status}`);
          }
          // Actualizar indicador de proveedor usado
          if (resData._provider && resData._provider !== activeProvider) {
            setActiveProvider(resData._provider as "gemini" | "groq");
          }
          const data = resData;
          const msg  = data.choices?.[0]?.message;
          if (!msg) throw new Error("Respuesta vacía.");

          conversationRef.current = [...conversationRef.current, msg];

          if (msg.tool_calls?.length) {
            const toolMsgs: OAIMessage[] = [];
            for (const tc of msg.tool_calls) {
              const args   = JSON.parse(tc.function.arguments ?? "{}");
              const result = await executeTool(tc.function.name, args);
              toolMsgs.push({ role: "tool", content: result, tool_call_id: tc.id, name: tc.function.name });
            }
            conversationRef.current = [...conversationRef.current, ...toolMsgs];
            continue;
          }

          setMessages((m) => [...m, { role: "assistant", text: msg.content ?? "…" }]);
          logCmd(userText, "ai");
          break;
        } catch (err: any) {
          setMessages((m) => [...m, { role: "assistant", text: `❌ ${err.message ?? "Error de conexión. Verifica tu clave en Ajustes."}` }]);
          break;
        }
      }
      setIsThinking(false);
    },
    [executeTool],
  );

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isThinking) return;
    setInput("");
    void callGemini(text);
  }, [input, isThinking, callGemini]);

  const handleVoice = useCallback(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = "es-ES";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e: any) => { setInput(e.results[0][0].transcript); setIsListening(false); };
    rec.onerror  = () => setIsListening(false);
    rec.onend    = () => setIsListening(false);
    rec.start();
    setIsListening(true);
  }, [isListening]);

  const hasSpeech = typeof window !== "undefined" &&
    (!!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition);

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:scale-105 hover:bg-primary/90"
          aria-label="Abrir asistente IA"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-0 right-0 left-0 sm:bottom-6 sm:right-6 sm:left-auto z-50 flex w-full sm:w-[390px] flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border bg-background shadow-2xl">
          <div className="flex items-center gap-2 bg-primary px-4 py-3">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
            <span className="flex-1 text-sm font-semibold text-primary-foreground">Asistente IA</span>

            {/* Indicadores de estado */}
            <div className="flex items-center gap-2">
              <StatusDot label="Gemini" ok={apiStatus.gemini} active={activeProvider === "gemini"} onClick={() => { setActiveProvider("gemini"); localStorage.setItem(LS_PREFER, "gemini"); }} />
              <StatusDot label="Groq"   ok={apiStatus.groq}   active={activeProvider === "groq"}   onClick={() => { setActiveProvider("groq");   localStorage.setItem(LS_PREFER, "groq");   }} />
            </div>

            <button onClick={() => setOpen(false)} className="rounded p-0.5 text-primary-foreground/70 hover:text-primary-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: 420, minHeight: 180 }}>
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">¿En qué te puedo ayudar?</p>
                  <button
                    onClick={() => setShowMacros(v => !v)}
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                    title="Mis atajos guardados"
                  >
                    <Star className="h-3 w-3" />
                    Atajos {macros.length > 0 ? `(${macros.length})` : ""}
                  </button>
                </div>

                {/* Atajos personalizados del usuario */}
                {showMacros && macros.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Mis atajos</p>
                    {macros.map(m => (
                      <div key={m.id} className="flex items-center gap-1">
                        <button
                          onClick={() => void callGemini(m.msg)}
                          className="flex-1 rounded-md border px-2.5 py-1.5 text-left text-xs hover:bg-muted/60 transition-colors"
                        >
                          ⚡ {m.label}
                        </button>
                        <button
                          onClick={() => { deleteMacro(m.id); setMacros(getMacros()); }}
                          className="text-muted-foreground hover:text-destructive text-[10px] px-1"
                          title="Eliminar atajo"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Acciones dinámicas: contexto de página + frecuentes + estáticas */}
                <div className="grid grid-cols-2 gap-1.5">
                  {dynamicActions.map((a, i) => {
                    const isLearned = getFreqCmd(10).some(e => e.text === a.msg);
                    return (
                      <button key={i} onClick={() => void callGemini(a.msg)}
                        className="flex items-center gap-1 rounded-lg border px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
                        {isLearned && <Clock className="h-2.5 w-2.5 shrink-0 text-primary/60" />}
                        <span className="truncate">{a.label}</span>
                      </button>
                    );
                  })}
                </div>

                <p className="text-[10px] text-center text-muted-foreground/60">
                  Escribe cualquier orden · el CRM aprende de tu uso
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                  m.role === "user"
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : "rounded-bl-sm bg-muted text-foreground",
                )}>
                  {m.text}
                </div>
              </div>
            ))}
            {isThinking && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-muted px-3 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Pensando…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t">
            {/* Dropdown de autocompletado del historial */}
            {suggestions.length > 0 && (
              <div className="border-b bg-card">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(s.text); setSuggestions([]); }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent/10 transition-colors"
                  >
                    <Clock className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                    <span className="flex-1 truncate">{s.text}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{s.count}×</span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2 p-3">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setSuggestions([]); return; }
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); setSuggestions([]); handleSend(); }
                }}
                placeholder={isListening ? "Escuchando…" : "Escribe o habla…"}
                className="flex-1 text-sm"
                disabled={isThinking}
              />
              {/* Guardar como atajo */}
              {input.trim().length > 4 && (
                <Button
                  size="icon" variant="outline"
                  title="Guardar como atajo"
                  onClick={() => {
                    const label = input.trim().slice(0, 28);
                    saveMacro(label, input.trim());
                    setMacros(getMacros());
                    setShowMacros(true);
                  }}
                >
                  <Star className="h-4 w-4" />
                </Button>
              )}
              {hasSpeech && (
                <Button size="icon" variant={isListening ? "destructive" : "outline"}
                  onClick={handleVoice} disabled={isThinking} title={isListening ? "Detener" : "Hablar"}>
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
              )}
              <Button size="icon" onClick={() => { setSuggestions([]); handleSend(); }} disabled={!input.trim() || isThinking}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatusDot({ label, ok, active, onClick }: {
  label: string;
  ok: boolean | null;
  active: boolean;
  onClick: () => void;
}) {
  const dot =
    ok === null  ? "bg-white/40 animate-pulse" :
    ok === true  ? "bg-green-400" :
                   "bg-red-400";
  const ring = active ? "ring-2 ring-white/60 ring-offset-1 ring-offset-primary" : "";
  const title =
    ok === null  ? `${label}: verificando…` :
    ok === true  ? `${label}: conectado ✓ (clic para usar)` :
                   `${label}: no conectado — revisa la clave en Ajustes`;
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn("flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground/80 hover:bg-white/20 transition-colors", active && "text-primary-foreground")}
    >
      <span className={cn("h-2 w-2 rounded-full flex-shrink-0", dot, ring)} />
      {label}
    </button>
  );
}
