import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getNotificationSettings, updateSettings } from "@/lib/admin/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const fetchSettings = useServerFn(getNotificationSettings);
  const update = useServerFn(updateSettings);
  const qc = useQueryClient();

  const { data } = useQuery({ queryKey: ["notification-settings"], queryFn: () => fetchSettings() });
  const s = data?.settings;

  async function set(field: string, value: boolean) {
    try {
      await update({ data: { [field]: value } });
      qc.invalidateQueries({ queryKey: ["notification-settings"] });
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    }
  }

  return (
    <div>
      <PageHeader title="Notificaciones" description="Recordatorios automáticos a clientes" />

      <Card className="max-w-2xl">
        <CardHeader><CardTitle className="text-base">Recordatorios</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Recordatorio 24h antes</Label>
              <p className="text-xs text-muted-foreground">Se envía un día antes de la cita.</p>
            </div>
            <Switch checked={!!s?.reminder_24h} onCheckedChange={(v) => set("reminder_24h", v)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Recordatorio 1h antes</Label>
              <p className="text-xs text-muted-foreground">Se envía una hora antes de la cita.</p>
            </div>
            <Switch checked={!!s?.reminder_1h} onCheckedChange={(v) => set("reminder_1h", v)} />
          </div>

          <div className="rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>Canal SMS</Label>
                {data?.smsConfigured ? (
                  <Badge variant="secondary">Twilio activo</Badge>
                ) : (
                  <Badge variant="outline">Twilio no configurado</Badge>
                )}
              </div>
              <Switch
                checked={!!s?.sms_enabled}
                disabled={!data?.smsConfigured}
                onCheckedChange={(v) => set("sms_enabled", v)}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              El email se envía siempre. El SMS requiere tener Twilio activado.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
