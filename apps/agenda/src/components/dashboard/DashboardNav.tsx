import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Users,
  Scissors,
  UserCog,
  DoorOpen,
  Bell,
  ReceiptText,
  BarChart3,
  Settings as SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  staff?: boolean; // visible to staff too
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, staff: true },
  { to: "/dashboard/calendar", label: "Calendario", icon: CalendarDays, staff: true },
  { to: "/dashboard/appointments", label: "Citas", icon: ClipboardList, staff: true },
  { to: "/dashboard/clients", label: "Clientes", icon: Users },
  { to: "/dashboard/services", label: "Servicios", icon: Scissors },
  { to: "/dashboard/team", label: "Equipo", icon: UserCog },
  { to: "/dashboard/resources", label: "Salas y recursos", icon: DoorOpen },
  { to: "/dashboard/notifications", label: "Notificaciones", icon: Bell },
  { to: "/dashboard/billing", label: "Facturación", icon: ReceiptText },
  { to: "/dashboard/reports", label: "Informes", icon: BarChart3 },
  { to: "/dashboard/settings", label: "Configuración", icon: SettingsIcon },
];

export function DashboardNav({
  isStaffOnly,
  onNavigate,
}: {
  isStaffOnly: boolean;
  onNavigate?: () => void;
}) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const items = isStaffOnly ? NAV_ITEMS.filter((i) => i.staff) : NAV_ITEMS;

  return (
    <nav className="flex flex-col gap-1 p-3">
      {items.map((item) => {
        const active =
          item.to === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
