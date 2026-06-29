import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, Clock, MapPin, FileText, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { trabajoFormSchema, type TrabajoFormValues } from "@/lib/trabajos-schema";
import { SERVICE_TYPE_LABELS, type QuoteRow } from "@/lib/quotes-schema";
import type { ClientRow } from "@/lib/clients-schema";

type Props = {
  open: boolean;
  onClose: () => void;
  quote: QuoteRow;
  client: ClientRow | null;
  onConfirm: (values: TrabajoFormValues) => Promise<void>;
};

export function ProgramarTrabajoDialog({ open, onClose, quote, client, onConfirm }: Props) {
  const form = useForm<TrabajoFormValues>({
    resolver: zodResolver(trabajoFormSchema),
    defaultValues: {
      client_id: quote.client_id ?? undefined,
      fecha: new Date().toISOString().slice(0, 10),
      hora: "",
      direccion: client?.direccion ?? "",
      tipo_servicio: quote.tipo_servicio ?? null,
      notas: quote.notas_operativas ?? "",
      carpeta_fotos_url: "",
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Programar el trabajo
          </DialogTitle>
          <DialogDescription>
            El presupuesto ha sido aceptado. ¿Cuándo vas a realizar el trabajo?
          </DialogDescription>
        </DialogHeader>

        {/* Resumen del presupuesto */}
        <div className="rounded-md bg-muted/50 border p-3 text-sm space-y-1.5">
          {client && (
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="font-semibold">{client.nombre}</span>
              {client.telefono && (
                <span className="text-muted-foreground">· {client.telefono}</span>
              )}
            </div>
          )}
          {quote.tipo_servicio && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <FileText className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                {SERVICE_TYPE_LABELS[quote.tipo_servicio]}
                {quote.metros_cuadrados_estimados
                  ? ` · ${quote.metros_cuadrados_estimados} m²`
                  : ""}
                {quote.planta ? ` · Planta ${quote.planta}` : ""}
                {quote.ascensor ? " · Ascensor" : ""}
              </span>
            </div>
          )}
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onConfirm)}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="fecha"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" /> Fecha *
                    </FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="hora"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> Hora (opcional)
                    </FormLabel>
                    <FormControl>
                      <Input type="time" {...field} value={field.value ?? ""} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="direccion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> Dirección del trabajo
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Calle, número, piso…"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notas"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas del día</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Código del portal, persona de contacto en el edificio…"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex gap-2 justify-end pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
              >
                Ahora no
              </Button>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? "Guardando…" : "Programar trabajo"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
