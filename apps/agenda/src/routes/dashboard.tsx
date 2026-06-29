import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Menu, X, ExternalLink } from "lucide-react";
import { getPanelContext } from "@/lib/admin/admin.functions";
import { getOnboardingState } from "@/lib/onboarding/onboarding.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Panel — vaciadodepisos.cat" }] }),
  component: DashboardLayout,
});

function DashboardLayout() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const fetchCtx = useServerFn(getPanelContext);
  const fetchState = useServerFn(getOnboardingState);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  const { data: panel, isLoading: panelLoading } = useQuery({
    queryKey: ["panel-context"],
    queryFn: () => fetchCtx(),
    enabled: !!user,
  });

  const { data: state } = useQuery({
    queryKey: ["onboarding-state"],
    queryFn: () => fetchState(),
    enabled: !!user,
  });

  useEffect(() => {
    if (state && !state.tenant) navigate({ to: "/onboarding" });
    else if (state?.tenant && !state.tenant.onboarding_completed) navigate({ to: "/onboarding" });
  }, [state, navigate]);

  if (loading || panelLoading || !panel) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </div>
    );
  }

  if (!panel.isAdmin && !panel.isStaff) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <h1 className="text-xl font-semibold text-foreground">Acceso restringido</h1>
        <p className="text-sm text-muted-foreground">No tienes permisos para ver este panel.</p>
        <Button variant="outline" onClick={() => signOut().then(() => navigate({ to: "/" }))}>
          Cerrar sesión
        </Button>
      </div>
    );
  }

  const isStaffOnly = panel.isStaff && !panel.isAdmin;
  const slug = state?.tenant?.slug;
  const publicUrl = slug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/book/${slug}`
    : null;

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card md:flex md:flex-col">
        <div className="border-b border-border px-3">
          <BrandLogo subtitle="Agenda" />
        </div>
        <div className="flex-1 overflow-y-auto">
          <DashboardNav isStaffOnly={isStaffOnly} />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-3">
              <BrandLogo subtitle="Agenda" />
              <button onClick={() => setMobileOpen(false)} className="mr-2"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <DashboardNav isStaffOnly={isStaffOnly} onNavigate={() => setMobileOpen(false)} />
            </div>
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-4">
          <div className="flex items-center gap-2">
            <button className="md:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            {isStaffOnly && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                Mi agenda
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {publicUrl && (
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="hidden items-center gap-1 text-xs text-muted-foreground hover:text-foreground sm:flex"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Página pública
              </a>
            )}
            <Button variant="outline" size="sm" onClick={() => signOut().then(() => navigate({ to: "/" }))}>
              Salir
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
