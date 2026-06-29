import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";

export interface ProfessionalDraft {
  nombre: string;
  email: string;
  servicios_asignados: string[];
}
export interface ResourceDraft {
  nombre: string;
  tipo: "sala" | "equipo";
  capacidad: number;
}

interface Props {
  professionals: ProfessionalDraft[];
  resources: ResourceDraft[];
  availableServices: { id: string; nombre: string; color: string | null }[];
  onProfessionalsChange: (p: ProfessionalDraft[]) => void;
  onResourcesChange: (r: ResourceDraft[]) => void;
  onFinish: () => void;
  onBack: () => void;
  saving: boolean;
}

export function StepTeam({
  professionals,
  resources,
  availableServices,
  onProfessionalsChange,
  onResourcesChange,
  onFinish,
  onBack,
  saving,
}: Props) {
  const addPro = () =>
    onProfessionalsChange([...professionals, { nombre: "", email: "", servicios_asignados: [] }]);
  const updatePro = (i: number, patch: Partial<ProfessionalDraft>) =>
    onProfessionalsChange(professionals.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const removePro = (i: number) => onProfessionalsChange(professionals.filter((_, idx) => idx !== i));
  const toggleService = (i: number, sid: string) => {
    const cur = professionals[i].servicios_asignados;
    updatePro(i, {
      servicios_asignados: cur.includes(sid) ? cur.filter((x) => x !== sid) : [...cur, sid],
    });
  };

  const addRes = () => onResourcesChange([...resources, { nombre: "", tipo: "sala", capacidad: 1 }]);
  const updateRes = (i: number, patch: Partial<ResourceDraft>) =>
    onResourcesChange(resources.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRes = (i: number) => onResourcesChange(resources.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Profesionales y salas</h2>
        <p className="text-sm text-muted-foreground">Añade quién atiende y dónde.</p>
      </div>

      <div className="space-y-3">
        <Label className="text-base">Profesionales</Label>
        {professionals.map((p, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Nombre</Label>
                    <Input value={p.nombre} onChange={(e) => updatePro(i, { nombre: e.target.value })} placeholder="Ana García" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input type="email" value={p.email} onChange={(e) => updatePro(i, { email: e.target.value })} placeholder="ana@negocio.com" />
                  </div>
                </div>
                {availableServices.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Servicios que realiza</Label>
                    <div className="flex flex-wrap gap-3">
                      {availableServices.map((s) => (
                        <label key={s.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={p.servicios_asignados.includes(s.id)}
                            onCheckedChange={() => toggleService(i, s.id)}
                          />
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color ?? "#6366f1" }} />
                            {s.nombre}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={() => removePro(i)} aria-label="Eliminar">
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
        ))}
        <Button variant="outline" onClick={addPro} className="w-full">
          <Plus className="mr-2 h-4 w-4" /> Añadir profesional
        </Button>
      </div>

      <div className="space-y-3">
        <Label className="text-base">Salas y recursos (opcional)</Label>
        {resources.map((r, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">Nombre</Label>
              <Input value={r.nombre} onChange={(e) => updateRes(i, { nombre: e.target.value })} placeholder="Sala 1" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select value={r.tipo} onValueChange={(v) => updateRes(i, { tipo: v as ResourceDraft["tipo"] })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sala">Sala</SelectItem>
                  <SelectItem value="equipo">Equipo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-28 space-y-1.5">
              <Label className="text-xs">Capacidad</Label>
              <Input type="number" min={1} value={r.capacidad} onChange={(e) => updateRes(i, { capacidad: Number(e.target.value) })} />
            </div>
            <Button variant="ghost" size="icon" onClick={() => removeRes(i)} aria-label="Eliminar">
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ))}
        <Button variant="outline" onClick={addRes} className="w-full">
          <Plus className="mr-2 h-4 w-4" /> Añadir sala / recurso
        </Button>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>Atrás</Button>
        <Button onClick={onFinish} disabled={saving || professionals.some((p) => !p.nombre.trim())}>
          {saving ? "Finalizando…" : "Finalizar configuración"}
        </Button>
      </div>
    </div>
  );
}
