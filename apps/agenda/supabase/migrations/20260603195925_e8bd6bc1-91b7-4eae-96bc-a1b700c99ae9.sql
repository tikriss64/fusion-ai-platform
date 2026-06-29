CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_no_overlap_pro;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_no_overlap_pro
  EXCLUDE USING gist (
    tenant_id WITH =,
    profesional_id WITH =,
    tstzrange(hora_inicio, hora_fin) WITH &&
  )
  WHERE (estado <> 'cancelled' AND profesional_id IS NOT NULL);

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_no_overlap_resource;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_no_overlap_resource
  EXCLUDE USING gist (
    tenant_id WITH =,
    resource_id WITH =,
    tstzrange(hora_inicio, hora_fin) WITH &&
  )
  WHERE (estado <> 'cancelled' AND resource_id IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.invoice_counters (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, year)
);

GRANT SELECT ON public.invoice_counters TO authenticated;
GRANT ALL ON public.invoice_counters TO service_role;

ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members view counters" ON public.invoice_counters;
CREATE POLICY "Tenant members view counters"
  ON public.invoice_counters FOR SELECT
  TO authenticated
  USING (tenant_id = public.current_tenant_id());

CREATE OR REPLACE FUNCTION public.next_invoice_number(_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _year integer := EXTRACT(YEAR FROM now())::int;
  _n integer;
BEGIN
  INSERT INTO public.invoice_counters (tenant_id, year, last_number)
  VALUES (_tenant_id, _year, 1)
  ON CONFLICT (tenant_id, year)
  DO UPDATE SET last_number = public.invoice_counters.last_number + 1
  RETURNING last_number INTO _n;
  RETURN _year || '-' || LPAD(_n::text, 4, '0');
END;
$$;

-- Only server-side (service_role) code calls this; keep it off the public API.
REVOKE EXECUTE ON FUNCTION public.next_invoice_number(uuid) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS error text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS confirm_token uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS notified_at timestamptz;