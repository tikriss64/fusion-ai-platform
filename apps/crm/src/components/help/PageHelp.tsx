import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PAGE_HELP } from "@/lib/help-content";

/**
 * Botón de ayuda por página. Abre un panel lateral (no tapa la pantalla, deja
 * ver los elementos a los que se refiere) con una guía cálida y sencilla.
 * Pensado para usuarios no técnicos.
 *
 * @param page  clave en PAGE_HELP (p.ej. "leads"). Si no existe, no muestra nada.
 * @param compact  si true, solo el icono "?" (para barras estrechas).
 */
export function PageHelp({ page, compact = false }: { page: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const help = PAGE_HELP[page];
  if (!help) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5 border-accent/40 text-accent hover:bg-accent/10 hover:text-accent"
      >
        <HelpCircle className="size-4" />
        {/* En móvil solo el icono "?"; el texto aparece desde sm: (PC intacto). */}
        {!compact && <span className="hidden sm:inline">¿Cómo funciona esto?</span>}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b p-5 pb-4 text-left">
            <SheetTitle className="flex items-center gap-2">
              <HelpCircle className="size-5 text-accent" />
              <span>
                <span className="text-accent">Ayuda</span> de esta página
              </span>
            </SheetTitle>
            <SheetDescription className="leading-relaxed">{help.intro}</SheetDescription>
          </SheetHeader>

          {/* Lista con scroll propio fiable (overflow-y-auto sobre flex-1) */}
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            {help.items.map((it) => (
              <div key={it.title} className="rounded-lg border bg-card p-3 shadow-sm">
                <div className="flex items-center gap-2 font-semibold">
                  {it.emoji && <span className="text-lg">{it.emoji}</span>}
                  {it.title}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{it.body}</p>
                {it.tranqui && (
                  <p className="mt-2 rounded-md border border-emerald-100 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700">
                    👍 {it.tranqui}
                  </p>
                )}
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
