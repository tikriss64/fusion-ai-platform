// Herramientas IA con acceso completo al CRM: leer, crear y modificar todos los datos.
// Usa la API REST de Supabase con la clave de servicio (server-only).

export interface CrmEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

// ── Helpers REST ─────────────────────────────────────────────────────────────

async function sbGet<T>(env: CrmEnv, path: string): Promise<T[]> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return [];
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) return [];
  return res.json();
}

async function sbPost<T>(env: CrmEnv, table: string, body: object): Promise<T | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) { console.error(`[CRM AI] POST ${table}:`, await res.text()); return null; }
  const arr = await res.json() as T[];
  return arr[0] ?? null;
}

async function sbPatch(env: CrmEnv, table: string, filter: string, body: object): Promise<boolean> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return false;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  return res.ok;
}

// Estados válidos por entidad. Evita que la IA escriba un estado mal escrito
// ("pagado" en vez de "pagada") que rompería filtros y KPIs en silencio.
const ESTADOS = {
  factura:     ["pendiente", "pagada", "parcial", "vencida"],
  presupuesto: ["borrador", "enviado", "aceptado", "rechazado", "facturado"],
  lead:        ["nuevo", "contactado", "convertido", "descartado"],
  trabajo:     ["pendiente", "confirmado", "en_curso", "completado", "cancelado"],
} as const;

function validarEstado(tipo: keyof typeof ESTADOS, estado: string): string | null {
  if ((ESTADOS[tipo] as readonly string[]).includes(estado)) return null;
  return `Estado no válido para ${tipo}: "${estado}". Valores permitidos: ${ESTADOS[tipo].join(", ")}.`;
}

// ── Implementación de cada herramienta ──────────────────────────────────────

async function buscarClientes(env: CrmEnv, query: string) {
  const q = encodeURIComponent(`%${query}%`);
  const results = await sbGet<any>(env,
    `clients?or=(nombre.ilike.${q},email.ilike.${q},telefono.ilike.${q},nif_cif.ilike.${q})&select=id,nombre,email,telefono,nif_cif,direccion,poblacion,num_trabajos,valoracion,recurrente,notas,tags&order=nombre.asc&limit=10`
  );
  if (!results.length) return "No se encontró ningún cliente con ese criterio.";
  return results.map((c: any) =>
    `ID:${c.id} | ${c.nombre} | ${c.email || "sin email"} | ${c.telefono || "sin tel"} | Trabajos:${c.num_trabajos ?? 0}${c.recurrente ? " | RECURRENTE" : ""}`
  ).join("\n");
}

async function verCliente(env: CrmEnv, id: string) {
  const [clients, quotes, invoices, jobs, leads] = await Promise.all([
    sbGet<any>(env, `clients?id=eq.${id}&select=*`),
    sbGet<any>(env, `quotes?client_id=eq.${id}&select=id,numero,fecha,estado,tipo_servicio,total,metros_cuadrados_estimados,notas_operativas&order=created_at.desc&limit=10`),
    sbGet<any>(env, `invoices?client_id=eq.${id}&select=id,numero,fecha_emision,estado,total,vencimiento&order=created_at.desc&limit=10`),
    sbGet<any>(env, `trabajos?client_id=eq.${id}&select=id,fecha,hora,tipo_servicio,estado,direccion,notas&order=created_at.desc&limit=10`),
    sbGet<any>(env, `leads?client_id=eq.${id}&select=id,nombre,email,servicio,estado,created_at&order=created_at.desc&limit=5`),
  ]);
  if (!clients.length) return "Cliente no encontrado.";
  const c = clients[0];
  let out = `CLIENTE: ${c.nombre}\nEmail: ${c.email || "—"} | Tel: ${c.telefono || "—"} | NIF: ${c.nif_cif || "—"}\nDirección: ${[c.direccion, c.poblacion].filter(Boolean).join(", ") || "—"}\nTrabajos: ${c.num_trabajos ?? 0} | Recurrente: ${c.recurrente ? "Sí" : "No"} | Valoración: ${c.valoracion ?? "—"}/5\nNotas: ${c.notas || "—"}\nTags: ${(c.tags || []).join(", ") || "—"}\n`;
  if (quotes.length) out += `\nPRESUPUESTOS (${quotes.length}):\n` + quotes.map((q: any) => `  ${q.numero || q.id.slice(0,8)} | ${q.fecha} | ${q.estado} | ${q.total ?? "?"}€ | ${q.tipo_servicio || "—"}`).join("\n");
  if (invoices.length) out += `\nFACTURAS (${invoices.length}):\n` + invoices.map((i: any) => `  ${i.numero || i.id.slice(0,8)} | ${i.fecha_emision} | ${i.estado} | ${i.total ?? "?"}€${i.vencimiento ? ` | Vence:${i.vencimiento}` : ""}`).join("\n");
  if (jobs.length) out += `\nTRABAJOS (${jobs.length}):\n` + jobs.map((j: any) => `  ${j.fecha || "?"} ${j.hora || ""} | ${j.tipo_servicio || "—"} | ${j.estado} | ${j.direccion || "—"}`).join("\n");
  if (leads.length) out += `\nLEADS (${leads.length}):\n` + leads.map((l: any) => `  ${l.created_at?.slice(0,10)} | ${l.servicio || "—"} | ${l.estado}`).join("\n");
  return out;
}

async function buscarPresupuestos(env: CrmEnv, query: string, estado?: string) {
  let filter = `select=id,numero,fecha,estado,tipo_servicio,total,notas_operativas,clients(nombre,email)&order=created_at.desc&limit=20`;
  if (estado) filter += `&estado=eq.${estado}`;
  const results = await sbGet<any>(env, `quotes?${filter}`);
  const filtered = query ? results.filter((q: any) =>
    q.numero?.includes(query) || q.clients?.nombre?.toLowerCase().includes(query.toLowerCase()) || q.notas_operativas?.toLowerCase().includes(query.toLowerCase())
  ) : results;
  if (!filtered.length) return "No se encontraron presupuestos.";
  return filtered.map((q: any) =>
    `ID:${q.id} | ${q.numero || "BORR."} | ${q.fecha} | ${q.estado} | ${q.total ?? "?"}€ | Cliente:${q.clients?.nombre || "—"} | ${q.tipo_servicio || "—"}`
  ).join("\n");
}

async function buscarFacturas(env: CrmEnv, query: string, estado?: string) {
  let filter = `select=id,numero,fecha_emision,estado,total,vencimiento,clients(nombre,email)&order=created_at.desc&limit=20`;
  if (estado) filter += `&estado=eq.${estado}`;
  const results = await sbGet<any>(env, `invoices?${filter}`);
  const filtered = query ? results.filter((i: any) =>
    i.numero?.includes(query) || i.clients?.nombre?.toLowerCase().includes(query.toLowerCase())
  ) : results;
  if (!filtered.length) return "No se encontraron facturas.";
  return filtered.map((i: any) =>
    `ID:${i.id} | ${i.numero || "—"} | ${i.fecha_emision} | ${i.estado} | ${i.total ?? "?"}€ | Cliente:${i.clients?.nombre || "—"}${i.vencimiento ? ` | Vence:${i.vencimiento}` : ""}`
  ).join("\n");
}

async function buscarLeads(env: CrmEnv, estado?: string) {
  const filter = estado
    ? `leads?estado=eq.${estado}&select=id,nombre,email,telefono,servicio,ubicacion,ciudad,mensaje,estado,prioridad,created_at&order=created_at.desc&limit=20`
    : `leads?select=id,nombre,email,telefono,servicio,ubicacion,estado,prioridad,created_at&order=created_at.desc&limit=20`;
  const results = await sbGet<any>(env, filter);
  if (!results.length) return "No se encontraron leads.";
  return results.map((l: any) =>
    `ID:${l.id} | ${l.nombre} | ${l.email || "—"} | ${l.telefono || "—"} | ${l.servicio || "—"} | ${l.estado} | ${l.prioridad || "—"} | ${l.created_at?.slice(0,10)}`
  ).join("\n");
}

async function verAgenda(env: CrmEnv, fecha_desde: string, fecha_hasta?: string) {
  const hasta = fecha_hasta || fecha_desde;
  const results = await sbGet<any>(env,
    `trabajos?fecha=gte.${fecha_desde}&fecha=lte.${hasta}&select=id,fecha,hora,tipo_servicio,estado,direccion,notas,clients(nombre,telefono)&order=fecha.asc,hora.asc&limit=30`
  );
  if (!results.length) return `No hay trabajos en agenda para ${fecha_desde}${fecha_hasta && fecha_hasta !== fecha_desde ? ` al ${fecha_hasta}` : ""}.`;
  return results.map((j: any) =>
    `${j.fecha} ${j.hora || "—"} | ${j.tipo_servicio || "—"} | ${j.estado} | ${j.direccion || "—"} | Cliente:${j.clients?.nombre || "—"} (${j.clients?.telefono || "—"})${j.notas ? ` | ${j.notas}` : ""}`
  ).join("\n");
}

async function crearLead(env: CrmEnv, data: { nombre: string; email?: string; telefono?: string; servicio?: string; ubicacion?: string; ciudad?: string; mensaje?: string }) {
  const lead = await sbPost<any>(env, "leads", { ...data, estado: "nuevo" });
  if (!lead) return "Error al crear el lead.";
  return `Lead creado correctamente. ID: ${lead.id} | Nombre: ${lead.nombre} | Estado: nuevo`;
}

async function crearCliente(env: CrmEnv, data: { nombre: string; email?: string; telefono?: string; nif_cif?: string; direccion?: string; poblacion?: string; notas?: string; forzar?: boolean }) {
  // Regla: evitar fichas duplicadas. Si ya existe un cliente con ese email o
  // teléfono, no crear (salvo forzar=true) y devolver el existente.
  if (!data.forzar && (data.email || data.telefono)) {
    const conds: string[] = [];
    if (data.email) conds.push(`email.ilike.${encodeURIComponent(data.email.trim())}`);
    if (data.telefono) conds.push(`telefono.ilike.${encodeURIComponent(data.telefono.trim())}`);
    const dup = await sbGet<any>(env, `clients?or=(${conds.join(",")})&select=id,nombre,email,telefono&limit=1`);
    if (dup.length) {
      const d = dup[0];
      return `Ya existe un cliente con esos datos: "${d.nombre}" (ID:${d.id}, ${d.email || d.telefono}). No se ha creado un duplicado. Si de verdad quieres crear otro, indícalo explícitamente.`;
    }
  }
  const { forzar, ...payload } = data;
  const client = await sbPost<any>(env, "clients", { ...payload, num_trabajos: 0, recurrente: false, rgpd_consent: false, tags: [] });
  if (!client) return "Error al crear el cliente.";
  return `Cliente creado correctamente. ID: ${client.id} | Nombre: ${client.nombre}`;
}

async function actualizarCliente(env: CrmEnv, id: string, data: object) {
  const ok = await sbPatch(env, "clients", `id=eq.${id}`, { ...data, updated_at: new Date().toISOString() });
  return ok ? "Cliente actualizado correctamente." : "Error al actualizar el cliente.";
}

async function actualizarEstadoPresupuesto(env: CrmEnv, id: string, estado: string) {
  const err = validarEstado("presupuesto", estado);
  if (err) return err;
  const ok = await sbPatch(env, "quotes", `id=eq.${id}`, { estado, updated_at: new Date().toISOString() });
  return ok ? `Presupuesto actualizado a estado: ${estado}` : "Error al actualizar el presupuesto.";
}

async function actualizarEstadoFactura(env: CrmEnv, id: string, estado: string) {
  const err = validarEstado("factura", estado);
  if (err) return err;
  // Coherencia de cobro (B3): marcar "pagada" debe dejar registro del importe en el
  // libro de pagos, no solo cambiar el estado. Así los totales cuadran siempre.
  if (estado === "pagada") {
    const invs = await sbGet<any>(env, `invoices?id=eq.${id}&select=total`);
    const total = Number(invs[0]?.total ?? 0);
    const pays = await sbGet<any>(env, `invoice_payments?invoice_id=eq.${id}&select=importe`);
    const pagado = pays.reduce((s: number, p: any) => s + Number(p.importe || 0), 0);
    const resto = Math.round((total - pagado) * 100) / 100;
    if (resto > 0.005) {
      await sbPost(env, "invoice_payments", {
        invoice_id: id, importe: resto, fecha: new Date().toISOString().slice(0, 10),
        notas: "Registrado al marcar la factura como pagada (asistente IA).",
      });
    }
  }
  const ok = await sbPatch(env, "invoices", `id=eq.${id}`, { estado, updated_at: new Date().toISOString() });
  return ok ? `Factura actualizada a estado: ${estado}` : "Error al actualizar la factura.";
}

async function registrarPago(env: CrmEnv, invoice_id: string, importe: number, fecha?: string, notas?: string) {
  const pago = await sbPost<any>(env, "invoice_payments", {
    invoice_id, importe, fecha: fecha || new Date().toISOString().slice(0, 10), notas: notas || "",
  });
  if (!pago) return "Error al registrar el pago.";
  // Verificar si la factura queda totalmente pagada
  const invoices = await sbGet<any>(env, `invoices?id=eq.${invoice_id}&select=total`);
  const payments = await sbGet<any>(env, `invoice_payments?invoice_id=eq.${invoice_id}&select=importe`);
  const totalPagado = payments.reduce((s: number, p: any) => s + (p.importe || 0), 0);
  const totalFactura = invoices[0]?.total ?? 0;
  const nuevoEstado = totalPagado >= totalFactura ? "pagada" : "parcial";
  await sbPatch(env, "invoices", `id=eq.${invoice_id}`, { estado: nuevoEstado, updated_at: new Date().toISOString() });
  return `Pago de ${importe}€ registrado. Total pagado: ${totalPagado}€ / ${totalFactura}€. Estado factura: ${nuevoEstado}.`;
}

async function actualizarEstadoLead(env: CrmEnv, id: string, estado: string) {
  const err = validarEstado("lead", estado);
  if (err) return err;
  const ok = await sbPatch(env, "leads", `id=eq.${id}`, { estado, updated_at: new Date().toISOString() });
  return ok ? `Lead actualizado a estado: ${estado}` : "Error al actualizar el lead.";
}

async function crearTrabajo(env: CrmEnv, data: { client_id?: string; fecha: string; hora?: string; tipo_servicio?: string; direccion?: string; notas?: string; quote_id?: string }) {
  const job = await sbPost<any>(env, "trabajos", { ...data, estado: "pendiente", fotos_antes: [], fotos_despues: [] });
  if (!job) return "Error al crear el trabajo.";
  return `Trabajo creado. ID: ${job.id} | Fecha: ${job.fecha} | ${job.tipo_servicio || "—"} | ${job.direccion || "—"}`;
}

async function actualizarEstadoTrabajo(env: CrmEnv, id: string, estado: string) {
  const err = validarEstado("trabajo", estado);
  if (err) return err;
  const ok = await sbPatch(env, "trabajos", `id=eq.${id}`, { estado, updated_at: new Date().toISOString() });
  return ok ? `Trabajo actualizado a estado: ${estado}` : "Error al actualizar el trabajo.";
}

async function resumenGeneral(env: CrmEnv) {
  const [clients, leads, quotes, invoices, jobs] = await Promise.all([
    sbGet<any>(env, `clients?select=id,recurrente&limit=500`),
    sbGet<any>(env, `leads?select=id,estado&limit=500`),
    sbGet<any>(env, `quotes?select=id,estado,total&limit=500`),
    sbGet<any>(env, `invoices?select=id,estado,total&limit=500`),
    sbGet<any>(env, `trabajos?select=id,estado,fecha&fecha=gte.${new Date().toISOString().slice(0,10)}&limit=50`),
  ]);
  const hoy = new Date().toISOString().slice(0, 10);
  const pendingLeads = leads.filter((l: any) => l.estado === "nuevo").length;
  const pendingQuotes = quotes.filter((q: any) => q.estado === "enviado").length;
  const pendingInvoices = invoices.filter((i: any) => i.estado === "pendiente" || i.estado === "parcial");
  const pendingAmount = pendingInvoices.reduce((s: number, i: any) => s + (i.total || 0), 0);
  const todayJobs = jobs.filter((j: any) => j.fecha === hoy).length;
  return `RESUMEN DEL CRM (${hoy}):\n- Clientes totales: ${clients.length} (${clients.filter((c: any) => c.recurrente).length} recurrentes)\n- Leads nuevos sin atender: ${pendingLeads}\n- Presupuestos enviados esperando respuesta: ${pendingQuotes}\n- Facturas pendientes de cobro: ${pendingInvoices.length} (${pendingAmount}€ total)\n- Trabajos programados hoy: ${todayJobs}`;
}

// ── Definiciones de herramientas para Groq/Gemini ──────────────────────────

export const CRM_TOOLS = [
  { type: "function", function: { name: "buscar_clientes", description: "Busca clientes por nombre, email, teléfono o NIF/CIF", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
  { type: "function", function: { name: "ver_cliente", description: "Ver todos los datos de un cliente: info, presupuestos, facturas, trabajos, leads", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } },
  { type: "function", function: { name: "buscar_presupuestos", description: "Busca presupuestos por número, cliente o estado (borrador/enviado/aceptado/rechazado/facturado)", parameters: { type: "object", properties: { query: { type: "string" }, estado: { type: "string" } }, required: [] } } },
  { type: "function", function: { name: "buscar_facturas", description: "Busca facturas por número, cliente o estado (pendiente/pagada/parcial/vencida)", parameters: { type: "object", properties: { query: { type: "string" }, estado: { type: "string" } }, required: [] } } },
  { type: "function", function: { name: "buscar_leads", description: "Busca leads. Estado posibles: nuevo, contactado, convertido, descartado", parameters: { type: "object", properties: { estado: { type: "string" } }, required: [] } } },
  { type: "function", function: { name: "ver_agenda", description: "Ver trabajos agendados para una fecha o rango de fechas (formato YYYY-MM-DD)", parameters: { type: "object", properties: { fecha_desde: { type: "string" }, fecha_hasta: { type: "string" } }, required: ["fecha_desde"] } } },
  { type: "function", function: { name: "resumen_general", description: "Muestra un resumen del estado actual del CRM: leads, presupuestos, facturas, trabajos de hoy", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "crear_lead", description: "Crea un nuevo lead/solicitud de cliente potencial", parameters: { type: "object", properties: { nombre: { type: "string" }, email: { type: "string" }, telefono: { type: "string" }, servicio: { type: "string" }, ubicacion: { type: "string" }, ciudad: { type: "string" }, mensaje: { type: "string" } }, required: ["nombre"] } } },
  { type: "function", function: { name: "crear_cliente", description: "Crea un nuevo cliente en el CRM. Si ya existe uno con el mismo email/teléfono avisa y no duplica; usa forzar=true solo si el usuario confirma crear el duplicado", parameters: { type: "object", properties: { nombre: { type: "string" }, email: { type: "string" }, telefono: { type: "string" }, nif_cif: { type: "string" }, direccion: { type: "string" }, poblacion: { type: "string" }, notas: { type: "string" }, forzar: { type: "boolean" } }, required: ["nombre"] } } },
  { type: "function", function: { name: "actualizar_cliente", description: "Actualiza datos de un cliente existente", parameters: { type: "object", properties: { id: { type: "string" }, nombre: { type: "string" }, email: { type: "string" }, telefono: { type: "string" }, nif_cif: { type: "string" }, direccion: { type: "string" }, poblacion: { type: "string" }, notas: { type: "string" }, recurrente: { type: "boolean" }, valoracion: { type: "number" } }, required: ["id"] } } },
  { type: "function", function: { name: "actualizar_estado_presupuesto", description: "Cambia el estado de un presupuesto (borrador/enviado/aceptado/rechazado/facturado)", parameters: { type: "object", properties: { id: { type: "string" }, estado: { type: "string" } }, required: ["id", "estado"] } } },
  { type: "function", function: { name: "actualizar_estado_factura", description: "Cambia el estado de una factura (pendiente/pagada/parcial/vencida)", parameters: { type: "object", properties: { id: { type: "string" }, estado: { type: "string" } }, required: ["id", "estado"] } } },
  { type: "function", function: { name: "registrar_pago", description: "Registra un pago en una factura y actualiza su estado automáticamente", parameters: { type: "object", properties: { invoice_id: { type: "string" }, importe: { type: "number" }, fecha: { type: "string" }, notas: { type: "string" } }, required: ["invoice_id", "importe"] } } },
  { type: "function", function: { name: "actualizar_estado_lead", description: "Cambia el estado de un lead (nuevo/contactado/convertido/descartado)", parameters: { type: "object", properties: { id: { type: "string" }, estado: { type: "string" } }, required: ["id", "estado"] } } },
  { type: "function", function: { name: "crear_trabajo", description: "Crea un nuevo trabajo en la agenda", parameters: { type: "object", properties: { client_id: { type: "string" }, quote_id: { type: "string" }, fecha: { type: "string" }, hora: { type: "string" }, tipo_servicio: { type: "string" }, direccion: { type: "string" }, notas: { type: "string" } }, required: ["fecha"] } } },
  { type: "function", function: { name: "actualizar_estado_trabajo", description: "Cambia el estado de un trabajo (pendiente/confirmado/en_curso/completado/cancelado)", parameters: { type: "object", properties: { id: { type: "string" }, estado: { type: "string" } }, required: ["id", "estado"] } } },
];

// ── Ejecutor de herramientas ────────────────────────────────────────────────

export async function executeTool(env: CrmEnv, name: string, args: Record<string, any>): Promise<string> {
  try {
    switch (name) {
      case "buscar_clientes": return await buscarClientes(env, args.query);
      case "ver_cliente": return await verCliente(env, args.id);
      case "buscar_presupuestos": return await buscarPresupuestos(env, args.query || "", args.estado);
      case "buscar_facturas": return await buscarFacturas(env, args.query || "", args.estado);
      case "buscar_leads": return await buscarLeads(env, args.estado);
      case "ver_agenda": return await verAgenda(env, args.fecha_desde, args.fecha_hasta);
      case "resumen_general": return await resumenGeneral(env);
      case "crear_lead": return await crearLead(env, args as Parameters<typeof crearLead>[1]);
      case "crear_cliente": return await crearCliente(env, args as Parameters<typeof crearCliente>[1]);
      case "actualizar_cliente": return await actualizarCliente(env, args.id, args);
      case "actualizar_estado_presupuesto": return await actualizarEstadoPresupuesto(env, args.id, args.estado);
      case "actualizar_estado_factura": return await actualizarEstadoFactura(env, args.id, args.estado);
      case "registrar_pago": return await registrarPago(env, args.invoice_id, args.importe, args.fecha, args.notas);
      case "actualizar_estado_lead": return await actualizarEstadoLead(env, args.id, args.estado);
      case "crear_trabajo": return await crearTrabajo(env, args as Parameters<typeof crearTrabajo>[1]);
      case "actualizar_estado_trabajo": return await actualizarEstadoTrabajo(env, args.id, args.estado);
      default: return `Herramienta desconocida: ${name}`;
    }
  } catch (e) {
    return `Error ejecutando ${name}: ${e}`;
  }
}
