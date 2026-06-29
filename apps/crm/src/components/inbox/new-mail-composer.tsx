import { apiFetch } from "@/components/inbox/api-client";
import { EMAIL_TEMPLATES, SIGNATURE_TEXT } from "@/components/inbox/email-signature";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Send, Loader2, Wand2, ChevronDown, Paperclip, FileText } from "lucide-react";

interface CrmRaw {
  client: { nombre: string } | null;
  invoices: { numero: string; total: number; vencimiento: string | null; estado: string; fecha_emision: string }[];
}

// Rellena los huecos [ ] de una plantilla con datos reales del CRM + empresa.
async function fillTemplate(body: string, subject: string, toEmail: string): Promise<{ body: string; subject: string }> {
  let b = body, s = subject;
  // 1) IBAN y datos de empresa desde company_settings
  try {
    const { data: cs } = await supabase.from("company_settings").select("iban, phone").limit(1).maybeSingle();
    if (cs?.iban) b = b.replace(/\[IBAN\]/g, cs.iban);
  } catch {}
  // 2) Datos del cliente/facturas si el destinatario está en el CRM
  if (toEmail.trim()) {
    try {
      const r = await apiFetch("/api/inbox/crm-context", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderEmail: toEmail.trim(), senderName: "" }),
      });
      const d = await r.json() as { raw?: CrmRaw };
      const raw = d.raw;
      if (raw?.client) {
        const firstName = raw.client.nombre.split(" ")[0];
        b = b.replace(/\[Nombre\]/g, firstName);
        // Si hay una factura pendiente, rellena los huecos del recordatorio de pago
        const pend = raw.invoices?.find((i) => i.estado === "pendiente" || i.estado === "parcial" || i.estado === "vencida");
        if (pend) {
          b = b.replace(/\[Número\]/g, pend.numero || "—")
               .replace(/\[Cantidad\]/g, pend.total != null ? `${Number(pend.total).toFixed(2)}` : "—")
               .replace(/\[Fecha vencimiento\]/g, pend.vencimiento || "—")
               .replace(/\[Fecha\]/g, pend.fecha_emision || "—");
        }
      }
    } catch {}
  }
  return { body: b, subject: s };
}

interface Props {
  onClose: () => void;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
  /** Adjunta automáticamente el PDF de una factura/presupuesto al abrir. */
  autoAttach?: { type: "factura" | "presupuesto"; id: string };
  /** Se llama tras enviar correctamente (p.ej. para marcar el presupuesto "enviado"). */
  onSent?: () => void;
}

export function NewMailComposer({ onClose, defaultTo = "", defaultSubject = "", defaultBody = "", autoAttach, onSent }: Props) {
  const [templateId, setTemplateId] = useState("blank");
  const [showTemplates, setShowTemplates] = useState(!defaultBody);
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody || EMAIL_TEMPLATES[0].body);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [attachments, setAttachments] = useState<{ filename: string; mimeType: string; base64: string; size: number }[]>([]);

  const [crmDocs, setCrmDocs] = useState<{ type: "factura" | "presupuesto"; id: string; label: string }[]>([]);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) { setError(`"${file.name}" supera 20 MB.`); continue; }
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.readAsDataURL(file);
      });
      setAttachments((prev) => [...prev, { filename: file.name, mimeType: file.type || "application/octet-stream", base64, size: file.size }]);
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });

  // Busca las facturas/presupuestos del destinatario (si es cliente del CRM).
  const loadCrmDocs = async () => {
    if (!to.trim()) { setError("Pon primero el destinatario."); return; }
    setError("");
    setLoadingDocs(true);
    try {
      const { data: clients } = await supabase.from("clients").select("id, nombre").ilike("email", to.trim());
      const client = clients?.[0];
      if (!client) { setError("El destinatario no es un cliente del CRM."); return; }
      const [{ data: invs }, { data: qts }] = await Promise.all([
        supabase.from("invoices").select("id, serie, numero, total").eq("client_id", client.id).order("created_at", { ascending: false }).limit(10),
        supabase.from("quotes").select("id, numero, total").eq("client_id", client.id).eq("is_template", false).order("created_at", { ascending: false }).limit(10),
      ]);
      const docs = [
        ...((invs ?? []) as any[]).map((i) => ({ type: "factura" as const, id: i.id, label: `Factura ${i.serie ?? ""}${i.numero ?? ""} · ${Number(i.total).toFixed(2)} €` })),
        ...((qts ?? []) as any[]).map((q) => ({ type: "presupuesto" as const, id: q.id, label: `Presupuesto ${q.numero ?? "—"} · ${Number(q.total).toFixed(2)} €` })),
      ];
      if (docs.length === 0) { setError("Este cliente no tiene facturas ni presupuestos."); return; }
      setCrmDocs(docs);
      setShowDocPicker(true);
    } finally {
      setLoadingDocs(false);
    }
  };

  // Genera el PDF del documento elegido y lo adjunta.
  const attachCrmDoc = async (doc: { type: "factura" | "presupuesto"; id: string }) => {
    setShowDocPicker(false);
    setLoadingDocs(true);
    try {
      const { data: company } = await supabase.from("company_settings").select("*").maybeSingle();
      const [{ pdf }] = await Promise.all([import("@react-pdf/renderer")]);
      let blob: Blob, filename: string;
      if (doc.type === "factura") {
        const { data: inv } = await supabase.from("invoices").select("*").eq("id", doc.id).single();
        if (!inv) throw new Error("Factura no encontrada");
        const { data: items } = await supabase.from("invoice_items").select("*").eq("invoice_id", doc.id).order("orden");
        const { data: client } = await supabase.from("clients").select("*").eq("id", inv.client_id ?? "").maybeSingle();
        const { InvoicePdfDocument } = await import("@/components/documents/InvoicePdfDocument");
        blob = await pdf(<InvoicePdfDocument invoice={{ ...inv, id: inv.id ?? doc.id, items: items ?? [] } as any} client={client} company={company as any} />).toBlob();
        filename = `Factura_${inv.serie ?? ""}-${inv.numero ?? ""}.pdf`;
      } else {
        const { data: q } = await supabase.from("quotes").select("*").eq("id", doc.id).single();
        if (!q) throw new Error("Presupuesto no encontrado");
        const { data: items } = await supabase.from("quote_items").select("*").eq("quote_id", doc.id).order("orden");
        const { data: client } = await supabase.from("clients").select("*").eq("id", q.client_id ?? "").maybeSingle();
        const { QuotePdfDocument } = await import("@/components/documents/QuotePdfDocument");
        blob = await pdf(<QuotePdfDocument quote={{ ...q, id: q.id ?? doc.id, items: items ?? [] } as any} client={client} company={company as any} />).toBlob();
        filename = `Presupuesto_${q.numero ?? ""}.pdf`;
      }
      const base64 = await blobToBase64(blob);
      setAttachments((prev) => [...prev, { filename, mimeType: "application/pdf", base64, size: blob.size }]);
    } catch (e) {
      setError("No se pudo generar el PDF.");
    } finally {
      setLoadingDocs(false);
    }
  };

  // Adjunta el PDF indicado (factura/presupuesto) automáticamente al abrir.
  useEffect(() => {
    if (autoAttach) void attachCrmDoc(autoAttach);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyTemplate = async (id: string) => {
    const tpl = EMAIL_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    setTemplateId(id);
    setShowTemplates(false);
    const nextSubject = tpl.subject && !subject ? tpl.subject : subject;
    // Autorrelleno con datos reales del CRM (nombre, IBAN, factura pendiente…)
    const filled = await fillTemplate(tpl.body, nextSubject, to);
    setBody(filled.body);
    if (tpl.subject && !subject) setSubject(tpl.subject);
  };

  const generateWithAI = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      // Buscar datos del cliente en el CRM si hay destinatario
      let crmCtx = "";
      if (to.trim()) {
        const ctxRes = await apiFetch("/api/inbox/crm-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ senderEmail: to.trim(), senderName: "" }),
        });
        const ctxData = await ctxRes.json() as { context: string };
        if (ctxData.context && !ctxData.context.includes("No se encontró")) {
          crmCtx = `\n\nDATOS DEL DESTINATARIO EN EL CRM:\n${ctxData.context}`;
        }
      }
      const r = await apiFetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: "Eres el asistente de VaciadoDePisos.cat (ZAFIRO LANCER S.L., empresa de vaciado de pisos en Barcelona). Redacta emails profesionales, concisos y sin emojis en español. Usa los datos del CRM cuando los tengas para personalizar el mensaje. No incluyas firma (se añade automáticamente). Devuelve SOLO el cuerpo del email." },
            { role: "user", content: aiPrompt + crmCtx + (body ? `\n\nBorrador actual:\n${body}` : "") },
          ],
          tools: [],
        }),
      });
      const d = await r.json() as { choices?: { message: { content: string } }[] };
      const text = d.choices?.[0]?.message?.content?.trim();
      if (text) setBody(text);
    } catch {}
    setAiLoading(false);
    setAiPrompt("");
  };

  const handleSend = async () => {
    if (!to.trim() || !body.trim()) { setError("Rellena el destinatario y el mensaje."); return; }
    setSending(true);
    setError("");
    try {
      const r = await apiFetch("/api/email/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.trim(),
          subject: subject.trim() || "(sin asunto)",
          // Añade la firma corporativa al enviar (antes solo se previsualizaba y NO se
          // incluía). Evita firmas duplicadas si el cuerpo ya la trae.
          body: body.includes("ZAFIRO LANCER") ? body.trim() : `${body.trim()}\n${SIGNATURE_TEXT}`,
          attachments: attachments.map(({ filename, mimeType, base64 }) => ({ filename, mimeType, base64 })),
        }),
      });
      const d = await r.json() as { ok: boolean };
      if (d.ok) { setSent(true); onSent?.(); setTimeout(onClose, 1500); }
      else setError("No se pudo enviar. Comprueba que Gmail sigue conectado.");
    } catch {
      setError("Error de red al enviar.");
    } finally {
      setSending(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-[60]" onClick={onClose} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-5xl flex flex-col bg-background border border-border rounded-2xl shadow-2xl overflow-hidden" style={{height:"92vh"}}>

          {/* Cabecera */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <h2 className="text-base font-semibold text-foreground">Nuevo correo</h2>
            <button type="button" onClick={onClose} className="size-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-accent transition-colors">
              <X className="size-4" />
            </button>
          </div>

          {/* Plantillas */}
          <div className="px-6 py-3 border-b border-border shrink-0">
            <button
              type="button"
              onClick={() => setShowTemplates((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className={`size-3.5 transition-transform ${showTemplates ? "rotate-180" : ""}`} />
              Plantilla: {EMAIL_TEMPLATES.find((t) => t.id === templateId)?.label ?? "En blanco"}
            </button>
            {showTemplates && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {EMAIL_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl.id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                      templateId === tpl.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                    }`}
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Campos destinatario y asunto */}
          <div className="divide-y divide-border shrink-0">
            <div className="flex items-center gap-3 px-6 py-3">
              <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">Para</span>
              <input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="destinatario@email.com"
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
                autoFocus={!defaultTo}
              />
            </div>
            <div className="flex items-center gap-3 px-6 py-3">
              <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">Asunto</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="(sin asunto)"
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
              />
            </div>
          </div>

          {/* Cuerpo */}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escribe tu mensaje aquí…"
            className="flex-1 resize-none px-6 py-4 text-sm text-foreground bg-transparent outline-none placeholder:text-muted-foreground/50 overflow-auto min-h-0"
          />

          {/* Vista previa firma (oculta en móvil para dejar más sitio al mensaje) */}
          <div className="hidden sm:block px-6 py-3 border-t border-border bg-muted/30 shrink-0">
            <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
              {SIGNATURE_TEXT}
            </pre>
          </div>

          {/* IA para redactar */}
          <div className="px-6 py-3 border-t border-border bg-muted/20 shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") generateWithAI(); }}
                placeholder='Pide a la IA: "redacta un presupuesto para vaciado de 80m²" o "mejora el tono"…'
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={generateWithAI}
                disabled={aiLoading || !aiPrompt.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 text-primary px-3 py-2 text-xs font-medium hover:bg-primary/20 disabled:opacity-50 transition-colors"
              >
                {aiLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                IA
              </button>
            </div>
          </div>

          {/* Adjuntos */}
          <div className="px-6 py-3 border-t border-border shrink-0">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent cursor-pointer transition-colors">
                <Paperclip className="size-3.5" />
                Adjuntar archivo
                <input type="file" multiple className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={loadCrmDocs}
                  disabled={loadingDocs}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors"
                >
                  {loadingDocs ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
                  Adjuntar factura/presupuesto
                </button>
                {showDocPicker && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowDocPicker(false)} />
                    <div className="absolute bottom-full left-0 mb-1 z-50 w-72 max-h-64 overflow-auto rounded-xl border border-border bg-popover shadow-lg py-1">
                      {crmDocs.map((d) => (
                        <button
                          key={`${d.type}-${d.id}`}
                          type="button"
                          onClick={() => attachCrmDoc(d)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-left hover:bg-accent transition-colors"
                        >
                          <FileText className={`size-3.5 shrink-0 ${d.type === "factura" ? "text-emerald-600" : "text-blue-600"}`} />
                          <span className="truncate">{d.label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {attachments.map((att, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs">
                  <FileText className="size-3.5 text-muted-foreground" />
                  <span className="max-w-[160px] truncate">{att.filename}</span>
                  <span className="text-muted-foreground">{att.size < 1024*1024 ? `${(att.size/1024).toFixed(0)} KB` : `${(att.size/1024/1024).toFixed(1)} MB`}</span>
                  <button type="button" onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-500">
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Pie envío */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border shrink-0">
            {error && <p className="text-xs text-red-500">{error}</p>}
            {sent && <p className="text-xs text-emerald-600 font-medium">✓ Enviado</p>}
            {!error && !sent && <span />}
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || sent}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {sending ? "Enviando…" : sent ? "Enviado" : "Enviar"}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
