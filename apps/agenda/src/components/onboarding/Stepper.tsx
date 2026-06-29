import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Cuenta", "Negocio", "Servicios", "Horarios", "Equipo"];

/** current is 1-based index of the active step (1 = Cuenta). */
export function Stepper({ current }: { current: number }) {
  return (
    <ol className="mx-auto flex w-full max-w-2xl items-center">
      {STEPS.map((label, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary bg-background text-primary",
                  !done && !active && "border-border bg-background text-muted-foreground",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : step}
              </span>
              <span
                className={cn(
                  "hidden text-xs sm:block",
                  active ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn("mx-1 h-0.5 flex-1", step < current ? "bg-primary" : "bg-border")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
