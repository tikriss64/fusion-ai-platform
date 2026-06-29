-- ================================================================
-- SCRIPT COMPLETO CRM vaciadodepisos.cat
-- Ejecutar UNA SOLA VEZ en Supabase SQL Editor
-- ================================================================


-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'employee');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();


-- ============ FUNCIÓN updated_at ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


-- ============ COMPANY SETTINGS ============
CREATE TABLE public.company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_name TEXT,
  legal_name TEXT,
  tax_id TEXT,
  address TEXT,
  postal_code TEXT,
  city TEXT,
  province TEXT,
  country TEXT DEFAULT 'España',
  phone TEXT,
  email TEXT,
  website TEXT,
  logo_url TEXT,
  iban TEXT,
  bank_name TEXT,
  default_vat NUMERIC(5,2) DEFAULT 21.00,
  google_reviews_url TEXT,
  trustpilot_url TEXT,
  singleton BOOLEAN NOT NULL DEFAULT TRUE UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view company settings"
  ON public.company_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert company settings"
  ON public.company_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update company settings"
  ON public.company_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.company_settings (trade_name) VALUES ('vaciadodepisos.cat');


-- ============ STORAGE: logos empresa ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-assets', 'company-assets', true)
ON CONFLICT DO NOTHING;

CREATE POLICY "Public read company-assets public folder"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'company-assets' AND (storage.foldername(name))[1] = 'public');

CREATE POLICY "Admins upload company-assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update company-assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'company-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete company-assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'company-assets' AND public.has_role(auth.uid(), 'admin'));


-- ============ CLIENTES ============
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

CREATE POLICY "Owners or admins can update clients"
  ON public.clients FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners or admins can delete clients"
  ON public.clients FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_clients_poblacion ON public.clients(poblacion);
CREATE INDEX idx_clients_tags ON public.clients USING GIN(tags);
CREATE INDEX idx_clients_nombre ON public.clients(nombre);


-- ============ PRESUPUESTOS Y FACTURAS ============
CREATE TYPE public.quote_status AS ENUM ('borrador','enviado','aceptado','rechazado','facturado');
CREATE TYPE public.service_type AS ENUM ('vaciado','limpieza','retirada_muebles','mixto');
CREATE TYPE public.invoice_status AS ENUM ('pendiente','pagada','parcial','vencida');

CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  numero text UNIQUE,
  is_template boolean NOT NULL DEFAULT false,
  template_name text,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  valido_hasta date,
  estado public.quote_status NOT NULL DEFAULT 'borrador',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  iva numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  tipo_servicio public.service_type,
  dificultad_acceso text,
  notas_operativas text,
  tipo_vivienda text,
  ascensor boolean DEFAULT false,
  planta text,
  parking boolean DEFAULT false,
  urgencia text,
  metros_cuadrados_estimados numeric(8,2),
  objetos_recuperables text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view quotes" ON public.quotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert quotes" ON public.quotes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners or admins update quotes" ON public.quotes FOR UPDATE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(),'admin')) WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(),'admin'));
CREATE POLICY "Owners or admins delete quotes" ON public.quotes FOR DELETE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'));

CREATE TRIGGER quotes_updated_at BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  descripcion text NOT NULL,
  cantidad numeric(10,2) NOT NULL DEFAULT 1,
  precio_unit numeric(12,2) NOT NULL DEFAULT 0,
  iva_aplicable numeric(5,2) NOT NULL DEFAULT 21,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_items TO authenticated;
GRANT ALL ON public.quote_items TO service_role;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view quote_items" ON public.quote_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated manage quote_items" ON public.quote_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND (q.user_id = auth.uid() OR has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND (q.user_id = auth.uid() OR has_role(auth.uid(),'admin'))));

CREATE INDEX idx_quote_items_quote ON public.quote_items(quote_id);

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  serie text NOT NULL DEFAULT 'A',
  numero text NOT NULL,
  fecha_emision date NOT NULL DEFAULT CURRENT_DATE,
  vencimiento date,
  estado public.invoice_status NOT NULL DEFAULT 'pendiente',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  iva numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  notas_legales text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (serie, numero)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners or admins update invoices" ON public.invoices FOR UPDATE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(),'admin')) WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(),'admin'));
CREATE POLICY "Owners or admins delete invoices" ON public.invoices FOR DELETE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'));

CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  descripcion text NOT NULL,
  cantidad numeric(10,2) NOT NULL DEFAULT 1,
  precio_unit numeric(12,2) NOT NULL DEFAULT 0,
  iva_aplicable numeric(5,2) NOT NULL DEFAULT 21,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view invoice_items" ON public.invoice_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated manage invoice_items" ON public.invoice_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND (i.user_id = auth.uid() OR has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND (i.user_id = auth.uid() OR has_role(auth.uid(),'admin'))));

CREATE INDEX idx_invoice_items_invoice ON public.invoice_items(invoice_id);

CREATE TABLE public.invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  importe numeric(12,2) NOT NULL,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_payments TO authenticated;
GRANT ALL ON public.invoice_payments TO service_role;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view payments" ON public.invoice_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert payments" ON public.invoice_payments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners or admins update payments" ON public.invoice_payments FOR UPDATE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(),'admin')) WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(),'admin'));
CREATE POLICY "Owners or admins delete payments" ON public.invoice_payments FOR DELETE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'));

CREATE INDEX idx_invoice_payments_invoice ON public.invoice_payments(invoice_id);

CREATE OR REPLACE FUNCTION public.next_quote_number(_year int)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE next_seq int;
BEGIN
  SELECT COALESCE(MAX(CAST(SPLIT_PART(numero, '-', 3) AS int)), 0) + 1
    INTO next_seq FROM public.quotes
   WHERE numero LIKE 'PRES-' || _year || '-%';
  RETURN 'PRES-' || _year || '-' || LPAD(next_seq::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.next_invoice_number(_serie text, _year int)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE next_seq int;
BEGIN
  SELECT COALESCE(MAX(CAST(SPLIT_PART(numero, '-', 2) AS int)), 0) + 1
    INTO next_seq FROM public.invoices
   WHERE serie = _serie AND numero LIKE _year || '-%';
  RETURN _year || '-' || LPAD(next_seq::text, 4, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_quote_number(int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_quote_number(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(text, int) TO service_role;

REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;


-- ============ AGENDA (TRABAJOS) ============
CREATE TYPE public.trabajo_status AS ENUM ('pendiente','confirmado','en_curso','completado','cancelado');

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
GRANT ALL ON public.trabajos TO service_role;
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


-- ============ STORAGE: fotos de trabajos ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('trabajos-fotos', 'trabajos-fotos', true)
ON CONFLICT DO NOTHING;

CREATE POLICY "Users upload job photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'trabajos-fotos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Public read job photos"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'trabajos-fotos');

CREATE POLICY "Users delete their job photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'trabajos-fotos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
