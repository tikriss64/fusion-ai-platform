import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function SuccessScreen({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const [origin] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));
  const publicUrl = `${origin}/book/${slug}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg text-center">
        <CheckCircle2 className="mx-auto h-16 w-16 text-primary" />
        <h1 className="mt-4 text-3xl font-bold text-foreground">¡Todo listo!</h1>
        <p className="mt-2 text-muted-foreground">
          Tu negocio está configurado. Comparte tu página pública de reservas con tus clientes.
        </p>

        <div className="mt-6 rounded-xl border border-border bg-card p-4 text-left">
          <p className="text-xs font-medium uppercase text-muted-foreground">Tu página de reservas</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 text-sm text-foreground">
              {publicUrl}
            </code>
            <Button variant="outline" size="icon" onClick={copy} aria-label="Copiar enlace">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" asChild aria-label="Abrir">
              <a href={`/book/${slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>

        <Button className="mt-6 w-full" size="lg" onClick={() => navigate({ to: "/dashboard" })}>
          Ir al panel
        </Button>
      </div>
    </div>
  );
}
