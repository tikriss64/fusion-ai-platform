// Logo de marca FUSION compartido en todas las apps.
// Mismo efecto wow del CRM: logo sobre fondo blanco con ring naranja, halo difuso
// posterior que se enciende al hover, punto verde "vivo" pulsante.
export function BrandLogo({ subtitle = "AI Ops Center" }: { subtitle?: string }) {
  return (
    <div className="group/brand relative flex items-center gap-3 px-2 py-3">
      <div className="pointer-events-none absolute left-0 top-1 h-16 w-16 rounded-2xl bg-accent/45 blur-2xl transition-all duration-500 group-hover/brand:bg-accent/80 group-hover/brand:blur-3xl" />
      <div
        className="relative flex shrink-0 items-center justify-center rounded-2xl bg-white p-1.5 shadow-xl shadow-accent/50 ring-[3px] ring-accent ring-offset-2 ring-offset-background transition-transform duration-300 hover:scale-105"
        style={{ height: "3.5rem", width: "3.5rem" }}
      >
        <img
          src="/logo.webp"
          alt="vaciadodepisos.cat"
          width={56}
          height={56}
          className="h-full w-full object-contain"
          draggable={false}
        />
        <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-400 border-2 border-background animate-pulse" />
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="text-base font-bold leading-tight tracking-tight truncate text-foreground">
          vaciadodepisos<span className="text-accent">.cat</span>
        </span>
        <span className="mt-0.5 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="inline-block h-1 w-1 rounded-full bg-accent animate-pulse" />
          {subtitle}
        </span>
      </div>
    </div>
  );
}
