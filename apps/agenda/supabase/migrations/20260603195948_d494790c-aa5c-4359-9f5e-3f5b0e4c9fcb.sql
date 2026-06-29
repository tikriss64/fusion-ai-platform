DROP POLICY IF EXISTS "Tenant members read own invoices" ON storage.objects;
CREATE POLICY "Tenant members read own invoices"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = public.current_tenant_id()::text
  );