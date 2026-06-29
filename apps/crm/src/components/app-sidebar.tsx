import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, FileText, Receipt, Settings, LogOut, Building2, CalendarDays, Inbox, Radar, Mail, ExternalLink, Send, Clock, ShieldAlert, FolderOpen, FileBarChart } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { isOverdue } from "@/lib/invoices-schema";

export function AppSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { user, signOut } = useAuth();
  const [factVencidas, setFactVencidas] = useState(0);
  const [leadsNuevos, setLeadsNuevos] = useState(0);

  useEffect(() => {
    // Vencidas por FECHA (no solo estado guardado): trae las no pagadas y filtra.
    void supabase
      .from("invoices")
      .select("estado, vencimiento")
      .neq("estado", "pagada")
      .then(({ data }) =>
        setFactVencidas((data ?? []).filter((i: any) => isOverdue(i.estado, i.vencimiento)).length),
      );

    void supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("estado", "nuevo")
      .then(({ count }) => setLeadsNuevos(count ?? 0));
  }, [path]);

  const items = [
    { title: "Mission Control", url: "/mission-control", icon: Radar, badge: 0 },
    { title: "Dashboard",    url: "/dashboard", icon: LayoutDashboard, badge: 0 },
    { title: "Leads",        url: "/leads",     icon: Inbox,           badge: leadsNuevos },
    { title: "Agenda",       url: "/agenda",    icon: CalendarDays,    badge: 0 },
    { title: "Clientes",     url: "/clientes",  icon: Users,           badge: 0 },
    { title: "Presupuestos", url: "/quotes",    icon: FileText,        badge: 0 },
    { title: "Facturas",     url: "/invoices",  icon: Receipt,         badge: factVencidas },
    { title: "Informes",     url: "/informes",  icon: FileBarChart,    badge: 0 },
  ] as const;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-0">
        <div className="group/brand relative flex items-center gap-3 px-2 py-2.5 border-b border-sidebar-border">
          {/* Halo naranja difuso detrás del logo — más amplio y vivo */}
          <div className="absolute left-0 top-1.5 h-16 w-16 rounded-2xl bg-accent/55 blur-2xl transition-all duration-500 group-hover/brand:bg-accent group-hover/brand:blur-3xl pointer-events-none" />

          {/* Logo real sobre fondo blanco, con doble anillo naranja y sombra cálida */}
          <div className="relative flex shrink-0 items-center justify-center rounded-2xl bg-white p-1.5 shadow-xl shadow-accent/50 ring-[3px] ring-accent ring-offset-2 ring-offset-sidebar transition-transform duration-300 hover:scale-105"
               style={{ height: "3.5rem", width: "3.5rem" }}>
            <img
              src="/logo.webp"
              alt="vaciadodepisos.cat"
              width={56}
              height={56}
              className="h-full w-full object-contain"
              draggable={false}
            />
            {/* Punto verde "vivo" pulsante */}
            <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-400 border-2 border-sidebar animate-pulse" />
          </div>

          <div className="flex flex-col group-data-[collapsible=icon]:hidden min-w-0">
            <span className="text-base font-bold leading-tight tracking-tight truncate">
              vaciadodepisos<span className="text-accent">.cat</span>
            </span>
            <span className="mt-0.5 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
              <span className="inline-block h-1 w-1 rounded-full bg-accent animate-pulse" />
              AI Ops Center
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-0">
        <SidebarGroup className="py-1 px-2">
          <SidebarGroupLabel className="h-7 px-1 text-xs">Gestión</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = path.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className="group/item relative transition-colors duration-200"
                    >
                      <Link to={item.url}>
                        {/* Barra de acento naranja en el item activo */}
                        <span
                          className={`absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent transition-all duration-300 ${
                            active ? "opacity-100" : "opacity-0 -translate-x-1"
                          }`}
                        />
                        <item.icon className="transition-transform duration-200 group-hover/item:scale-110 group-hover/item:text-accent" />
                        <span className="flex-1 transition-transform duration-200 group-hover/item:translate-x-0.5">
                          {item.title}
                        </span>
                        {item.badge > 0 && (
                          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground transition-transform duration-200 group-hover/item:scale-110 group-data-[collapsible=icon]:hidden">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="py-1 px-2">
          <SidebarGroupLabel className="h-7 px-1 text-xs">Bandeja IA</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {([
                { title: "Bandeja",    url: "/bandeja",    icon: Mail },
                { title: "Enviados",   url: "/enviados",   icon: Send },
                { title: "Esperando",  url: "/esperando",  icon: Clock },
                { title: "Riesgos",    url: "/riesgos",    icon: ShieldAlert },
                { title: "Documentos", url: "/documentos", icon: FolderOpen },
              ] as const).map((item) => {
                const active = path.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className="group/item relative transition-colors duration-200"
                    >
                      <Link to={item.url}>
                        <span
                          className={`absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent transition-all duration-300 ${
                            active ? "opacity-100" : "opacity-0 -translate-x-1"
                          }`}
                        />
                        <item.icon className="transition-transform duration-200 group-hover/item:scale-110 group-hover/item:text-accent" />
                        <span className="flex-1 transition-transform duration-200 group-hover/item:translate-x-0.5">
                          {item.title}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="py-1 px-2">
          <SidebarGroupLabel className="h-7 px-1 text-xs">Configuración</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={path === "/settings"} tooltip="Ajustes">
                  <Link to="/settings">
                    <Settings />
                    <span>Ajustes</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="px-2 py-0.5 text-xs text-sidebar-foreground/70 truncate group-data-[collapsible=icon]:hidden">
              {user?.email}
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => signOut()} tooltip="Cerrar sesión">
              <LogOut />
              <span>Cerrar sesión</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
