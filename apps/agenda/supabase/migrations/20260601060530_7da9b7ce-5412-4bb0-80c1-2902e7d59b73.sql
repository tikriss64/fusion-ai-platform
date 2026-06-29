ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS tipo_negocio text,
  ADD COLUMN IF NOT EXISTS ciudad text,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_step integer NOT NULL DEFAULT 1;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS exceptions jsonb NOT NULL DEFAULT '[]'::jsonb;