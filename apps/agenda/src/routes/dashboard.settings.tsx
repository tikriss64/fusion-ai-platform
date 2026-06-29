import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import {
  getTenantSettings,
  updateSettings,
  openBillingPortal,
} from "@/lib/admin/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const fetchSettings = useServerFn(getTenantSettings);
  const update = useServerFn(updateSettings);
  const portal = useServerFn(openBillingPortal);
  const qc = useQueryClient();

  const { data } = useQuery({ queryKey: ["tenant-settings"], queryFn: () => fetchSettings() });
  const [form, setForm] = useState<any>(null);

  useEffect(() => {
    if (data?.settings && !form) setForm(data.settings);
  }, [data, form]);

  const publicUrl = data?.tenant?.slug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/book/${data.tenant.slug}`
    : "";

  async function save() {
    try {
      await update({
        data: {
          color_primario: form.color_primario,
          color_secundario: form.color_secundario,
          logo_url: form.logo_url || null,
          idioma_panel: form.idioma_panel,
          politica_cancelacion_horas: Number(form.politica_cancelacion_horas) || 0,
          politica_cancelacion_penalizacion: Number(form.politica_cancelacion_penalizacion) || 0,
        },
      });
      toast.success("Configuración guardada");
      qc.invalidateQueries({ queryKey: ["tenant-settings"] });
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    }
  }

  async function manageSubscription() {
    const res = await portal();
    if (!res.configured) {
      toast.info("El portal de suscripción se activará al conectar Stripe.");
      return;
    }
    if (res.url) window.location.href = res.url;
  }

  function copyUrl() {
    navigator.clipboard.writeText(publicUrl);
    toast.success("URL copiada");
  }

  if (!form) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div>
      <PageHeader title="Configuración" description="Marca, políticas y suscripción" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Marca</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label className="text-xs">Logo (URL)</Label><Input value={form.logo_url ?? ""} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Color primario</Label><Input type="color" value={form.color_primario ?? "#6366f1"} onChange={(e) => setForm({ ...form, color_primario: e.target.value })} /></div>
              <div><Label className="text-xs">Color secundario</Label><Input type="color" value={form.color_secundario ?? "#a855f7"} onChange={(e) => setForm({ ...form, color_secundario: e.target.value })} /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Política de cancelación</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label className="text-xs">Horas mínimas de antelación</Label><Input type="number" value={form.politica_cancelacion_horas ?? 24} onChange={(e) => setForm({ ...form, politica_cancelacion_horas: e.target.value })} /></div>
            <div><Label className="text-xs">Penalización (€)</Label><Input type="number" step="0.01" value={form.politica_cancelacion_penalizacion ?? 0} onChange={(e) => setForm({ ...form, politica_cancelacion_penalizacion: e.target.value })} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Idioma del panel</CardTitle></CardHeader>
          <CardContent>
            <Select value={form.idioma_panel ?? "es"} onValueChange={(v) => setForm({ ...form, idioma_panel: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">URL pública</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input readOnly value={publicUrl} />
              <Button variant="outline" size="icon" onClick={copyUrl}><Copy className="h-4 w-4" /></Button>
            </div>
            {publicUrl && (
              <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ExternalLink className="h-3.5 w-3.5" /> Abrir página de reservas
              </a>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Plan de suscripción</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="capitalize">{data?.tenant?.plan ?? "trial"}</Badge>
              <span className="text-sm text-muted-foreground capitalize">
                {data?.subscription?.estado ?? "trial"}
              </span>
            </div>
            <Button variant="outline" onClick={manageSubscription}>Gestionar / cambiar plan</Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Button onClick={save}>Guardar cambios</Button>
      </div>
    </div>
  );
}
