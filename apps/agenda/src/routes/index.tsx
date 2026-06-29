import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

// Página raíz: solo redirige.
//  - Si hay sesión: al panel de operaciones (/dashboard).
//  - Si no la hay: al login.
// No se muestra contenido comercial — esta app es el módulo de operaciones
// interno de vaciadodepisos.cat, no un SaaS público.
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Agenda Operativa — vaciadodepisos.cat" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: IndexRedirect,
});

function IndexRedirect() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Cuando la auth resuelve, redirigir.
    if (!loading) {
      navigate({ to: user ? "/dashboard" : "/login", replace: true });
      return;
    }
    // Seguridad: si la sesión no resuelve en 3 s, mandar al login igual.
    const t = setTimeout(() => {
      navigate({ to: "/login", replace: true });
    }, 3000);
    return () => clearTimeout(t);
  }, [user, loading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="relative">
          <div className="absolute inset-0 -m-3 rounded-2xl bg-accent/30 blur-xl" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white p-1.5 shadow-lg ring-2 ring-accent">
            <img src="/logo.webp" alt="" width={48} height={48} className="h-full w-full object-contain" />
          </div>
        </div>
        <p className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Cargando…
        </p>
      </div>
    </div>
  );
}
