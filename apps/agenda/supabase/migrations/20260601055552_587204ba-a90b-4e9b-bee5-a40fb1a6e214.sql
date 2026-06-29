-- Lock down security definer functions to authenticated only
REVOKE EXECUTE ON FUNCTION public.get_user_tenant_id(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_tenant_id() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated;

-- Helper macro pattern applied per table:
-- members of the tenant can do everything within their tenant;
-- billing tables restrict writes to admins.

-- PROFESSIONALS
CREATE POLICY "Tenant members manage professionals" ON public.professionals
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- CLIENTS
CREATE POLICY "Tenant members manage clients" ON public.clients
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- SERVICES
CREATE POLICY "Tenant members manage services" ON public.services
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- RESOURCES
CREATE POLICY "Tenant members manage resources" ON public.resources
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- APPOINTMENTS
CREATE POLICY "Tenant members manage appointments" ON public.appointments
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- NOTIFICATIONS
CREATE POLICY "Tenant members manage notifications" ON public.notifications
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- PAYMENTS: members view; admins write.
CREATE POLICY "Tenant members view payments" ON public.payments
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Admins manage payments" ON public.payments
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'));

-- INVOICES: members view; admins write.
CREATE POLICY "Tenant members view invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Admins manage invoices" ON public.invoices
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'));

-- SUBSCRIPTIONS: members view; admins write.
CREATE POLICY "Tenant members view subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Admins manage subscriptions" ON public.subscriptions
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'));

-- SETTINGS: members view; admins write.
CREATE POLICY "Tenant members view settings" ON public.settings
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Admins manage settings" ON public.settings
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'));
