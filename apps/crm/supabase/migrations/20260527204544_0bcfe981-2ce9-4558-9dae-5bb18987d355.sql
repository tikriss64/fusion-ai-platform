
-- Fix search_path on set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Restrict execute on security definer functions
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- Tighten storage SELECT: only files explicitly under a "public/" prefix
DROP POLICY IF EXISTS "Public read company-assets" ON storage.objects;
CREATE POLICY "Public read company-assets public folder"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'company-assets' AND (storage.foldername(name))[1] = 'public');
