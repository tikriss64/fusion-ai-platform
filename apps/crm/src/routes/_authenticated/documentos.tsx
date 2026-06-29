import { apiFetch } from "@/components/inbox/api-client";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/inbox/page-header";
import { FileText, Upload, FileSignature, Receipt, FileCheck, ChevronRight, X, Save, Receipt as ReceiptIcon, UserPlus, Loader2, Search } from "lucide-react";

type DocType = string;

type ExtractedField = { key: string; label: string; value: string };

type ProcessedDoc = {
  id: string;
  type: DocType;
  filename: string;
  uploadedAt: string;
  summary: string;
  fields: ExtractedField[];
  // Se retiene SOLO en memoria (no se persiste en localStorage por tamaño) para
  // poder adjuntar el archivo a un cliente en la misma sesión.
  fileBase64?: string;
  mimeType?: string;
};

// Convierte base64 → bytes para subir a Supabase Storage.
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

const typeConfig: Record<string, { icon: typeof Receipt; tint: string; bg: string }> = {
  Factura: { icon: Receipt, tint: "text-warn", bg: "bg-warn/10" },
  Contrato: { icon: FileSignature, tint: "text-primary", bg: "bg-primary/10" },
  Presupuesto: { icon: FileText, tint: "text-ok", bg: "bg-ok/10" },
  CV: { icon: FileCheck, tint: "text-muted-foreground", bg: "bg-muted" },
};
const defaultCfg = { icon: FileText, tint: "text-muted-foreground", bg: "bg-muted" };
const getCfg = (type: string) => typeConfig[type] ?? defaultCfg;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? ""); // quita el prefijo data:...;base64,
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const STORAGE_KEY = "documentos.procesados";

function DocumentosPage() {
  const { t, i18n } = useTranslation();
  // Persistencia en el dispositivo: los documentos procesados se guardan para que
  // NO se pierdan al recargar o cambiar de página.
  const [docs, setDocs] = useState<ProcessedDoc[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as ProcessedDoc[]) : [];
    } catch { return []; }
  });
  const [dragOver, setDragOver] = useState(false);
  const [openDoc, setOpenDoc] = useState<ProcessedDoc | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Guarda los documentos ya analizados (ignora los que están "Analizando…").
  // Se quita fileBase64/mimeType: son pesados y solo hacen falta en la sesión actual.
  useEffect(() => {
    try {
      const stable = docs
        .filter((d) => d.fields.length > 0 || (d.summary && !/Analizando|Analyse/i.test(d.summary)))
        .map((d) => { const c = { ...d }; delete c.fileBase64; delete c.mimeType; return c; });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stable));
    } catch {}
  }, [docs]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      for (const f of Array.from(files)) {
        const id = `doc-${Date.now()}-${f.name}`;
        const dataBase64 = await fileToBase64(f);
        // Tarjeta provisional "procesando"
        const pending: ProcessedDoc = {
          id,
          type: "Otro",
          filename: f.name,
          uploadedAt: i18n.language === "fr" ? "À l'instant" : "Ahora",
          summary: i18n.language === "fr" ? "Analyse en cours…" : "Analizando…",
          fields: [],
          fileBase64: dataBase64,
          mimeType: f.type || "application/octet-stream",
        };
        setDocs((prev) => [pending, ...prev]);
        try {
          const res = await apiFetch("/api/documents/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mimeType: f.type || "application/octet-stream", dataBase64 }),
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            let summary = i18n.language === "fr" ? "Erreur serveur" : "Error del servidor";
            if (res.status === 400 || errText.includes("GEMINI") || errText.includes("clave") || errText.includes("Configura")) {
              summary = i18n.language === "fr" ? "Clé IA non configurée" : "Clave IA no configurada — ve a Ajustes";
            }
            setDocs((prev) => prev.map((d) => d.id === id ? { ...d, summary } : d));
            continue;
          }
          const { result } = (await res.json()) as { result: { docType: string; summary: string; fields: Record<string, string> } | null };
          if (result) {
            const fields: ExtractedField[] = Object.entries(result.fields || {}).map(([k, v]) => ({ key: k, label: k, value: String(v) }));
            setDocs((prev) => prev.map((d) => d.id === id ? { ...d, type: result.docType, summary: result.summary, fields } : d));
          } else {
            setDocs((prev) => prev.map((d) => d.id === id ? { ...d, summary: i18n.language === "fr" ? "Clé IA non configurée" : "Clave IA no configurada — ve a Ajustes" } : d));
          }
        } catch {
          setDocs((prev) => prev.map((d) => d.id === id ? { ...d, summary: i18n.language === "fr" ? "Erreur réseau" : "Error de red — servidor no disponible" } : d));
        }
      }
    },
    [i18n.language],
  );

  return (
    <>
      <div className="max-w-5xl mx-auto">
        <PageHeader icon={FileText} title={t("documentos.title")} subtitle={t("documentos.subtitle")} />
        <div className="space-y-6">

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
          }`}
        >
          <div className="mx-auto size-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <Upload className="size-6 text-primary" />
          </div>
          <p className="font-medium">{t("documentos.dropTitle")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("documentos.dropSub")}</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,image/*"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">{t("documentos.processed")}</h2>
          <div className="grid gap-3">
            {docs.map((doc) => {
              const cfg = getCfg(doc.type);
              const Icon = cfg.icon;
              return (
                <div
                  key={doc.id}
                  className="group rounded-xl border bg-card p-4 flex items-center gap-4 hover:border-primary/40 transition-colors"
                >
                  <div className={`size-14 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`size-6 ${cfg.tint}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.tint}`}>
                        {t(`documentos.types.${doc.type}`, { defaultValue: doc.type })}
                      </span>
                      <span className="text-xs text-muted-foreground">{doc.uploadedAt}</span>
                    </div>
                    <div className="font-medium truncate">{doc.summary}</div>
                    <div className="text-xs text-muted-foreground truncate">{doc.filename}</div>
                  </div>
                  <button
                    onClick={() => setOpenDoc(doc)}
                    className="shrink-0 inline-flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-md border hover:bg-muted transition-colors"
                  >
                    {t("documentos.viewData")} <ChevronRight className="size-4" />
                  </button>
                  <button
                    onClick={() => setDocs((prev) => prev.filter((d) => d.id !== doc.id))}
                    title={i18n.language === "fr" ? "Supprimer" : "Eliminar"}
                    className="shrink-0 size-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        </div>
      </div>

      {openDoc && (
        <DataDrawer
          doc={openDoc}
          onClose={() => setOpenDoc(null)}
          onSave={(d) => {
            setDocs((prev) => prev.map((x) => (x.id === d.id ? d : x)));
            setOpenDoc(null);
          }}
        />
      )}
    </>
  );
}

function DataDrawer({ doc, onClose, onSave }: { doc: ProcessedDoc; onClose: () => void; onSave: (d: ProcessedDoc) => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [fields, setFields] = useState(doc.fields);
  const cfg = getCfg(doc.type);
  const Icon = cfg.icon;
  const fr = i18n.language === "fr";

  // Helpers para mapear los campos extraídos.
  const fieldVal = (keys: string[]): string | undefined =>
    fields.find((f) => keys.some((k) => (f.label || f.key).toLowerCase().includes(k)))?.value;
  const toNumber = (s: string | undefined): number => {
    if (!s) return 0;
    const cleaned = String(s).replace(/[^0-9.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  };

  // ── Acción: crear una factura con los datos extraídos ──────────────────────
  const crearFactura = () => {
    const importe = toNumber(fieldVal(["total", "importe", "monto", "precio"]));
    const cliente = fieldVal(["cliente", "client", "nombre", "razón", "razon", "emisor", "proveedor"]);
    const concepto = fieldVal(["concepto", "descripción", "descripcion", "detalle"]) || doc.summary;
    navigate({ to: "/invoices" });
    setTimeout(() => window.dispatchEvent(new CustomEvent("assistant:createInvoice", {
      detail: { cliente_nombre: cliente, concepto, importe },
    })), 350);
  };

  // ── Acción: adjuntar el archivo a la ficha de un cliente ───────────────────
  const [picking, setPicking] = useState(false);
  const [clients, setClients] = useState<{ id: string; nombre: string; poblacion: string | null }[]>([]);
  const [clientQuery, setClientQuery] = useState("");
  const [loadingClients, setLoadingClients] = useState(false);
  const [uploading, setUploading] = useState(false);

  const startAttach = async () => {
    setPicking(true);
    if (clients.length === 0) {
      setLoadingClients(true);
      const { data } = await supabase.from("clients").select("id, nombre, poblacion").order("nombre");
      setClients((data ?? []) as any);
      setLoadingClients(false);
    }
  };

  const attachToClient = async (clientId: string, clientName: string) => {
    if (!doc.fileBase64) return;
    setUploading(true);
    try {
      // Supabase Storage solo admite ciertos caracteres en la clave: quitamos
      // acentos y sustituimos cualquier carácter raro (espacios, guiones Unicode…)
      // por "_" para evitar el error "Invalid key".
      const safeName = (doc.filename || "documento")
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/_+/g, "_");
      const path = `${clientId}/${Date.now()}__${safeName}`;
      const { error } = await supabase.storage.from("client-docs").upload(
        path, b64ToBytes(doc.fileBase64),
        { contentType: doc.mimeType || "application/octet-stream", upsert: false },
      );
      if (error) {
        toast.error(
          /bucket|not found|exist/i.test(error.message)
            ? (fr ? "Le stockage 'client-docs' n'est pas encore configuré (voir l'admin)." : "El almacén 'client-docs' aún no está configurado. Avísame para activarlo.")
            : `${fr ? "Erreur" : "Error"}: ${error.message}`,
        );
        return;
      }
      toast.success(fr ? `Joint à la fiche de ${clientName}.` : `Adjuntado a la ficha de ${clientName}.`);
      setPicking(false);
      onClose();
    } finally {
      setUploading(false);
    }
  };

  const filteredClients = clients.filter((c) =>
    c.nombre.toLowerCase().includes(clientQuery.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-card border rounded-xl shadow-lg w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-4 border-b">
          <div className={`size-10 rounded-lg ${cfg.bg} flex items-center justify-center`}>
            <Icon className={`size-5 ${cfg.tint}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{doc.filename}</div>
            <div className="text-xs text-muted-foreground">
              {t("documentos.extracted", { type: t(`documentos.types.${doc.type}`, { defaultValue: doc.type }) })}
            </div>
          </div>
          <button onClick={onClose} className="size-8 rounded-md hover:bg-muted flex items-center justify-center">
            <X className="size-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          <table className="w-full text-sm">
            <tbody>
              {fields.map((f, idx) => (
                <tr key={f.key} className="border-b last:border-0">
                  <td className="py-2 pr-3 text-muted-foreground w-1/3 align-top">{f.label}</td>
                  <td className="py-2">
                    <input
                      value={f.value}
                      onChange={(e) => setFields((prev) => prev.map((x, i) => i === idx ? { ...x, value: e.target.value } : x))}
                      className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none py-1"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Acciones reales con los datos del documento */}
        <div className="flex flex-wrap items-center gap-2 p-4 border-t bg-muted/30">
          <button
            onClick={crearFactura}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-primary/40 text-primary hover:bg-primary/10"
          >
            <ReceiptIcon className="size-4" /> {fr ? "Créer une facture" : "Crear factura"}
          </button>
          <button
            onClick={startAttach}
            disabled={!doc.fileBase64}
            title={doc.fileBase64 ? "" : (fr ? "Re-téléverse le fichier pour le joindre" : "Vuelve a subir el archivo para poder adjuntarlo")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border hover:bg-muted disabled:opacity-50"
          >
            <UserPlus className="size-4" /> {fr ? "Joindre à un client" : "Adjuntar a un cliente"}
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-md hover:bg-muted">{t("documentos.cancel")}</button>
            <button
              onClick={() => onSave({ ...doc, fields })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Save className="size-4" /> {t("documentos.save")}
            </button>
          </div>
        </div>

        {/* Selector de cliente para adjuntar */}
        {picking && (
          <div className="absolute inset-0 z-10 flex flex-col bg-card rounded-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 p-4 border-b">
              <div className="flex-1 min-w-0">
                <div className="font-medium">{fr ? "Choisir un client" : "Elegir cliente"}</div>
                <div className="text-xs text-muted-foreground truncate">{doc.filename}</div>
              </div>
              <button onClick={() => setPicking(false)} className="size-8 rounded-md hover:bg-muted flex items-center justify-center">
                <X className="size-4" />
              </button>
            </div>
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  autoFocus
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                  placeholder={fr ? "Rechercher un client…" : "Buscar cliente…"}
                  className="w-full rounded-md border bg-background pl-8 pr-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {loadingClients ? (
                <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
              ) : filteredClients.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{fr ? "Aucun client." : "Sin clientes."}</p>
              ) : (
                filteredClients.map((c) => (
                  <button
                    key={c.id}
                    disabled={uploading}
                    onClick={() => attachToClient(c.id, c.nombre)}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                  >
                    <span className="flex-1 truncate">{c.nombre}</span>
                    {c.poblacion && <span className="text-xs text-muted-foreground">{c.poblacion}</span>}
                  </button>
                ))
              )}
            </div>
            {uploading && (
              <div className="p-3 border-t text-center text-sm text-muted-foreground">
                <Loader2 className="inline size-4 animate-spin mr-1.5" /> {fr ? "Envoi…" : "Subiendo…"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/documentos")({
  head: () => ({ meta: [{ title: "Documentos · AI Inbox Assistant" }] }),
  component: DocumentosPage,
});
