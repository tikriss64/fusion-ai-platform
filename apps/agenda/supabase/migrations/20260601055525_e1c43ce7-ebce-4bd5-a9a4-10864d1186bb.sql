-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'staff');
CREATE TYPE public.tenant_plan AS ENUM ('trial', 'starter', 'pro', 'business');
CREATE TYPE public.appointment_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');
CREATE TYPE public.payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'incomplete');
CREATE TYPE public.notification_type AS ENUM ('email', 'sms');
CREATE TYPE public.notification_status AS ENUM ('queued', 'sent', 'failed');
CREATE TYPE public.resource_type AS ENUM ('sala', 'equipo');

-- ============================================================
-- TENANTS
-- ============================================================
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nombre text NOT NULL,
  zona_horaria text NOT NULL DEFAULT 'Europe/Madrid',
  moneda text NOT NULL DEFAULT 'EUR',
  plan public.tenant_plan NOT NULL DEFAULT 'trial',
  trial_ends_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PROFILES (app users mapped to auth.users)
-- ============================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- USER ROLES (separate table to avoid privilege escalation)
-- ============================================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- ============================================================
-- SECURITY DEFINER FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Convenience: current user's tenant
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- DOMAIN TABLES
-- ============================================================
CREATE TABLE public.professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  email text,
  servicios_asignados uuid[] NOT NULL DEFAULT '{}',
  horarios jsonb NOT NULL DEFAULT '{}'::jsonb,
  vacation_mode boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  email text,
  telefono text,
  notas_internas text,
  rgpd_consent boolean NOT NULL DEFAULT false,
  rgpd_consent_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  duracion_min integer NOT NULL DEFAULT 60,
  precio numeric(10,2) NOT NULL DEFAULT 0,
  categoria text,
  color text DEFAULT '#6366f1',
  buffer_before_min integer NOT NULL DEFAULT 0,
  buffer_after_min integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  tipo public.resource_type NOT NULL DEFAULT 'sala',
  capacidad integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  servicio_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  profesional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  resource_id uuid REFERENCES public.resources(id) ON DELETE SET NULL,
  fecha date NOT NULL,
  hora_inicio timestamptz NOT NULL,
  hora_fin timestamptz NOT NULL,
  estado public.appointment_status NOT NULL DEFAULT 'pending',
  notas text,
  pago_id uuid,
  magic_link_token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  stripe_payment_intent_id text,
  estado public.payment_status NOT NULL DEFAULT 'pending',
  importe numeric(10,2) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'EUR',
  invoice_pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  numero_factura text NOT NULL,
  fecha date NOT NULL DEFAULT current_date,
  cliente_nombre text,
  cliente_email text,
  importe_neto numeric(10,2) NOT NULL DEFAULT 0,
  iva_porcentaje numeric(5,2) NOT NULL DEFAULT 21,
  importe_iva numeric(10,2) NOT NULL DEFAULT 0,
  importe_total numeric(10,2) NOT NULL DEFAULT 0,
  pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stripe_subscription_id text,
  plan public.tenant_plan NOT NULL DEFAULT 'trial',
  estado public.subscription_status NOT NULL DEFAULT 'trialing',
  renewal_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  tipo public.notification_type NOT NULL,
  estado public.notification_status NOT NULL DEFAULT 'queued',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  iva_porcentaje numeric(5,2) NOT NULL DEFAULT 21,
  idioma text NOT NULL DEFAULT 'es',
  color_primario text DEFAULT '#6366f1',
  color_secundario text DEFAULT '#a855f7',
  logo_url text,
  politica_cancelacion_horas integer NOT NULL DEFAULT 24,
  politica_cancelacion_penalizacion numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add FK from appointments.pago_id now that payments exists
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_pago_id_fkey
  FOREIGN KEY (pago_id) REFERENCES public.payments(id) ON DELETE SET NULL;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_profiles_tenant ON public.profiles(tenant_id);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_professionals_tenant ON public.professionals(tenant_id);
CREATE INDEX idx_clients_tenant ON public.clients(tenant_id);
CREATE INDEX idx_services_tenant ON public.services(tenant_id);
CREATE INDEX idx_resources_tenant ON public.resources(tenant_id);
CREATE INDEX idx_appointments_tenant ON public.appointments(tenant_id);
CREATE INDEX idx_appointments_fecha ON public.appointments(tenant_id, fecha);
CREATE INDEX idx_payments_tenant ON public.payments(tenant_id);
CREATE INDEX idx_invoices_tenant ON public.invoices(tenant_id);
CREATE INDEX idx_subscriptions_tenant ON public.subscriptions(tenant_id);
CREATE INDEX idx_notifications_tenant ON public.notifications(tenant_id);

-- ============================================================
-- GRANTS
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professionals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;

GRANT ALL ON public.tenants TO service_role;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.user_roles TO service_role;
GRANT ALL ON public.professionals TO service_role;
GRANT ALL ON public.clients TO service_role;
GRANT ALL ON public.services TO service_role;
GRANT ALL ON public.resources TO service_role;
GRANT ALL ON public.appointments TO service_role;
GRANT ALL ON public.payments TO service_role;
GRANT ALL ON public.invoices TO service_role;
GRANT ALL ON public.subscriptions TO service_role;
GRANT ALL ON public.notifications TO service_role;
GRANT ALL ON public.settings TO service_role;

-- ============================================================
-- ENABLE RLS
-- ============================================================
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- TENANTS: members can view their tenant; admins can update.
CREATE POLICY "Members view own tenant" ON public.tenants
  FOR SELECT TO authenticated
  USING (id = public.current_tenant_id());
CREATE POLICY "Admins update own tenant" ON public.tenants
  FOR UPDATE TO authenticated
  USING (id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'));

-- PROFILES: users see own profile + profiles in same tenant.
CREATE POLICY "View own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR tenant_id = public.current_tenant_id());
CREATE POLICY "Update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid());
CREATE POLICY "Admins manage tenant profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'));

-- USER_ROLES: view roles in own tenant; admins manage.
CREATE POLICY "View tenant roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR tenant_id = public.current_tenant_id());
CREATE POLICY "Admins insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'));
