import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Returns a short-lived signed URL for an invoice PDF, scoped to the caller's
// tenant. The stored `pdf_url` is a storage path inside the private bucket.
export const getInvoiceSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invoiceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // RLS ensures the caller can only read invoices for their own tenant.
    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("pdf_url")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invoice?.pdf_url) return { url: null };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("invoices")
      .createSignedUrl(invoice.pdf_url, 60 * 5);
    if (signErr) throw new Error(signErr.message);
    return { url: signed?.signedUrl ?? null };
  });
