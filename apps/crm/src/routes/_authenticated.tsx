import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2, Search } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AIAssistant } from "@/components/AIAssistant";
import { PageHelp } from "@/components/help/PageHelp";
import { AlertsBell } from "@/components/AlertsBell";
import { GlobalSearch } from "@/components/GlobalSearch";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

const TITLES: Record<string, string> = {
  dashboard:        "Dashboard",
  leads:            "Leads",
  agenda:           "Agenda",
  clientes:         "Clientes",
  quotes:           "Presupuestos",
  invoices:         "Facturas",
  informes:         "Informes",
  settings:         "Ajustes",
  "mission-control": "Mission Control",
  bandeja:          "Bandeja",
  enviados:         "Enviados",
  esperando:        "Esperando",
  riesgos:          "Riesgos",
  documentos:       "Documentos",
};

function AuthenticatedLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (r) => r.location.pathname });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const segment = path.split("/").filter(Boolean)[0] ?? "dashboard";
  const title = TITLES[segment] ?? "Panel";

  return (
    <SidebarProvider>
      <ConfirmProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/80 backdrop-blur px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-5" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/dashboard">vaciadodepisos.cat</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{title}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            {/* Buscar + campana de alertas + ayuda, a la derecha del todo. */}
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => window.dispatchEvent(new Event("global-search:open"))}
                title="Buscar (Ctrl+K)"
                className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
              >
                <Search className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Buscar…</span>
                <kbd className="hidden rounded bg-muted px-1 text-[10px] font-medium sm:inline">Ctrl K</kbd>
              </button>
              <AlertsBell />
              <PageHelp page={segment} />
            </div>
          </header>
          <main className="flex-1 p-3 sm:p-6">
            {/* Transición de entrada por página: fade + leve subida. key={path}
                fuerza el re-montaje en cada ruta para re-disparar la animación.
                motion-reduce respeta a quien desactiva animaciones. */}
            <div
              key={path}
              className="animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out motion-reduce:animate-none"
            >
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <AIAssistant />
      <GlobalSearch />
      </ConfirmProvider>
    </SidebarProvider>
  );
}