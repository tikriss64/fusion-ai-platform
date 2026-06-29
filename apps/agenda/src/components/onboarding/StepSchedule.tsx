import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import {
  WEEKDAYS,
  type BusinessHours,
  type ScheduleException,
} from "@/lib/onboarding/constants";

interface Props {
  hours: BusinessHours;
  exceptions: ScheduleException[];
  onHoursChange: (h: BusinessHours) => void;
  onExceptionsChange: (e: ScheduleException[]) => void;
  onNext: () => void;
  onBack: () => void;
  saving: boolean;
}

export function StepSchedule({
  hours,
  exceptions,
  onHoursChange,
  onExceptionsChange,
  onNext,
  onBack,
  saving,
}: Props) {
  const setDay = (key: string, patch: Partial<BusinessHours[keyof BusinessHours]>) =>
    onHoursChange({ ...hours, [key]: { ...hours[key as keyof BusinessHours], ...patch } });

  const addException = () =>
    onExceptionsChange([
      ...exceptions,
      {
        id: crypto.randomUUID(),
        type: "holiday",
        label: "",
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date().toISOString().slice(0, 10),
      },
    ]);
  const updateException = (id: string, patch: Partial<ScheduleException>) =>
    onExceptionsChange(exceptions.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const removeException = (id: string) =>
    onExceptionsChange(exceptions.filter((e) => e.id !== id));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Horarios</h2>
        <p className="text-sm text-muted-foreground">Define tus días laborables y excepciones.</p>
      </div>

      <div className="space-y-2">
        {WEEKDAYS.map(({ key, label }) => {
          const day = hours[key];
          return (
            <div key={key} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
              <div className="flex w-32 items-center gap-2">
                <Switch checked={day.enabled} onCheckedChange={(v) => setDay(key, { enabled: v })} />
                <span className="text-sm font-medium text-foreground">{label}</span>
              </div>
              {day.enabled ? (
                <div className="flex items-center gap-2">
                  <Input type="time" className="w-32" value={day.open} onChange={(e) => setDay(key, { open: e.target.value })} />
                  <span className="text-muted-foreground">—</span>
                  <Input type="time" className="w-32" value={day.close} onChange={(e) => setDay(key, { close: e.target.value })} />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Cerrado</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base">Excepciones (festivos y vacaciones)</Label>
          <Button variant="outline" size="sm" onClick={addException}>
            <Plus className="mr-1 h-4 w-4" /> Añadir
          </Button>
        </div>
        {exceptions.map((ex) => (
          <div key={ex.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select value={ex.type} onValueChange={(v) => updateException(ex.id, { type: v as ScheduleException["type"] })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="holiday">Festivo</SelectItem>
                  <SelectItem value="vacation">Vacaciones</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">Descripción</Label>
              <Input value={ex.label} onChange={(e) => updateException(ex.id, { label: e.target.value })} placeholder="Navidad" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={ex.startDate} onChange={(e) => updateException(ex.id, { startDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={ex.endDate} onChange={(e) => updateException(ex.id, { endDate: e.target.value })} />
            </div>
            <Button variant="ghost" size="icon" onClick={() => removeException(ex.id)} aria-label="Eliminar">
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>Atrás</Button>
        <Button onClick={onNext} disabled={saving}>{saving ? "Guardando…" : "Continuar"}</Button>
      </div>
    </div>
  );
}
