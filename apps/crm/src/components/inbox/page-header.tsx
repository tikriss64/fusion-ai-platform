import { type ReactNode, type ComponentType } from "react";

// Cabecera de página unificada para todas las rutas.
// Icono con acento de marca (color restringido y coherente), título + subtítulo
// con la misma jerarquía tipográfica en toda la app, y un hueco opcional para acciones.
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="grid place-items-center size-11 rounded-2xl bg-primary/10 text-primary shrink-0">
            <Icon className="size-5" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground truncate">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
    </header>
  );
}
