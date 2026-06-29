import { MoreHorizontal, FileText, Pencil, Trash2, FileCheck2, FileDown, Copy, Mail, Send, AlertCircle, CheckCircle2, Link2 } from "lucide-react";
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
import { QUOTE_STATUS_LABELS, SERVICE_TYPE_LABELS, type QuoteRow } from "@/lib/quotes-schema";
import { formatDate, formatCurrency } from "@/lib/utils";

type Props = {
  quotes: QuoteRow[];
  clientNames: Record<string, string>;
  clientEmails?: Record<string, string>;
  onEdit: (q: QuoteRow) => void;
  onDelete: (q: QuoteRow) => void;
  onConvert: (q: QuoteRow) => void;
  onDocument: (q: QuoteRow) => void;
  onDuplicate: (q: QuoteRow) => void;
  onMarkSent?: (q: QuoteRow) => void;
  onMarkAccepted?: (q: QuoteRow) => void;
  onSendEmail?: (q: QuoteRow) => void;
  onCopyLink?: (q: QuoteRow) => void;
};

const statusColor: Record<string, string> = {
  borrador: "bg-muted text-muted-foreground",
  enviado: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  aceptado: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  rechazado: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  facturado: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
};

export function QuoteTable({ quotes, clientNames, clientEmails = {}, onEdit, onDelete, onConvert, onDocument, onDuplicate, onMarkSent, onMarkAccepted, onSendEmail, onCopyLink }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  if (!quotes.length) {
    return (
      <EmptyState
        icon={FileText}
        title="Todavía no hay presupuestos"
        message="Cuando conviertas un lead en cliente o crees uno con «Nuevo presupuesto», aparecerá aquí listo para revisar y enviar."
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
            <TableHead className="hidden sm:table-cell">Fecha</TableHead>
            <TableHead className="hidden md:table-cell">Servicio</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {quotes.map((q) => (
            <TableRow key={q.id}>
              <TableCell className="font-mono text-xs">
                {q.is_template ? <Badge variant="outline">Plantilla</Badge> : (q.numero ?? "—")}
                {q.is_template && q.template_name && <div className="mt-1 text-xs text-muted-foreground">{q.template_name}</div>}
              </TableCell>
              <TableCell>
                <div>{q.client_id ? clientNames[q.client_id] ?? "—" : <span className="text-muted-foreground">—</span>}</div>
                <div className="sm:hidden text-xs text-muted-foreground">{formatDate(q.fecha)}</div>
              </TableCell>
              <TableCell className="hidden sm:table-cell text-sm">{formatDate(q.fecha)}</TableCell>
              <TableCell className="hidden md:table-cell text-sm">{q.tipo_servicio ? SERVICE_TYPE_LABELS[q.tipo_servicio] : "—"}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge className={statusColor[q.estado]} variant="secondary">{QUOTE_STATUS_LABELS[q.estado]}</Badge>
                  {q.estado === "enviado" && q.valido_hasta && q.valido_hasta < today && (
                    <span title="Fecha de validez superada" className="flex items-center gap-0.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                      <AlertCircle className="h-3 w-3" /> <span className="hidden sm:inline">Caducado</span>
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums whitespace-nowrap">{formatCurrency(q.total)}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(q)}><Pencil className="h-4 w-4" /> Editar</DropdownMenuItem>
                    {!q.is_template && (
                      <DropdownMenuItem onClick={() => onDocument(q)}><FileDown className="h-4 w-4" /> Vista previa / PDF</DropdownMenuItem>
                    )}
                    {!q.is_template && (
                      <DropdownMenuItem onClick={() => onDuplicate(q)}><Copy className="h-4 w-4" /> Duplicar</DropdownMenuItem>
                    )}
                    {!q.is_template && q.estado === "borrador" && onMarkSent && (
                      <DropdownMenuItem onClick={() => onMarkSent(q)}><Send className="h-4 w-4" /> Marcar como enviado</DropdownMenuItem>
                    )}
                    {!q.is_template && (q.estado === "enviado" || q.estado === "borrador") && onMarkAccepted && (
                      <DropdownMenuItem onClick={() => onMarkAccepted(q)}><CheckCircle2 className="h-4 w-4" /> Aceptar y programar</DropdownMenuItem>
                    )}
                    {!q.is_template && onSendEmail && q.client_id && clientEmails[q.client_id] && (
                      <DropdownMenuItem onClick={() => onSendEmail(q)}>
                        <Mail className="h-4 w-4" /> Enviar por email
                      </DropdownMenuItem>
                    )}
                    {!q.is_template && onCopyLink && (
                      <DropdownMenuItem onClick={() => onCopyLink(q)}>
                        <Link2 className="h-4 w-4" /> Copiar enlace para el cliente
                      </DropdownMenuItem>
                    )}
                    {!q.is_template && q.estado === "aceptado" && (
                      <DropdownMenuItem onClick={() => onConvert(q)}><FileCheck2 className="h-4 w-4" /> Convertir a factura</DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => onDelete(q)}>
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
