import type { LucideIcon } from "lucide-react";

/**
 * Pantalla vacía cálida y tranquilizadora. Las listas vacías ponen nervioso a
 * quien empieza ("¿lo he roto?"), así que aquí explicamos con calma que es
 * normal y qué hacer.
 */
export function EmptyState({
  icon: Icon,
  title,
  message,
  hint,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-16 text-center">
      <div className="mb-3 rounded-full bg-accent/10 p-3.5 text-accent">
        <Icon className="size-7" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">{message}</p>
      {hint && (
        <p className="mt-3 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">
          👍 {hint}
        </p>
      )}
    </div>
  );
}
