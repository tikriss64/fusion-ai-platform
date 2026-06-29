import { Link } from "@tanstack/react-router";
import { MoreHorizontal, Receipt, Pencil, Trash2, Eye, FileDown, Mail } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { INVOICE_STATUS_LABELS, type InvoiceRow } from "@/lib/invoices-schema";
import { formatDate, formatCurrency } from "@/lib/utils";

type Props = {
  invoices: InvoiceRow[];
  clientNames: Record<string, string>;
  clientEmails?: Record<string, string>;
  paidMap?: Record<string, number>;
  onEdit: (i: InvoiceRow) => void;
  onDelete: (i: InvoiceRow) => void;
  onDocument: (i: InvoiceRow) => void;
  onSendEmail?: (i: InvoiceRow) => void;
};

const statusColor: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  pagada: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  parcial: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  vencida: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

export function InvoiceTable({ invoices, clientNames, clientEmails = {}, paidMap = {}, onEdit, onDelete, onDocument, onSendEmail }: Props) {
  if (!invoices.length) {
    return (
      <EmptyState
        icon={Receipt}
        title="Aún no hay facturas"
        message="Crea una desde un presupuesto aceptado (botón «Convertir a factura»), o con «Nueva factura». Aquí controlarás lo que tienes por cobrar."
      />
    );
  }
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Número</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead className="hidden sm:table-cell">Emisión</TableHead>
            <TableHead className="hidden md:table-cell">Vencimiento</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="hidden sm:table-cell text-right">Pendiente</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((i) => (
            <TableRow key={i.id}>
              <TableCell className="font-mono text-xs">
                <Link to="/invoices/$id" params={{ id: i.id }} className="hover:underline">
                  {i.serie}-{i.numero}
                </Link>
              </TableCell>
              <TableCell>
                <div>{i.client_id ? clientNames[i.client_id] ?? "—" : <span className="text-muted-foreground">—</span>}</div>
                <div className="sm:hidden text-xs text-muted-foreground">{formatDate(i.fecha_emision)}</div>
              </TableCell>
              <TableCell className="hidden sm:table-cell text-sm">{formatDate(i.fecha_emision)}</TableCell>
              <TableCell className="hidden md:table-cell text-sm">{formatDate(i.vencimiento)}</TableCell>
              <TableCell><Badge className={statusColor[i.estado]} variant="secondary">{INVOICE_STATUS_LABELS[i.estado]}</Badge></TableCell>
              <TableCell className="text-right tabular-nums whitespace-nowrap">{formatCurrency(i.total)}</TableCell>
              <TableCell className="hidden sm:table-cell text-right tabular-nums">
                {i.estado === "pagada" ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className={Number(i.total) - (paidMap[i.id] ?? 0) > 0 ? "text-amber-700 dark:text-amber-400 font-medium" : ""}>
                    {formatCurrency(Math.max(0, Number(i.total) - (paidMap[i.id] ?? 0)))}
                  </span>
                )}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link to="/invoices/$id" params={{ id: i.id }}><Eye className="h-4 w-4" /> Ver / Pagos</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEdit(i)}><Pencil className="h-4 w-4" /> Editar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDocument(i)}><FileDown className="h-4 w-4" /> Vista previa / PDF</DropdownMenuItem>
                    {i.client_id && clientEmails[i.client_id] && onSendEmail && (
                      <DropdownMenuItem onClick={() => onSendEmail(i)}>
                        <Mail className="h-4 w-4" /> Enviar por email
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => onDelete(i)}>
                      <Trash2 className="h-4 w-4" /> Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
