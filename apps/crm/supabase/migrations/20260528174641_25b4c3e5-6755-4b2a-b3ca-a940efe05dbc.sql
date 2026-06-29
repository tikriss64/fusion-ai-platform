CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nombre TEXT NOT NULL,
  nif_cif TEXT,
  email TEXT,
  telefono TEXT,
  direccion TEXT,
  poblacion TEXT,
  notas TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  primera_fecha DATE,
  ultima_fecha DATE,
  num_trabajos INTEGER NOT NULL DEFAULT 0,
  valoracion SMALLINT CHECK (valoracion BETWEEN 1 AND 5),
  recurrente BOOLEAN NOT NULL DEFAULT false,
  rgpd_consent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view clients"
  ON public.clients FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert clients"
  ON public.clients FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated can update clients"
  ON public.clients FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete clients"
  ON public.clients FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_clients_poblacion ON public.clients(poblacion);
CREATE INDEX idx_clients_tags ON public.clients USING GIN(tags);
CREATE INDEX idx_clients_nombre ON public.clients(nombre);