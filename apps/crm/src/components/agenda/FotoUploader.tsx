import { useRef, useState } from "react";
import { Camera, Loader2, X, ExternalLink, Link2, ZoomIn, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const MAX_WIDTH = 1400;
const JPEG_QUALITY = 0.82;
const MAX_FILE_MB = 25;

async function compressImage(file: File): Promise<Blob> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    throw new Error(`El archivo pesa más de ${MAX_FILE_MB} MB`);
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["heic", "heif"].includes(ext)) {
    throw new Error("Formato HEIC no compatible. Convierte la foto a JPG antes de subirla.");
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, MAX_WIDTH / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas no disponible")); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Error de compresión"));
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("No se pudo cargar la imagen")); };
    img.src = objectUrl;
  });
}

type Props = {
  trabajoId: string;
  userId: string;
  fotosAntes: string[];
  onFotosAntesChange: (newFotos: string[]) => Promise<void>;
  fotosDespues: string[];
  onFotosDespuesChange: (newFotos: string[]) => Promise<void>;
  carpetaUrl: string | null;
  onCarpetaUrlChange: (url: string) => Promise<void>;
};

type LightboxState = { urls: string[]; index: number } | null;

export function FotoUploader({
  trabajoId,
  userId,
  fotosAntes,
  onFotosAntesChange,
  fotosDespues,
  onFotosDespuesChange,
  carpetaUrl,
  onCarpetaUrlChange,
}: Props) {
  const inputAntesRef = useRef<HTMLInputElement>(null);
  const inputDespuesRef = useRef<HTMLInputElement>(null);
  const [uploadingAntes, setUploadingAntes] = useState(false);
  const [uploadingDespues, setUploadingDespues] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const [tempUrl, setTempUrl] = useState(carpetaUrl ?? "");
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<LightboxState>(null);

  const getPublicUrl = (path: string) =>
    supabase.storage.from("trabajos-fotos").getPublicUrl(path).data.publicUrl;

  const uploadFiles = async (
    files: File[],
    currentFotos: string[],
    onChange: (f: string[]) => Promise<void>,
    setUploading: (b: boolean) => void,
    prefix: "antes" | "despues",
  ) => {
    if (!files.length) return;
    setUploading(true);
    const newPaths: string[] = [];
    try {
      for (const file of files) {
        let blob: Blob;
        try {
          blob = await compressImage(file);
        } catch {
          toast.error(`No se pudo procesar ${file.name}`);
          continue;
        }
        const path = `${userId}/${trabajoId}/${prefix}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.jpg`;
        const { error } = await supabase.storage
          .from("trabajos-fotos")
          .upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (error) {
          const msg = error.message?.toLowerCase() ?? "";
          if (msg.includes("bucket") || msg.includes("not found")) {
            toast.error("El almacén de fotos no está configurado. Contacta con el administrador.", { id: "bucket-error" });
          } else if (msg.includes("policy") || msg.includes("row-level") || msg.includes("denied")) {
            toast.error("Sin permiso para subir fotos. Comprueba que has iniciado sesión.", { id: "policy-error" });
          } else {
            toast.error(`Error al subir ${file.name}: ${error.message}`);
          }
          continue;
        }
        newPaths.push(path);
      }
      if (newPaths.length) {
        await onChange([...currentFotos, ...newPaths]);
        toast.success(newPaths.length === 1 ? "Foto añadida" : `${newPaths.length} fotos añadidas`);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (path: string, currentFotos: string[], onChange: (f: string[]) => Promise<void>) => {
    setDeletingPath(path);
    const { error } = await supabase.storage.from("trabajos-fotos").remove([path]);
    if (error) { toast.error(error.message); setDeletingPath(null); return; }
    await onChange(currentFotos.filter((p) => p !== path));
    setDeletingPath(null);
  };

  const handleSaveUrl = async () => {
    await onCarpetaUrlChange(tempUrl.trim());
    setEditingUrl(false);
  };

  const allUrls = [...fotosAntes, ...fotosDespues].map(getPublicUrl);
  const antesUrls = fotosAntes.map(getPublicUrl);

  return (
    <div className="space-y-5">
      {/* Fotos ANTES */}
      <PhotoSection
        label="Fotos — estado inicial (antes)"
        fotos={fotosAntes}
        uploading={uploadingAntes}
        deletingPath={deletingPath}
        inputRef={inputAntesRef}
        getPublicUrl={getPublicUrl}
        onFileChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          uploadFiles(files, fotosAntes, onFotosAntesChange, setUploadingAntes, "antes").finally(() => {
            if (inputAntesRef.current) inputAntesRef.current.value = "";
          });
        }}
        onDelete={(p) => handleDelete(p, fotosAntes, onFotosAntesChange)}
        onOpenLightbox={(idx) => setLightbox({ urls: antesUrls, index: idx })}
      />

      {/* Fotos DESPUÉS */}
      <PhotoSection
        label="Fotos — resultado final (después)"
        fotos={fotosDespues}
        uploading={uploadingDespues}
        deletingPath={deletingPath}
        inputRef={inputDespuesRef}
        getPublicUrl={getPublicUrl}
        onFileChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          uploadFiles(files, fotosDespues, onFotosDespuesChange, setUploadingDespues, "despues").finally(() => {
            if (inputDespuesRef.current) inputDespuesRef.current.value = "";
          });
        }}
        onDelete={(p) => handleDelete(p, fotosDespues, onFotosDespuesChange)}
        onOpenLightbox={(idx) => setLightbox({ urls: fotosDespues.map(getPublicUrl), index: idx })}
      />

      {/* Lightbox */}
      {lightbox && (
        <Dialog open onOpenChange={() => setLightbox(null)}>
          <DialogContent className="max-w-4xl p-2 bg-black/95 border-none">
            <div className="relative flex items-center justify-center min-h-[60vh]">
              <img
                src={lightbox.urls[lightbox.index]}
                alt="Foto ampliada"
                className="max-h-[78vh] max-w-full object-contain rounded"
              />
              {lightbox.urls.length > 1 && (
                <>
                  <button
                    onClick={() => setLightbox((lb) => lb ? { ...lb, index: (lb.index - 1 + lb.urls.length) % lb.urls.length } : null)}
                    className="absolute left-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setLightbox((lb) => lb ? { ...lb, index: (lb.index + 1) % lb.urls.length } : null)}
                    className="absolute right-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white/60">
                    {lightbox.index + 1} / {lightbox.urls.length}
                  </span>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Enlace carpeta externa (OneDrive / Drive) */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1.5">Carpeta de fotos externa (OneDrive, Google Drive…)</p>
        {carpetaUrl && !editingUrl ? (
          <div className="flex items-center gap-2">
            <a href={carpetaUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir carpeta
              </Button>
            </a>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground text-xs"
              onClick={() => { setTempUrl(carpetaUrl); setEditingUrl(true); }}
            >
              Cambiar enlace
            </Button>
          </div>
        ) : editingUrl ? (
          <div className="flex items-center gap-2">
            <Input
              className="h-8 text-sm flex-1"
              placeholder="https://1drv.ms/… o https://drive.google.com/…"
              value={tempUrl}
              onChange={(e) => setTempUrl(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSaveUrl()}
            />
            <Button size="sm" onClick={handleSaveUrl}>Guardar</Button>
            <Button variant="ghost" size="sm" onClick={() => setEditingUrl(false)}>✕</Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-muted-foreground border-dashed"
            onClick={() => setEditingUrl(true)}
          >
            <Link2 className="h-3.5 w-3.5" />
            Pegar enlace de carpeta
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Sección de fotos reutilizable ────────────────────────────────────────────

type PhotoSectionProps = {
  label: string;
  fotos: string[];
  uploading: boolean;
  deletingPath: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  getPublicUrl: (p: string) => string;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDelete: (p: string) => void;
  onOpenLightbox: (index: number) => void;
};

function PhotoSection({
  label,
  fotos,
  uploading,
  deletingPath,
  inputRef,
  getPublicUrl,
  onFileChange,
  onDelete,
  onOpenLightbox,
}: PhotoSectionProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {fotos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {fotos.map((path, idx) => (
            <div
              key={path}
              className="relative group aspect-square rounded-md overflow-hidden border bg-muted"
            >
              <img
                src={getPublicUrl(path)}
                alt="Foto del trabajo"
                className="h-full w-full object-cover cursor-pointer"
                loading="lazy"
                onClick={() => onOpenLightbox(idx)}
              />
              <button
                onClick={() => onOpenLightbox(idx)}
                className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors"
              >
                <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(path); }}
                disabled={deletingPath === path}
                className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 z-10"
                title="Eliminar foto"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onFileChange}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Camera className="h-3.5 w-3.5" />
          )}
          {uploading ? "Subiendo…" : fotos.length === 0 ? "Añadir fotos" : "Añadir más"}
        </Button>
        {fotos.length === 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Se comprimen automáticamente (~250 KB por foto).
          </p>
        )}
      </div>
    </div>
  );
}
