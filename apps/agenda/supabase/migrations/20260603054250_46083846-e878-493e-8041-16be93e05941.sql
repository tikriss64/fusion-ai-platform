-- 1. Add staff role to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff';

-- 2. Reminder / SMS settings
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS reminder_24h boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_1h boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS idioma_panel text NOT NULL DEFAULT 'es';

-- 3. Link professionals to a user account (for staff self-agenda)
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS user_id uuid;

CREATE INDEX IF NOT EXISTS idx_professionals_user_id ON public.professionals(user_id);

-- 4. Waiting list
CREATE TABLE IF NOT EXISTS public.waitlist (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  servicio_id uuid,
  cliente_nombre text NOT NULL,
  cliente_email text,
  cliente_telefono text,
  notas text,
  estado text NOT NULL DEFAULT 'waiting',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.waitlist TO authenticated;
GRANT ALL ON public.waitlist TO service_role;

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members manage waitlist"
ON public.waitlist
FOR ALL
TO authenticated
USING (tenant_id = current_tenant_id())
WITH CHECK (tenant_id = current_tenant_id());