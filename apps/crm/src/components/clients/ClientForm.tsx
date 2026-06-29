import { useState, type KeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, X, Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { clientSchema, SUGGESTED_TAGS, type ClientFormValues, type ClientRow } from "@/lib/clients-schema";
import { cn } from "@/lib/utils";

interface Props {
  initial?: ClientRow | null;
  onSubmit: (values: ClientFormValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}

export function ClientForm({ initial, onSubmit, onCancel, submitLabel = "Guardar" }: Props) {
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      nombre: initial?.nombre ?? "",
      nif_cif: initial?.nif_cif ?? "",
      email: initial?.email ?? "",
      telefono: initial?.telefono ?? "",
      direccion: initial?.direccion ?? "",
      poblacion: initial?.poblacion ?? "",
      notas: initial?.notas ?? "",
      tags: initial?.tags ?? [],
      primera_fecha: initial?.primera_fecha ?? "",
      ultima_fecha: initial?.ultima_fecha ?? "",
      num_trabajos: initial?.num_trabajos ?? 0,
      valoracion: initial?.valoracion ?? null,
      recurrente: initial?.recurrente ?? false,
      rgpd_consent: initial?.rgpd_consent ?? false,
    },
  });

  const [tagInput, setTagInput] = useState("");
  const tags = form.watch("tags");

  const addTag = (t: string) => {
    const clean = t.trim();
    if (!clean) return;
    if (tags.includes(clean)) return;
    form.setValue("tags", [...tags, clean], { shouldDirty: true });
    setTagInput("");
  };
  const removeTag = (t: string) => {
    form.setValue("tags", tags.filter((x) => x !== t), { shouldDirty: true });
  };
  const onTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    }
  };

  const valoracion = form.watch("valoracion");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField control={form.control} name="nombre" render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>Nombre *</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="nif_cif" render={({ field }) => (
            <FormItem><FormLabel>NIF / CIF</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="telefono" render={({ field }) => (
            <FormItem><FormLabel>Teléfono</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="email" render={({ field }) => (
            <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="poblacion" render={({ field }) => (
            <FormItem><FormLabel>Población</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="direccion" render={({ field }) => (
            <FormItem className="sm:col-span-2"><FormLabel>Dirección</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="primera_fecha" render={({ field }) => (
            <FormItem><FormLabel title="Fecha del primer trabajo realizado para este cliente">Primera fecha</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormItem className="sm:col-span-2">
            {/* label normal: este bloque es informativo y NO está dentro de un
                <FormField>, así que <FormLabel> (que exige ese contexto) crasheaba. */}
            <label className="text-sm font-medium leading-none text-muted-foreground">Trabajos realizados</label>
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {(initial?.num_trabajos ?? 0)} trabajo{(initial?.num_trabajos ?? 0) === 1 ? "" : "s"} completado{(initial?.num_trabajos ?? 0) === 1 ? "" : "s"}
              {initial?.ultima_fecha ? ` · último el ${initial.ultima_fecha}` : ""}.
              <span className="mt-0.5 block text-xs">Se calcula solo al marcar trabajos como completados en la Agenda.</span>
            </p>
          </FormItem>

          <FormItem>
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Valoración</label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  type="button"
                  key={n}
                  onClick={() => form.setValue("valoracion", valoracion === n ? null : n, { shouldDirty: true })}
                  className="p-1"
                  aria-label={`${n} estrellas`}
                >
                  <Star className={cn("h-5 w-5", (valoracion ?? 0) >= n ? "fill-primary text-primary" : "text-muted-foreground")} />
                </button>
              ))}
              {valoracion && (
                <button type="button" onClick={() => form.setValue("valoracion", null, { shouldDirty: true })} className="ml-2 text-xs text-muted-foreground hover:underline">
                  Quitar
                </button>
              )}
            </div>
          </FormItem>
        </div>

        <FormItem>
          <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Etiquetas</label>
          <div className="flex flex-wrap gap-1.5 min-h-7">
            {tags.map((t) => (
              <Badge key={t} variant="secondary" className="gap-1">
                {t}
                <button type="button" onClick={() => removeTag(t)} aria-label={`Quitar ${t}`}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={onTagKeyDown}
              placeholder="Añadir etiqueta y pulsa Enter"
            />
            <Button type="button" variant="outline" size="icon" onClick={() => addTag(tagInput)}>
              <Plus />
            </Button>
          </div>
          <p className="text-[0.8rem] text-muted-foreground">Sugerencias:</p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_TAGS.filter((t) => !tags.includes(t)).map((t) => (
              <Badge key={t} variant="outline" className="cursor-pointer hover:bg-accent" onClick={() => addTag(t)}>
                + {t}
              </Badge>
            ))}
          </div>
        </FormItem>

        <FormField control={form.control} name="notas" render={({ field }) => (
          <FormItem>
            <FormLabel>Notas</FormLabel>
            <FormControl><Textarea rows={4} {...field} value={field.value ?? ""} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField control={form.control} name="recurrente" render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-md border p-3">
              <div><FormLabel className="m-0">Cliente recurrente</FormLabel></div>
              <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="rgpd_consent" render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-md border p-3">
              <div><FormLabel className="m-0">Consentimiento RGPD</FormLabel></div>
              <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
            </FormItem>
          )} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>}
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
            {submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}