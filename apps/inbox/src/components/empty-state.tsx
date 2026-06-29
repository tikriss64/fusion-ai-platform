import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-xl">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="text-muted-foreground mt-2">{description}</p>

      <div className="mt-8 rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
        <div className="mx-auto size-12 rounded-xl bg-muted text-muted-foreground grid place-items-center">
          {icon}
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          Esta sección estará disponible en una próxima etapa.
        </p>
      </div>
    </div>
  );
}
