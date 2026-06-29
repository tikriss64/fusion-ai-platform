-- Tabla leads: contactos entrantes desde el formulario de vaciadodepisos.cat
CREATE TABLE public.leads (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  nombre        TEXT        NOT NULL,
  telefono      TEXT,
  email         TEXT,
  servicio      TEXT,
  ubicacion     TEXT,
  ciudad        TEXT,
  mensaje       TEXT,
  origen_pagina TEXT,
  estado        TEXT        NOT NULL DEFAULT 'nuevo'
                CHECK (estado IN ('nuevo', 'contactado', 'convertido', 'descartado')),
  notas_internas TEXT,
  client_id     UUID        REFERENCES public.clients(id) ON DELETE SET NULL
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- El formulario público puede insertar (usa la clave anon)
CREATE POLICY "leads_insert_anon" ON public.leads
  FOR INSERT TO anon WITH CHECK (true);

-- Solo usuarios autenticados del CRM pueden ver y gestionar
CREATE POLICY "leads_select_auth" ON public.leads
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "leads_update_auth" ON public.leads
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "leads_delete_auth" ON public.leads
  FOR DELETE TO authenticated USING (true);

GRANT INSERT ON public.leads TO anon;
GRANT ALL   ON public.leads TO authenticated;
GRANT ALL   ON public.leads TO service_role;
