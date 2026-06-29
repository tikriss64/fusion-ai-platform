DROP POLICY IF EXISTS "Authenticated can update clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated can delete clients" ON public.clients;

CREATE POLICY "Owners or admins can update clients"
  ON public.clients FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners or admins can delete clients"
  ON public.clients FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));