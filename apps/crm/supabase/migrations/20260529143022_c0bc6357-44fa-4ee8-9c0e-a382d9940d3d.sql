
-- Enums
CREATE TYPE public.quote_status AS ENUM ('borrador','enviado','aceptado','rechazado','facturado');
CREATE TYPE public.service_type AS ENUM ('vaciado','limpieza','retirada_muebles','mixto');
CREATE TYPE public.invoice_status AS ENUM ('pendiente','pagada','parcial','vencida');

-- QUOTES
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

-- QUOTE ITEMS
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

-- INVOICES
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

-- Invoice items (copied from quote)
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

-- INVOICE PAYMENTS
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

-- Generador de número correlativo de presupuesto: PRES-YYYY-0001
CREATE OR REPLACE FUNCTION public.next_quote_number(_year int)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_seq int;
BEGIN
  SELECT COALESCE(MAX(CAST(SPLIT_PART(numero, '-', 3) AS int)), 0) + 1
    INTO next_seq
    FROM public.quotes
   WHERE numero LIKE 'PRES-' || _year || '-%';
  RETURN 'PRES-' || _year || '-' || LPAD(next_seq::text, 4, '0');
END;
$$;

-- Generador de número correlativo de factura por serie
CREATE OR REPLACE FUNCTION public.next_invoice_number(_serie text, _year int)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_seq int;
BEGIN
  SELECT COALESCE(MAX(CAST(SPLIT_PART(numero, '-', 2) AS int)), 0) + 1
    INTO next_seq
    FROM public.invoices
   WHERE serie = _serie AND numero LIKE _year || '-%';
  RETURN _year || '-' || LPAD(next_seq::text, 4, '0');
END;
$$;
