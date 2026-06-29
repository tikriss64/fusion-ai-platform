import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus } from "lucide-react";
import { SERVICE_COLORS } from "@/lib/onboarding/constants";
import { cn } from "@/lib/utils";

export interface ServiceDraft {
  nombre: string;
  duracion_min: number;
  precio: number;
  color: string;
  buffer_before_min: number;
  buffer_after_min: number;
}

export function emptyService(): ServiceDraft {
  return {
    nombre: "",
    duracion_min: 60,
    precio: 0,
    color: SERVICE_COLORS[0],
    buffer_before_min: 0,
    buffer_after_min: 10,
  };
}

interface Props {
  services: ServiceDraft[];
  onChange: (s: ServiceDraft[]) => void;
  onNext: () => void;
  onBack: () => void;
  saving: boolean;
}

export function StepServices({ services, onChange, onNext, onBack, saving }: Props) {
  const update = (i: number, patch: Partial<ServiceDraft>) =>
    onChange(services.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const add = () => onChange([...services, emptyService()]);
  const remove = (i: number) => onChange(services.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Crea tus servicios</h2>
        <p className="text-sm text-muted-foreground">
          Define duración, precio y tiempos de preparación y limpieza.
        </p>
      </div>

      {services.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Aún no has añadido servicios. Añade al menos uno para continuar.
        </p>
      )}

      <div className="space-y-4">
        {services.map((s, i) => {
          const total = (s.buffer_before_min || 0) + s.duracion_min + (s.buffer_after_min || 0);
          return (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Nombre</Label>
                      <Input value={s.nombre} onChange={(e) => update(i, { nombre: e.target.value })} placeholder="Masaje relajante" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Color</Label>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {SERVICE_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => update(i, { color: c })}
                            className={cn(
                              "h-6 w-6 rounded-full border-2 transition",
                              s.color === c ? "border-foreground" : "border-transparent",
                            )}
                            style={{ backgroundColor: c }}
                            aria-label={`Color ${c}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label>Duración (min)</Label>
                      <Input type="number" min={1} value={s.duracion_min} onChange={(e) => update(i, { duracion_min: Number(e.target.value) })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Precio</Label>
                      <Input type="number" min={0} step="0.01" value={s.precio} onChange={(e) => update(i, { precio: Number(e.target.value) })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Buffer antes</Label>
                      <Input type="number" min={0} value={s.buffer_before_min} onChange={(e) => update(i, { buffer_before_min: Number(e.target.value) })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Buffer después</Label>
                      <Input type="number" min={0} value={s.buffer_after_min} onChange={(e) => update(i, { buffer_after_min: Number(e.target.value) })} />
                    </div>
                  </div>
                  <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    Ejemplo: {s.nombre || "Servicio"} {s.duracion_min} min
                    {s.buffer_after_min ? ` + ${s.buffer_after_min} min limpieza` : ""}
                    {s.buffer_before_min ? ` + ${s.buffer_before_min} min preparación` : ""} = próximo hueco a los {total} min
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Eliminar">
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Button variant="outline" onClick={add} className="w-full">
        <Plus className="mr-2 h-4 w-4" /> Añadir servicio
      </Button>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>Atrás</Button>
        <Button onClick={onNext} disabled={saving || services.length === 0 || services.some((s) => !s.nombre.trim())}>
          {saving ? "Guardando…" : "Continuar"}
        </Button>
      </div>
    </div>
  );
}
