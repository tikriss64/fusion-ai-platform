
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

-- First user becomes admin
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

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.company_settings (trade_name) VALUES ('vaciadodepisos.cat');

-- ============ STORAGE BUCKET ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-assets', 'company-assets', true);

CREATE POLICY "Public read company-assets"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'company-assets');

CREATE POLICY "Admins upload company-assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update company-assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'company-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete company-assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'company-assets' AND public.has_role(auth.uid(), 'admin'));
