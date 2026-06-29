import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BUSINESS_TYPES, CURRENCIES, TIMEZONES, slugify } from "@/lib/onboarding/constants";

export interface BusinessForm {
  fullName: string;
  tipoNegocio: string;
  nombreNegocio: string;
  ciudad: string;
  zonaHoraria: string;
  moneda: string;
}

interface Props {
  value: BusinessForm;
  onChange: (v: BusinessForm) => void;
  onNext: () => void;
  saving: boolean;
  lockedSlug?: string | null;
}

export function StepBusiness({ value, onChange, onNext, saving, lockedSlug }: Props) {
  const set = <K extends keyof BusinessForm>(k: K, v: BusinessForm[K]) =>
    onChange({ ...value, [k]: v });

  const slug = lockedSlug ?? (slugify(value.nombreNegocio) || "tu-negocio");
  const valid = value.tipoNegocio && value.nombreNegocio.trim().length > 0 && value.zonaHoraria && value.moneda;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Datos del negocio</h2>
        <p className="text-sm text-muted-foreground">Cuéntanos sobre tu actividad.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Tipo de negocio</Label>
          <Select value={value.tipoNegocio} onValueChange={(v) => set("tipoNegocio", v)}>
            <SelectTrigger><SelectValue placeholder="Elige una opción" /></SelectTrigger>
            <SelectContent>
              {BUSINESS_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Nombre del negocio</Label>
          <Input value={value.nombreNegocio} onChange={(e) => set("nombreNegocio", e.target.value)} placeholder="Estudio Bienestar" />
        </div>
        <div className="space-y-2">
          <Label>Ciudad</Label>
          <Input value={value.ciudad} onChange={(e) => set("ciudad", e.target.value)} placeholder="Madrid" />
        </div>
        <div className="space-y-2">
          <Label>Zona horaria</Label>
          <Select value={value.zonaHoraria} onValueChange={(v) => set("zonaHoraria", v)}>
            <SelectTrigger><SelectValue placeholder="Zona horaria" /></SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (<SelectItem key={tz} value={tz}>{tz}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Moneda</Label>
          <Select value={value.moneda} onValueChange={(v) => set("moneda", v)}>
            <SelectTrigger><SelectValue placeholder="Moneda" /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (<SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <span className="text-muted-foreground">Tu página pública de reservas será:</span>
        <p className="mt-1 font-mono font-medium text-foreground">/book/{slug}</p>
      </div>

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!valid || saving}>
          {saving ? "Guardando…" : "Continuar"}
        </Button>
      </div>
    </div>
  );
}
