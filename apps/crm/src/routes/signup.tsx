import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ShieldX } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Registro cerrado — vaciadodepisos.cat" }] }),
  component: SignupClosedPage,
});

// El registro público está DESACTIVADO: este es un CRM privado de una sola empresa.
// Las cuentas las crea el administrador (en el panel de Supabase). Si ya hay sesión
// iniciada, llevamos al usuario directamente al panel.
function SignupClosedPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-muted">
            <ShieldX className="size-6 text-muted-foreground" />
          </div>
          <CardTitle className="text-xl">Registro no disponible</CardTitle>
          <CardDescription>
            Este es un CRM privado. El acceso lo concede únicamente el administrador de la empresa.
            Si necesitas una cuenta, contacta con él.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link to="/login">Volver a iniciar sesión</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
