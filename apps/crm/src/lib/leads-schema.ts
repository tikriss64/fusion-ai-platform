export type LeadEstado = 'nuevo' | 'contactado' | 'convertido' | 'descartado';
export type LeadPrioridad = 'critica' | 'alta' | 'media' | 'normal';

export type LeadRow = {
  id: string;
  created_at: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  servicio: string | null;
  ubicacion: string | null;
  ciudad: string | null;
  mensaje: string | null;
  origen_pagina: string | null;
  estado: LeadEstado;
  notas_internas: string | null;
  client_id: string | null;
  // Campos rellenados por el Lead Agent (0 tokens, automático):
  prioridad: LeadPrioridad | null;
  ai_etiquetas: string[] | null;
  ai_resumen: string | null;
  ai_analizado_at: string | null;
};

export const LEAD_PRIORIDAD_LABELS: Record<LeadPrioridad, string> = {
  critica: 'Urgente',
  alta:    'Prioritario',
  media:   'Media',
  normal:  'Normal',
};

export const LEAD_PRIORIDAD_COLORS: Record<LeadPrioridad, string> = {
  critica: 'bg-red-100 text-red-700 border-red-200',
  alta:    'bg-amber-100 text-amber-800 border-amber-200',
  media:   'bg-sky-100 text-sky-800 border-sky-200',
  normal:  'bg-muted text-muted-foreground',
};

export const LEAD_ESTADO_LABELS: Record<LeadEstado, string> = {
  nuevo:       'Nuevo',
  contactado:  'Contactado',
  convertido:  'Convertido',
  descartado:  'Descartado',
};

export const LEAD_ESTADO_COLORS: Record<LeadEstado, string> = {
  nuevo:      'bg-blue-100 text-blue-800',
  contactado: 'bg-yellow-100 text-yellow-800',
  convertido: 'bg-green-100 text-green-800',
  descartado: 'bg-gray-100 text-gray-500',
};

// Puntuación de lead (0-100): probabilidad estimada de conversión, 0 tokens.
// Combina prioridad (del Lead Agent), completitud de datos, intención y frescura.
export function leadScore(lead: LeadRow): number {
  let s = 0;
  if (lead.prioridad === 'critica') s += 40;
  else if (lead.prioridad === 'alta') s += 30;
  else if (lead.prioridad === 'media') s += 15;
  if (lead.telefono) s += 15;                                   // contactable
  if (lead.email) s += 12;
  if (lead.servicio) s += 10;                                   // sabe qué quiere
  if (lead.mensaje && lead.mensaje.trim().length > 12) s += 10; // se ha explicado
  if ((lead.ai_etiquetas ?? []).some((t) => /urgent/i.test(t))) s += 10;
  const dias = (Date.now() - new Date(lead.created_at).getTime()) / 86_400_000;
  if (dias <= 1) s += 10;                                       // recién llegado
  else if (dias > 7) s -= 10;                                   // se enfría
  return Math.max(0, Math.min(100, s));
}

export function leadTemp(score: number): { label: string; color: string; emoji: string } {
  if (score >= 65) return { label: 'Caliente', emoji: '🔥', color: 'bg-red-100 text-red-700 border-red-200' };
  if (score >= 35) return { label: 'Templado', emoji: '🌡️', color: 'bg-amber-100 text-amber-800 border-amber-200' };
  return { label: 'Frío', emoji: '❄️', color: 'bg-sky-100 text-sky-700 border-sky-200' };
}
