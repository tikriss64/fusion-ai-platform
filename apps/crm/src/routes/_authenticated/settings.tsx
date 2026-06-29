import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Upload, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { exportBackup, type BackupFormat } from "@/lib/backup";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ConnectionsSection } from "@/components/inbox/connections-section";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Ajustes — vaciadodepisos.cat" }] }),
  component: SettingsPage,
});

const schema = z.object({
  trade_name: z.string().min(1, "Requerido"),
  legal_name: z.string().optional(),
  tax_id: z.string().optional(),
  address: z.string().optional(),
  postal_code: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  website: z.string().url("URL inválida").optional().or(z.literal("")),
  iban: z.string().optional(),
  bank_name: z.string().optional(),
  default_vat: z.coerce.number().min(0).max(100).optional(),
  google_reviews_url: z.string().url("URL inválida").optional().or(z.literal("")),
  trustpilot_url: z.string().url("URL inválida").optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

const FIELDS: Array<{ name: keyof FormValues; label: string; type?: string; group: string }> = [
  { name: "trade_name", label: "Nombre comercial", group: "Empresa" },
  { name: "legal_name", label: "Razón social", group: "Empresa" },
  { name: "tax_id", label: "NIF / CIF", group: "Empresa" },
  { name: "phone", label: "Teléfono", group: "Empresa" },
  { name: "email", label: "Email", type: "email", group: "Empresa" },
  { name: "website", label: "Web", type: "url", group: "Empresa" },
  { name: "address", label: "Dirección", group: "Dirección fiscal" },
  { name: "postal_code", label: "Código postal", group: "Dirección fiscal" },
  { name: "city", label: "Ciudad", group: "Dirección fiscal" },
  { name: "province", label: "Provincia", group: "Dirección fiscal" },
  { name: "country", label: "País", group: "Dirección fiscal" },
  { name: "iban", label: "IBAN", group: "Facturación" },
  { name: "bank_name", label: "Banco", group: "Facturación" },
  { name: "default_vat", label: "IVA por defecto (%)", type: "number", group: "Facturación" },
  { name: "google_reviews_url", label: "URL reseñas Google", type: "url", group: "Reseñas" },
  { name: "trustpilot_url", label: "URL reseñas Trustpilot", type: "url", group: "Reseñas" },
];

function SettingsPage() {
  const { isAdmin, user } = useAuth();
  const [rowId, setRowId] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [groqKey,    setGroqKey]    = useState(() => { try { return localStorage.getItem("groq_api_key")   ?? ""; } catch { return ""; } });
  const [geminiKey,  setGeminiKey]  = useState(() => { try { return localStorage.getItem("gemini_api_key") ?? ""; } catch { return ""; } });
  const [savedMsg,   setSavedMsg]   = useState("");

  const saveKeys = () => {
    localStorage.setItem("groq_api_key",   groqKey);
    localStorage.setItem("gemini_api_key", geminiKey);
    setSavedMsg("✓ Claves guardadas en este dispositivo");
    setTimeout(() => setSavedMsg(""), 3000);
  };

  const [backingUp, setBackingUp] = useState(false);
  const [backupMsg, setBackupMsg] = useState("");
  const doBackup = async (format: BackupFormat) => {
    setBackingUp(true);
    setBackupMsg("Generando copia de seguridad…");
    try {
      const { ok, resumen } = await exportBackup(format);
      if (ok) {
        setBackupMsg(`✓ Copia descargada — ${resumen}`);
        toast.success("Copia de seguridad descargada");
      } else {
        setBackupMsg(`Error: ${resumen}`);
        toast.error(resumen);
      }
    } catch (e: any) {
      setBackupMsg(`Error: ${e.message ?? "no se pudo generar la copia"}`);
      toast.error("No se pudo generar la copia de seguridad. Inténtalo de nuevo.");
    } finally {
      setBackingUp(false);
    }
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { country: "España", default_vat: 21 },
  });

  useEffect(() => {
    void supabase.from("company_settings").select("*").maybeSingle().then(({ data, error }) => {
      if (error) toast.error(error.message);
      if (data) {
        setRowId(data.id);
        setLogoUrl(data.logo_url);
        form.reset({
          trade_name: data.trade_name ?? "",
          legal_name: data.legal_name ?? "",
          tax_id: data.tax_id ?? "",
          address: data.address ?? "",
          postal_code: data.postal_code ?? "",
          city: data.city ?? "",
          province: data.province ?? "",
          country: data.country ?? "España",
          phone: data.phone ?? "",
          email: data.email ?? "",
          website: data.website ?? "",
          iban: data.iban ?? "",
          bank_name: data.bank_name ?? "",
          default_vat: data.default_vat ?? 21,
          google_reviews_url: data.google_reviews_url ?? "",
          trustpilot_url: data.trustpilot_url ?? "",
        });
      }
      setLoading(false);
    });
  }, [form]);

  const onSubmit = async (values: FormValues) => {
    const n = (v: string | undefined) => (v === undefined || v === "" ? null : v);
    const payload = {
      trade_name: values.trade_name,
      legal_name: n(values.legal_name),
      tax_id: n(values.tax_id),
      address: n(values.address),
      postal_code: n(values.postal_code),
      city: n(values.city),
      province: n(values.province),
      country: n(values.country),
      phone: n(values.phone),
      email: n(values.email),
      website: n(values.website),
      iban: n(values.iban),
      bank_name: n(values.bank_name),
      default_vat: values.default_vat ?? null,
      google_reviews_url: n(values.google_reviews_url),
      trustpilot_url: n(values.trustpilot_url),
    };

    if (rowId) {
      const { error } = await supabase.from("company_settings").update(payload).eq("id", rowId);
      if (error) { toast.error(error.message); return; }
    } else {
      if (!user) return;
      const { data, error } = await supabase
        .from("company_settings")
        .insert({ ...payload, user_id: user.id } as any)
        .select("id")
        .single();
      if (error) { toast.error(error.message); return; }
      if (data) setRowId(data.id);
    }
    toast.success("Datos guardados");
  };

  const onLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !rowId) return;
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = `public/logo.${ext}`;
    const { error: upErr } = await supabase.storage.from("company-assets").upload(path, file, {
      upsert: true,
      contentType: file.type,
    });
    if (upErr) {
      setUploading(false);
      toast.error(upErr.message);
      return;
    }
    const { data: pub } = supabase.storage.from("company-assets").getPublicUrl(path);
    const { error: updErr } = await supabase
      .from("company_settings")
      .update({ logo_url: pub.publicUrl })
      .eq("id", rowId);
    setUploading(false);
    if (updErr) {
      toast.error(updErr.message);
      return;
    }
    setLogoUrl(pub.publicUrl);
    toast.success("Logo actualizado");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const groups = Array.from(new Set(FIELDS.map((f) => f.group)));

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
        <p className="text-sm text-muted-foreground">
          Datos de tu empresa. Se usarán en presupuestos, facturas y comunicaciones.
        </p>
        {!isAdmin && (
          <p className="mt-2 text-sm text-destructive">Solo los administradores pueden modificar estos datos.</p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>PNG o SVG con fondo transparente, idealmente cuadrado.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-6">
          <div className="h-20 w-20 rounded-lg border bg-muted flex items-center justify-center overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
            ) : (
              <span className="text-xs text-muted-foreground">Sin logo</span>
            )}
          </div>
          <label>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onLogoUpload}
              disabled={!isAdmin || uploading}
            />
            <Button type="button" variant="outline" disabled={!isAdmin || uploading} asChild>
              <span>
                {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                Subir logo
              </span>
            </Button>
          </label>
        </CardContent>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {groups.map((group) => (
            <Card key={group}>
              <CardHeader>
                <CardTitle>{group}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  {FIELDS.filter((f) => f.group === group).map((f) => (
                    <FormField
                      key={f.name}
                      control={form.control}
                      name={f.name}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{f.label}</FormLabel>
                          <FormControl>
                            <Input
                              type={f.type ?? "text"}
                              {...field}
                              value={field.value ?? ""}
                              disabled={!isAdmin}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="flex justify-end">
            <Button type="submit" disabled={!isAdmin || form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Guardar cambios
            </Button>
          </div>
        </form>
      </Form>

      <Card>
        <CardHeader>
          <CardTitle>Asistente IA</CardTitle>
          <CardDescription>
            Configura una o ambas claves. El asistente usa Gemini como motor principal (ilimitado gratis)
            y Groq como respaldo automático. Las claves se guardan solo en este dispositivo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md space-y-1">
            <label className="text-sm font-medium">
              Gemini API Key{" "}
              <span className="text-xs font-normal text-muted-foreground">(motor principal — ilimitado gratis)</span>
            </label>
            <p className="text-xs text-muted-foreground">
              Consíguela en{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="underline">aistudio.google.com</a>
              {" "}con una cuenta Gmail personal (no Workspace).
            </p>
            <Input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIza…"
              className="font-mono text-sm"
            />
          </div>
          <div className="max-w-md space-y-1">
            <label className="text-sm font-medium">
              Groq API Key{" "}
              <span className="text-xs font-normal text-muted-foreground">(respaldo — 100k tokens/día gratis)</span>
            </label>
            <p className="text-xs text-muted-foreground">
              Consíguela en{" "}
              <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="underline">console.groq.com</a>
            </p>
            <Input
              type="password"
              value={groqKey}
              onChange={(e) => setGroqKey(e.target.value)}
              placeholder="gsk_…"
              className="font-mono text-sm"
            />
          </div>
          <div className="max-w-md flex items-center gap-3">
            <Button type="button" variant="outline" onClick={saveKeys}>
              Guardar claves
            </Button>
            {savedMsg && <p className="text-sm text-green-600">{savedMsg}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bandeja IA — Correo y conexiones</CardTitle>
          <CardDescription>
            Conecta tu Gmail para que los correos entren en la Bandeja, y comprueba el estado de
            la IA y de la memoria. Para conectar Gmail necesitas haber configurado las credenciales
            de Google en el servidor (mira la guía «Conectar Gmail»).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectionsSection />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Copia de seguridad</CardTitle>
          <CardDescription>
            Descarga una copia completa de todos tus datos (clientes, presupuestos, facturas,
            pagos, trabajos y leads). Guárdala periódicamente en tu ordenador o en la nube.
            Recomendado: una copia al mes como mínimo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" disabled={backingUp} onClick={() => doBackup("csv")}>
              {backingUp ? <Loader2 className="animate-spin" /> : <Download />}
              Exportar a Excel (CSV)
            </Button>
            <Button type="button" variant="outline" disabled={backingUp} onClick={() => doBackup("json")}>
              {backingUp ? <Loader2 className="animate-spin" /> : <Download />}
              Exportar a JSON (restaurable)
            </Button>
          </div>
          {backupMsg && <p className="text-sm text-muted-foreground">{backupMsg}</p>}
          <p className="text-xs text-muted-foreground">
            CSV: para abrir en Excel y revisar. JSON: copia técnica íntegra para restaurar si hiciera falta.
            Supabase además guarda backups automáticos diarios de los últimos 7 días.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}