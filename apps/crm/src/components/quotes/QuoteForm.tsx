import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { formatCurrency } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  quoteSchema,
  type QuoteFormValues,
  type QuoteRow,
  type QuoteItemRow,
  QUOTE_STATUSES,
  QUOTE_STATUS_LABELS,
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  computeTotals,
} from "@/lib/quotes-schema";
import { INVOICE_SERIES } from "@/lib/invoices-schema";
import type { ClientRow } from "@/lib/clients-schema";

type Props = {
  initial?: (QuoteRow & { items: QuoteItemRow[] }) | null;
  clients: ClientRow[];
  defaultVat?: number;
  onSubmit: (values: QuoteFormValues) => Promise<void> | void;
  onCancel: () => void;
  submitLabel?: string;
};

const NONE = "__none__";

export function QuoteForm({ initial, clients, defaultVat = 21, onSubmit, onCancel, submitLabel = "Guardar" }: Props) {
  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      is_template: initial?.is_template ?? false,
      template_name: initial?.template_name ?? "",
      tipo: (initial?.numero && /^[VLP]/i.test(initial.numero) ? initial.numero[0].toUpperCase() : "L") as "V" | "L" | "P",
      client_id: initial?.client_id ?? null,
      fecha: initial?.fecha ?? new Date().toISOString().slice(0, 10),
      valido_hasta: initial?.valido_hasta ?? "",
      estado: initial?.estado ?? "borrador",
      tipo_servicio: initial?.tipo_servicio ?? null,
      dificultad_acceso: initial?.dificultad_acceso ?? "",
      notas_operativas: initial?.notas_operativas ?? "",
      tipo_vivienda: initial?.tipo_vivienda ?? "",
      ascensor: initial?.ascensor ?? false,
      planta: initial?.planta ?? "",
      parking: initial?.parking ?? false,
      urgencia: initial?.urgencia ?? "",
      metros_cuadrados_estimados: initial?.metros_cuadrados_estimados ?? null,
      objetos_recuperables: initial?.objetos_recuperables ?? "",
      items: initial?.items?.length
        ? initial.items.map((it) => ({
            id: it.id,
            descripcion: it.descripcion,
            cantidad: Number(it.cantidad),
            precio_unit: Number(it.precio_unit),
            iva_aplicable: Number(it.iva_aplicable),
          }))
        : [{ descripcion: "", cantidad: 1, precio_unit: 0, iva_aplicable: defaultVat }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const watchItems = form.watch("items");
  const isTemplate = form.watch("is_template");
  const totals = useMemo(() => computeTotals(watchItems ?? []), [watchItems]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label className="text-sm">Guardar como plantilla</Label>
            <p className="text-xs text-muted-foreground">Las plantillas se reutilizan sin cliente asignado.</p>
          </div>
          <FormField control={form.control} name="is_template" render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </div>

        {isTemplate ? (
          <FormField control={form.control} name="template_name" render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre de la plantilla *</FormLabel>
              <FormControl><Input {...field} placeholder="Ej. Vaciado piso 80m² con ascensor" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        ) : (
          <FormField control={form.control} name="client_id" render={({ field }) => (
            <FormItem>
              <FormLabel>Cliente</FormLabel>
              <Select
                value={field.value ?? NONE}
                onValueChange={(v) => field.onChange(v === NONE ? null : v)}
              >
                <FormControl><SelectTrigger><SelectValue placeholder="Selecciona un cliente" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value={NONE}>Sin cliente</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        )}

        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="fecha" render={({ field }) => (
            <FormItem><FormLabel>Fecha *</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="valido_hasta" render={({ field }) => (
            <FormItem><FormLabel>Válido hasta</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="estado" render={({ field }) => (
            <FormItem>
              <FormLabel>Estado</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {QUOTE_STATUSES.map((s) => <SelectItem key={s} value={s}>{QUOTE_STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          {!isTemplate && (
            <FormField control={form.control} name="tipo" render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo / Serie *</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    {INVOICE_SERIES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.value} — {s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
          )}
          <FormField control={form.control} name="tipo_servicio" render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de servicio</FormLabel>
              <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? null : v)}>
                <FormControl><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {SERVICE_TYPES.map((s) => <SelectItem key={s} value={s}>{SERVICE_TYPE_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <div className="space-y-3 rounded-md border p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Pre-visita</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="tipo_vivienda" render={({ field }) => (
              <FormItem><FormLabel>Tipo de vivienda</FormLabel><FormControl><Input {...field} placeholder="Piso, casa, local…" /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="planta" render={({ field }) => (
              <FormItem><FormLabel>Planta</FormLabel><FormControl><Input {...field} placeholder="3º, bajo, ático…" /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="metros_cuadrados_estimados" render={({ field }) => (
              <FormItem><FormLabel>m² estimados</FormLabel><FormControl><Input type="number" step="0.01" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.valueAsNumber)} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="urgencia" render={({ field }) => (
              <FormItem><FormLabel>Urgencia</FormLabel><FormControl><Input {...field} placeholder="Normal, alta, urgente…" /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="ascensor" render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-md border px-3 py-2 space-y-0"><FormLabel className="m-0">Ascensor</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="parking" render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-md border px-3 py-2 space-y-0"><FormLabel className="m-0">Parking</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>
            )} />
          </div>
          <FormField control={form.control} name="dificultad_acceso" render={({ field }) => (
            <FormItem><FormLabel>Dificultad de acceso</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="objetos_recuperables" render={({ field }) => (
            <FormItem><FormLabel>Objetos recuperables</FormLabel><FormControl><Textarea rows={2} {...field} placeholder="Muebles, electrodomésticos, libros…" /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="notas_operativas" render={({ field }) => (
            <FormItem><FormLabel>Notas operativas</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>

        <div className="space-y-3 rounded-md border p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Líneas</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => append({ descripcion: "", cantidad: 1, precio_unit: 0, iva_aplicable: defaultVat })}>
              <Plus className="h-4 w-4" /> Añadir línea
            </Button>
          </div>
          <div className="space-y-2">
            <div className="hidden grid-cols-12 gap-2 px-0.5 text-xs font-medium text-muted-foreground sm:grid">
              <div className="col-span-5">Descripción</div>
              <div className="col-span-2">Cantidad</div>
              <div className="col-span-2">Precio (€)</div>
              <div className="col-span-2">IVA (%)</div>
              <div className="col-span-1" />
            </div>
            {fields.map((f, idx) => (
              <div key={f.id} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-5">
                  <FormField control={form.control} name={`items.${idx}.descripcion`} render={({ field }) => (
                    <FormItem><FormControl><Input placeholder="Descripción" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="col-span-2">
                  <FormField control={form.control} name={`items.${idx}.cantidad`} render={({ field }) => (
                    <FormItem><FormControl><Input type="number" step="0.01" placeholder="Cant." {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="col-span-2">
                  <FormField control={form.control} name={`items.${idx}.precio_unit`} render={({ field }) => (
                    <FormItem><FormControl><Input type="number" step="0.01" placeholder="€/u" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="col-span-2">
                  <FormField control={form.control} name={`items.${idx}.iva_aplicable`} render={({ field }) => (
                    <FormItem><FormControl><Input type="number" step="0.01" placeholder="IVA %" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="col-span-1 flex justify-end pt-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(idx)} disabled={fields.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {form.formState.errors.items?.message && (
            <p className="text-sm text-destructive">{form.formState.errors.items.message}</p>
          )}
          <div className="flex justify-end gap-6 border-t pt-3 text-sm">
            <div>Subtotal: <strong>{formatCurrency(totals.subtotal)}</strong></div>
            <div>IVA: <strong>{formatCurrency(totals.iva)}</strong></div>
            <div>Total: <strong>{formatCurrency(totals.total)}</strong></div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>{submitLabel}</Button>
        </div>
      </form>
    </Form>
  );
}