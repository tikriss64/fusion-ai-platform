import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { FileText, Upload, FileSignature, Receipt, FileCheck, ChevronRight, X, Save } from "lucide-react";

type DocType = string;

type ExtractedField = { key: string; label: string; value: string };

type ProcessedDoc = {
  id: string;
  type: DocType;
  filename: string;
  uploadedAt: string;
  summary: string;
  fields: ExtractedField[];
};

const typeConfig: Record<string, { icon: typeof Receipt; tint: string; bg: string }> = {
  Factura: { icon: Receipt, tint: "text-[hsl(var(--warn))]", bg: "bg-[hsl(var(--warn))]/10" },
  Contrato: { icon: FileSignature, tint: "text-primary", bg: "bg-primary/10" },
  Presupuesto: { icon: FileText, tint: "text-[hsl(var(--ok))]", bg: "bg-[hsl(var(--ok))]/10" },
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

function DocumentosPage() {
  const { t, i18n } = useTranslation();
  const [docs, setDocs] = useState<ProcessedDoc[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [openDoc, setOpenDoc] = useState<ProcessedDoc | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      for (const f of Array.from(files)) {
        const id = `doc-${Date.now()}-${f.name}`;
        // Tarjeta provisional "procesando"
        const pending: ProcessedDoc = {
          id,
          type: "Otro",
          filename: f.name,
          uploadedAt: i18n.language === "fr" ? "À l'instant" : "Ahora",
          summary: i18n.language === "fr" ? "Analyse en cours…" : "Analizando…",
          fields: [],
        };
        setDocs((prev) => [pending, ...prev]);
        try {
          const dataBase64 = await fileToBase64(f);
          const res = await fetch("/api/documents/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mimeType: f.type || "application/octet-stream", dataBase64 }),
          });
          const { result } = (await res.json()) as { result: { docType: string; summary: string; fields: Record<string, string> } | null };
          if (result) {
            const fields: ExtractedField[] = Object.entries(result.fields || {}).map(([k, v]) => ({ key: k, label: k, value: String(v) }));
            setDocs((prev) => prev.map((d) => d.id === id ? { ...d, type: result.docType, summary: result.summary, fields } : d));
          } else {
            setDocs((prev) => prev.map((d) => d.id === id ? { ...d, summary: i18n.language === "fr" ? "Échec de l'analyse" : "No se pudo analizar" } : d));
          }
        } catch {
          setDocs((prev) => prev.map((d) => d.id === id ? { ...d, summary: i18n.language === "fr" ? "Erreur" : "Error" } : d));
        }
      }
    },
    [i18n.language],
  );

  return (
    <AppShell>
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
    </AppShell>
  );
}

function DataDrawer({ doc, onClose, onSave }: { doc: ProcessedDoc; onClose: () => void; onSave: (d: ProcessedDoc) => void }) {
  const { t } = useTranslation();
  const [fields, setFields] = useState(doc.fields);
  const cfg = getCfg(doc.type);
  const Icon = cfg.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border rounded-xl shadow-lg w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
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

        <div className="flex items-center justify-end gap-2 p-4 border-t bg-muted/30">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-md hover:bg-muted">{t("documentos.cancel")}</button>
          <button
            onClick={() => onSave({ ...doc, fields })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Save className="size-4" /> {t("documentos.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/documentos")({
  head: () => ({ meta: [{ title: "Documentos · AI Inbox Assistant" }] }),
  component: DocumentosPage,
});
