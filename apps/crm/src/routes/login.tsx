import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect } from "react";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Iniciar sesión — vaciadodepisos.cat" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [user, loading, navigate]);

  // Traduce los mensajes de error de Supabase (vienen en inglés) a español.
  const traducirError = (msg: string): string => {
    const m = msg.toLowerCase();
    if (m.includes("invalid login credentials")) return "Email o contraseña incorrectos.";
    if (m.includes("email not confirmed")) return "Tu email aún no está confirmado. Revisa tu bandeja.";
    if (m.includes("too many requests") || m.includes("rate limit")) return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
    if (m.includes("network")) return "Error de conexión. Revisa tu internet.";
    return "No se pudo iniciar sesión. Inténtalo de nuevo.";
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      toast.error(traducirError(error.message));
      return;
    }
    toast.success("Sesión iniciada");
    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden bg-background">
      {/* Fondo: patrón sutil de puntos (estilo Vercel) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, var(--muted-foreground) 1px, transparent 0)",
          backgroundSize: "24px 24px",
          maskImage:
            "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />
      {/* Halos de marca: navy arriba a la izquierda, naranja abajo a la derecha */}
      <div aria-hidden className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-accent/30 blur-3xl" />

      <div className="relative w-full max-w-md">
        {/* Cabecera con logo grande centrado */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="group/logo relative">
            <div className="absolute inset-0 -m-2 rounded-3xl bg-accent/50 blur-2xl transition-all duration-500 group-hover/logo:bg-accent/80 group-hover/logo:blur-3xl" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-white p-2 shadow-2xl shadow-accent/40 ring-[3px] ring-accent ring-offset-4 ring-offset-background transition-transform duration-300 hover:scale-105">
              <img src="/logo.webp" alt="vaciadodepisos.cat" width={72} height={72} className="h-full w-full object-contain" draggable={false} />
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 border-2 border-background animate-pulse" />
            </div>
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-foreground">
            vaciadodepisos<span className="text-accent">.cat</span>
          </h1>
          <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <span className="inline-block h-1 w-1 rounded-full bg-accent animate-pulse" />
            AI Ops Center
          </p>
        </div>

        {/* Card con efecto glass refinado */}
        <Card className="border-border/60 bg-card/80 backdrop-blur-xl shadow-2xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">Iniciar sesión</CardTitle>
            <CardDescription>Accede al panel de gestión</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="bg-background/60" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className="bg-background/60" />
              </div>
              <Button type="submit" className="w-full h-10 transition-all duration-300 hover:shadow-lg hover:shadow-primary/40 hover:-translate-y-0.5" disabled={submitting}>
                {submitting && <Loader2 className="animate-spin" />}
                Entrar
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-[11px] text-muted-foreground/70">
          🔒 Conexión segura · RGPD · Datos en Europa
        </p>
      </div>
    </div>
  );
}