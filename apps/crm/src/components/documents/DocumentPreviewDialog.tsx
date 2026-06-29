import { useEffect, useState } from "react";
import { Copy, Download, Loader2, Eye, Code2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  htmlContent: string;
  onDownloadPdf: () => Promise<void>;
};

export function DocumentPreviewDialog({ open, onClose, title, htmlContent, onDownloadPdf }: Props) {
  const [html, setHtml] = useState(htmlContent);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setHtml(htmlContent);
  }, [htmlContent]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(html);
      toast.success("HTML copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar al portapapeles");
    }
  };

  const handlePdf = async () => {
    setGenerating(true);
    try {
      await onDownloadPdf();
    } catch (err) {
      console.error(err);
      toast.error("No se pudo generar el PDF. Vuelve a intentarlo en un momento.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl flex flex-col gap-0 p-0 max-h-[92vh]">
        <DialogHeader className="px-6 pt-5 pb-3 flex-shrink-0 border-b">
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 px-6 py-3 flex-shrink-0 border-b bg-muted/30">
          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
            <Copy className="h-3.5 w-3.5" />
            Copiar HTML
          </Button>
          <Button size="sm" onClick={handlePdf} disabled={generating} className="gap-1.5">
            {generating
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Download className="h-3.5 w-3.5" />}
            {generating ? "Generando…" : "Descargar PDF"}
          </Button>
        </div>

        <Tabs defaultValue="preview" className="flex flex-col flex-1 min-h-0 px-6 pt-3 pb-5">
          <TabsList className="flex-shrink-0 w-fit mb-3">
            <TabsTrigger value="preview" className="gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              Vista previa
            </TabsTrigger>
            <TabsTrigger value="html" className="gap-1.5">
              <Code2 className="h-3.5 w-3.5" />
              HTML editable
            </TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="flex-1 min-h-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col">
            <iframe
              srcDoc={html}
              title="Vista previa"
              className="w-full flex-1 rounded-md border bg-white"
              style={{ minHeight: "54vh" }}
              sandbox="allow-same-origin"
            />
          </TabsContent>

          <TabsContent value="html" className="flex-1 min-h-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col">
            <Textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              className="flex-1 font-mono text-xs resize-none"
              style={{ minHeight: "54vh" }}
              spellCheck={false}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
