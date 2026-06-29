import { Link } from "@tanstack/react-router";
import { Star, Pencil, Trash2, Eye, Users } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ClientRow } from "@/lib/clients-schema";

interface Props {
  clients: ClientRow[];
  onEdit: (c: ClientRow) => void;
  onDelete: (c: ClientRow) => void;
}

export function ClientTable({ clients, onEdit, onDelete }: Props) {
  if (clients.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Aún no tienes clientes"
        message="Aquí irán apareciendo tus clientes. Se crean solos cuando conviertes un lead, o puedes añadir uno a mano con el botón «Nuevo cliente»."
      />
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead className="hidden sm:table-cell">Población</TableHead>
            <TableHead>Teléfono</TableHead>
            <TableHead className="hidden md:table-cell">Etiquetas</TableHead>
            <TableHead className="hidden md:table-cell">Valoración</TableHead>
            <TableHead className="hidden sm:table-cell">Trabajos</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <div className="font-medium">{c.nombre}</div>
                {c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
                <div className="sm:hidden text-xs text-muted-foreground mt-0.5">{c.poblacion}</div>
              </TableCell>
              <TableCell className="hidden sm:table-cell">{c.poblacion ?? "—"}</TableCell>
              <TableCell>
                {c.telefono ? (
                  <a href={`tel:${c.telefono}`} className="hover:underline whitespace-nowrap">
                    {c.telefono}
                  </a>
                ) : "—"}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <div className="flex flex-wrap gap-1">
                  {c.tags.slice(0, 3).map((t) => (
                    <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                  ))}
                  {c.tags.length > 3 && <span className="text-xs text-muted-foreground">+{c.tags.length - 3}</span>}
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {c.valoracion ? (
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`h-3.5 w-3.5 ${i < (c.valoracion ?? 0) ? "fill-primary text-primary" : "text-muted-foreground/40"}`} />
                    ))}
                  </div>
                ) : "—"}
              </TableCell>
              <TableCell className="hidden sm:table-cell">{c.num_trabajos}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button asChild variant="ghost" size="icon" title="Ver detalle">
                    <Link to="/clientes/$id" params={{ id: c.id }}>
                      <Eye />
                    </Link>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onEdit(c)} title="Editar">
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(c)} title="Eliminar">
                    <Trash2 />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
