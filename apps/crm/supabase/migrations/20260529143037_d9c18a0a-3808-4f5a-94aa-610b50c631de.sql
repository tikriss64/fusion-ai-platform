
REVOKE EXECUTE ON FUNCTION public.next_quote_number(int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_quote_number(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(text, int) TO service_role;
