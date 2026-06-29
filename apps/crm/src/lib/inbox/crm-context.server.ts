// Consulta datos reales del CRM (clientes, presupuestos, facturas, trabajos)
// para enriquecer el contexto de la IA al redactar o responder emails.
// Usa la API REST de Supabase con la clave de servicio (server-only).

interface SupabaseEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

async function sbFetch<T>(env: SupabaseEnv, table: string, params: string): Promise<T[]> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return [];
  const url = `${env.SUPABASE_URL}/rest/v1/${table}?${params}&limit=10`;
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) return [];
  return res.json();
}

export interface CrmContext {
  client: {
    id: string;
    nombre: string;
    email: string;
    telefono: string;
    nif_cif: string;
    direccion: string;
    poblacion: string;
    notas: string;
    num_trabajos: number;
    valoracion: number | null;
    recurrente: boolean;
  } | null;
  quotes: {
    id: string;
    numero: string;
    fecha: string;
    estado: string;
    tipo_servicio: string;
    total: number;
    metros_cuadrados_estimados: number | null;
    notas_operativas: string;
  }[];
  invoices: {
    id: string;
    numero: string;
    fecha_emision: string;
    estado: string;
    total: number;
    vencimiento: string | null;
  }[];
  jobs: {
    id: string;
    fecha: string;
    tipo_servicio: string;
    estado: string;
    direccion: string;
    notas: string;
  }[];
}

export async function fetchCrmContext(env: SupabaseEnv, senderEmail: string, senderName: string): Promise<CrmContext> {
  const empty: CrmContext = { client: null, quotes: [], invoices: [], jobs: [] };
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return empty;

  // 1. Buscar cliente por email exacto, luego por nombre si no hay resultado
  let clients: any[] = await sbFetch(env, "clients",
    `email=ilike.${encodeURIComponent(senderEmail)}&select=id,nombre,email,telefono,nif_cif,direccion,poblacion,notas,num_trabajos,valoracion,recurrente`
  );

  if (clients.length === 0 && senderName) {
    const namePart = senderName.split(" ")[0]; // primer nombre
    clients = await sbFetch(env, "clients",
      `nombre=ilike.${encodeURIComponent(`%${namePart}%`)}&select=id,nombre,email,telefono,nif_cif,direccion,poblacion,notas,num_trabajos,valoracion,recurrente`
    );
  }

  if (clients.length === 0) return empty;
  const client = clients[0];

  // 2. Presupuestos del cliente (últimos 5, más recientes primero)
  const quotes: any[] = await sbFetch(env, "quotes",
    `client_id=eq.${client.id}&select=id,numero,fecha,estado,tipo_servicio,total,metros_cuadrados_estimados,notas_operativas&order=created_at.desc&limit=5`
  );

  // 3. Facturas del cliente (últimas 5)
  const invoices: any[] = await sbFetch(env, "invoices",
    `client_id=eq.${client.id}&select=id,numero,fecha_emision,estado,total,vencimiento&order=created_at.desc&limit=5`
  );

  // 4. Trabajos del cliente (últimos 5)
  const jobs: any[] = await sbFetch(env, "trabajos",
    `client_id=eq.${client.id}&select=id,fecha,tipo_servicio,estado,direccion,notas&order=created_at.desc&limit=5`
  );

  return { client, quotes, invoices, jobs };
}

export function formatCrmContextForAI(ctx: CrmContext): string {
  if (!ctx.client) return "No se encontró este contacto en el CRM.";

  const c = ctx.client;
  let out = `=== DATOS DEL CLIENTE EN EL CRM ===\n`;
  out += `Nombre: ${c.nombre}\n`;
  if (c.email) out += `Email: ${c.email}\n`;
  if (c.telefono) out += `Telefono: ${c.telefono}\n`;
  if (c.nif_cif) out += `NIF/CIF: ${c.nif_cif}\n`;
  if (c.direccion) out += `Direccion: ${c.direccion}${c.poblacion ? `, ${c.poblacion}` : ""}\n`;
  if (c.num_trabajos) out += `Trabajos realizados: ${c.num_trabajos}\n`;
  if (c.recurrente) out += `Cliente recurrente: Si\n`;
  if (c.valoracion) out += `Valoracion: ${c.valoracion}/5\n`;
  if (c.notas) out += `Notas internas: ${c.notas}\n`;

  if (ctx.quotes.length > 0) {
    out += `\n=== PRESUPUESTOS (${ctx.quotes.length}) ===\n`;
    ctx.quotes.forEach((q) => {
      out += `- N.º ${q.numero || "—"} | ${q.fecha} | Estado: ${q.estado} | Total: ${q.total} EUR`;
      if (q.tipo_servicio) out += ` | Servicio: ${q.tipo_servicio}`;
      if (q.metros_cuadrados_estimados) out += ` | ${q.metros_cuadrados_estimados} m²`;
      if (q.notas_operativas) out += ` | Notas: ${q.notas_operativas}`;
      out += "\n";
    });
  }

  if (ctx.invoices.length > 0) {
    out += `\n=== FACTURAS (${ctx.invoices.length}) ===\n`;
    ctx.invoices.forEach((i) => {
      out += `- N.º ${i.numero || "—"} | Emitida: ${i.fecha_emision} | Estado: ${i.estado} | Total: ${i.total} EUR`;
      if (i.vencimiento) out += ` | Vence: ${i.vencimiento}`;
      out += "\n";
    });
  }

  if (ctx.jobs.length > 0) {
    out += `\n=== TRABAJOS REALIZADOS (${ctx.jobs.length}) ===\n`;
    ctx.jobs.forEach((j) => {
      out += `- ${j.fecha || "?"} | ${j.tipo_servicio || "—"} | Estado: ${j.estado}`;
      if (j.direccion) out += ` | ${j.direccion}`;
      if (j.notas) out += ` | ${j.notas}`;
      out += "\n";
    });
  }

  return out;
}
