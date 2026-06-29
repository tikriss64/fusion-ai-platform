import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { formatCurrency } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  invoiceSchema,
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
  INVOICE_SERIES,
  type InvoiceFormValues,
  type InvoiceRow,
  type InvoiceItemRow,
} from "@/lib/invoices-schema";
import { computeTotals } from "@/lib/quotes-schema";
import type { ClientRow } from "@/lib/clients-schema";

type Props = {
  initial?: (InvoiceRow & { items: InvoiceItemRow[] }) | null;
  clients: ClientRow[];
  defaultVat?: number;
  onSubmit: (values: InvoiceFormValues) => Promise<void> | void;
  onCancel: () => void;
  submitLabel?: string;
};

const NONE = "__none__";

export function InvoiceForm({ initial, clients, defaultVat = 21, onSubmit, onCancel, submitLabel = "Guardar" }: Props) {
  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      client_id: initial?.client_id ?? null,
      // Para facturas nuevas guardamos el TIPO (V/L/P); al guardar se calcula la
      // referencia real (V2-26…). Al editar mostramos el tipo de la serie existente.
      serie: initial?.serie ? initial.serie.charAt(0).toUpperCase() : "V",
      fecha_emision: initial?.fecha_emision ?? new Date().toISOString().slice(0, 10),
      vencimiento: initial?.vencimiento ?? "",
      estado: initial?.estado ?? "pendiente",
      notas_legales: initial?.notas_legales ?? "",
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
  const totals = useMemo(() => computeTotals(watchItems ?? []), [watchItems]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="client_id" render={({ field }) => (
            <FormItem className="col-span-2">
              <FormLabel>Cliente</FormLabel>
              <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? null : v)}>
                <FormControl><SelectTrigger><SelectValue placeholder="Selecciona un cliente" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value={NONE}>Sin cliente</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="serie" render={({ field }) => (
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
          <FormField control={form.control} name="estado" render={({ field }) => (
            <FormItem>
              <FormLabel>Estado</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {INVOICE_STATUSES.map((s) => <SelectItem key={s} value={s}>{INVOICE_STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="fecha_emision" render={({ field }) => (
            <FormItem><FormLabel>Fecha emisión *</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="vencimiento" render={({ field }) => (
            <FormItem><FormLabel>Vencimiento</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>

        <div className="space-y-3 rounded-md border p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Líneas</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => append({ descripcion: "", cantidad: 1, precio_unit: 0, iva_aplicable: defaultVat })}>
              <Plus className="h-4 w-4" /> Añadir línea
            </Button>
          </div>
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
                  <FormItem><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="col-span-2">
                <FormField control={form.control} name={`items.${idx}.precio_unit`} render={({ field }) => (
                  <FormItem><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="col-span-2">
                <FormField control={form.control} name={`items.${idx}.iva_aplicable`} render={({ field }) => (
                  <FormItem><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="col-span-1 flex justify-end pt-1">
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(idx)} disabled={fields.length === 1}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-6 border-t pt-3 text-sm">
            <div>Subtotal: <strong>{formatCurrency(totals.subtotal)}</strong></div>
            <div>IVA: <strong>{formatCurrency(totals.iva)}</strong></div>
            <div>Total: <strong>{formatCurrency(totals.total)}</strong></div>
          </div>
        </div>

        <FormField control={form.control} name="notas_legales" render={({ field }) => (
          <FormItem><FormLabel>Notas legales</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>
        )} />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>{submitLabel}</Button>
        </div>
      </form>
    </Form>
  );
}