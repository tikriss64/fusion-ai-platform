
-- ============================================================
-- TABLA: trabajos (módulo agenda)
-- ============================================================

CREATE TYPE public.trabajo_status AS ENUM (
  'pendiente','confirmado','en_curso','completado','cancelado'
);

CREATE TABLE public.trabajos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  quote_id       uuid REFERENCES public.quotes(id)   ON DELETE SET NULL,
  client_id      uuid REFERENCES public.clients(id)  ON DELETE SET NULL,
  fecha          date,
  hora           time,
  direccion      text,
  tipo_servicio  public.service_type,
  notas          text,
  estado         public.trabajo_status NOT NULL DEFAULT 'pendiente',
  fotos_antes    text[]  NOT NULL DEFAULT '{}',
  fotos_despues  text[]  NOT NULL DEFAULT '{}',
  carpeta_fotos_url text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trabajos TO authenticated;
GRANT ALL                            ON public.trabajos TO service_role;
ALTER TABLE public.trabajos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view trabajos"
  ON public.trabajos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert trabajos"
  ON public.trabajos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners or admins update trabajos"
  ON public.trabajos FOR UPDATE TO authenticated
  USING      (auth.uid() = user_id OR has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(),'admin'));

CREATE POLICY "Owners or admins delete trabajos"
  ON public.trabajos FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'));

CREATE TRIGGER trabajos_updated_at
  BEFORE UPDATE ON public.trabajos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_trabajos_fecha   ON public.trabajos(fecha);
CREATE INDEX idx_trabajos_client  ON public.trabajos(client_id);
CREATE INDEX idx_trabajos_quote   ON public.trabajos(quote_id);
CREATE INDEX idx_trabajos_user    ON public.trabajos(user_id);

-- ============================================================
-- STORAGE: bucket para fotos de trabajos
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('trabajos-fotos', 'trabajos-fotos', true)
ON CONFLICT DO NOTHING;

-- Subida: sólo el propietario (carpeta por user_id)
CREATE POLICY "Users upload job photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'trabajos-fotos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Lectura pública (las fotos son documentación de trabajo, no datos sensibles)
CREATE POLICY "Public read job photos"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'trabajos-fotos');

-- Borrado: sólo el propietario
CREATE POLICY "Users delete their job photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'trabajos-fotos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
