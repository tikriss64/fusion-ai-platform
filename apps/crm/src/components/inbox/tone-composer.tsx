import { apiFetch } from "@/components/inbox/api-client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Copy, Send, Pencil, Check, Sparkles, Mic, MicOff, Wand2, Loader2, Paperclip } from "lucide-react";

export type ToneKey = "neutro" | "calido" | "firme" | "ironico" | "cortante";

interface ComposerEmail {
  id: string;
  threadId: string;
  to: string;
  sender: string;
  subject: string;
  isHot?: boolean;
}

const toneOrder: { key: ToneKey; emoji: string; level: "ok" | "warn" | "danger" }[] = [
  { key: "neutro", emoji: "😌", level: "ok" },
  { key: "calido", emoji: "🤝", level: "ok" },
  { key: "firme", emoji: "🛡️", level: "warn" },
  { key: "ironico", emoji: "😏", level: "warn" },
  { key: "cortante", emoji: "✂️", level: "danger" },
];

const thermoStyles: Record<"ok" | "warn" | "danger", string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
};

const thermoDot: Record<"ok" | "warn" | "danger", string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
};

export function ToneComposer({
  email,
  onClose,
}: {
  email: ComposerEmail;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [toneKey, setToneKey] = useState<ToneKey>("neutro");
  const [myStyle, setMyStyle] = useState(false);

  const toneDef = useMemo(
    () => toneOrder.find((x) => x.key === toneKey)!,
    [toneKey],
  );
  const toneText = t(`composer.tones.${toneKey}.text`);
  const toneTextStyle = t(`composer.tones.${toneKey}.textStyle`, { defaultValue: toneText });
  const toneThermo = t(`composer.tones.${toneKey}.thermo`);

  const baseText = useMemo(() => (myStyle ? toneTextStyle : toneText), [myStyle, toneText, toneTextStyle]);

  const [text, setText] = useState(baseText);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Dictado por voz REAL (Web Speech API). Si el navegador no lo soporta, el botón
  // no se muestra: nada de simulacros.
  const SpeechRecognitionCtor: any =
    typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : undefined;
  const voiceAvailable = !!SpeechRecognitionCtor;
  const [voiceState, setVoiceState] = useState<"idle" | "listening">("idle");
  const [transcript, setTranscript] = useState("");
  const recogRef = useRef<any>(null);
  const voiceBaseRef = useRef("");

  const stopVoice = () => {
    try { recogRef.current?.stop(); } catch {}
    recogRef.current = null;
    setVoiceState("idle");
    setTranscript("");
  };

  const startVoice = () => {
    if (!SpeechRecognitionCtor) return;
    const rec = new SpeechRecognitionCtor();
    rec.lang = i18n.language === "fr" ? "fr-FR" : "es-ES";
    rec.continuous = true;
    rec.interimResults = true;
    voiceBaseRef.current = text.trim() ? text.trim() + " " : "";
    setEditing(true);
    rec.onresult = (ev: any) => {
      let finalChunk = "";
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (res.isFinal) finalChunk += res[0].transcript;
        else interim += res[0].transcript;
      }
      if (finalChunk) voiceBaseRef.current += finalChunk;
      setTranscript(interim);
      setText(voiceBaseRef.current + interim);
    };
    rec.onerror = () => stopVoice();
    rec.onend = () => { setVoiceState("idle"); setTranscript(""); };
    recogRef.current = rec;
    setTranscript("");
    setVoiceState("listening");
    try { rec.start(); } catch { stopVoice(); }
  };

  useEffect(() => {
    setText(baseText);
    setEditing(false);
    stopVoice();
  }, [baseText, i18n.language]);

  useEffect(() => () => { try { recogRef.current?.stop(); } catch {} }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  // Generar respuesta REAL con IA según el correo + tono
  const [generating, setGenerating] = useState(false);
  const generateWithAI = async () => {
    setGenerating(true);
    try {
      const res = await apiFetch(`/api/email/${email.id}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone: toneKey, myStyle, lang: i18n.language }),
      });
      const data = (await res.json()) as { draft: string | null };
      if (data.draft) {
        setText(data.draft);
        setEditing(false);
      }
    } catch {}
    setGenerating(false);
  };

  // Enviar la respuesta de verdad
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [attachments, setAttachments] = useState<{ filename: string; mimeType: string; base64: string; size: number }[]>([]);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) continue;
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.readAsDataURL(file);
      });
      setAttachments((prev) => [...prev, { filename: file.name, mimeType: file.type || "application/octet-stream", base64, size: file.size }]);
    }
  };

  const handleSend = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      const res = await apiFetch(`/api/email/${email.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email.to,
          subject: email.subject,
          body: text,
          threadId: email.threadId,
          attachments: attachments.map(({ filename, mimeType, base64 }) => ({ filename, mimeType, base64 })),
        }),
      });
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) {
        setSent(true);
        setTimeout(() => onClose(), 1200);
      } else {
        setSending(false);
      }
    } catch {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/40 backdrop-blur-sm p-0 sm:p-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[92vh] overflow-auto rounded-t-3xl sm:rounded-3xl bg-card border border-border shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-border">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
              <Sparkles className="size-3.5" /> {t("composer.title")}
            </div>
            <div className="text-sm font-semibold truncate">{t("composer.replyTo", { sender: email.sender })}</div>
            <div className="text-xs text-muted-foreground truncate">{t("composer.rePrefix", { subject: email.subject })}</div>
          </div>
          <button
            onClick={onClose}
            aria-label={t("composer.close")}
            className="shrink-0 size-8 rounded-full hover:bg-accent grid place-items-center text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {email.isHot && (
            <div className="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3.5">
              <div className="flex items-start gap-3">
                <span className="text-xl leading-none">🧘</span>
                <div className="text-[13px] leading-relaxed text-foreground">
                  <span className="font-semibold">{t("composer.calmTitle")}</span>{" "}
                  {t("composer.calmBody")}
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              {t("composer.chooseTone")}
            </div>
            <div className="flex flex-wrap gap-2">
              {toneOrder.map((tdef) => {
                const active = tdef.key === toneKey;
                return (
                  <button
                    key={tdef.key}
                    type="button"
                    onClick={() => setToneKey(tdef.key)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-all ${
                      active
                        ? "bg-primary text-primary-foreground border-primary shadow-soft scale-[1.02]"
                        : "bg-card text-foreground border-border hover:bg-accent"
                    }`}
                  >
                    <span>{tdef.emoji}</span>
                    <span className="font-medium">{t(`composer.tones.${tdef.key}.label`)}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setMyStyle((s) => !s)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-all ${
                  myStyle
                    ? "bg-primary text-primary-foreground border-primary shadow-soft scale-[1.02]"
                    : "bg-card text-foreground border-border hover:bg-accent"
                }`}
                aria-pressed={myStyle}
              >
                <span>✍️</span>
                <span className="font-medium">{t("composer.myStyle")}</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-background overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-card/50">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {t("composer.preview")} {editing && `· ${t("composer.editing")}`}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={generateWithAI}
                  disabled={generating}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60 transition-colors"
                >
                  {generating ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                  {generating
                    ? (i18n.language === "fr" ? "Génération…" : "Generando…")
                    : (i18n.language === "fr" ? "Générer avec IA" : "Generar con IA")}
                </button>
                {voiceAvailable && (
                  <button
                    type="button"
                    onClick={voiceState === "idle" ? startVoice : stopVoice}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      voiceState !== "idle"
                        ? "bg-danger text-danger-foreground"
                        : "bg-primary/10 text-primary hover:bg-primary/20"
                    }`}
                    aria-pressed={voiceState !== "idle"}
                  >
                    {voiceState !== "idle" ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
                    {voiceState !== "idle" ? t("composer.voice.stop") : t("composer.voice.start")}
                  </button>
                )}
                <button
                  onClick={() => setEditing((e) => !e)}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="size-3.5" />
                  {editing ? t("composer.done") : t("composer.edit")}
                </button>
              </div>
            </div>

            {voiceState !== "idle" && (
              <div className="border-b border-border bg-primary/5 px-4 py-3">
                <div className="mb-1.5 flex items-center gap-2 text-[11px] uppercase tracking-wider text-primary">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                    <span className="relative inline-flex size-2 rounded-full bg-primary" />
                  </span>
                  {t("composer.voice.listening")}
                </div>
                <div className="min-h-[1.25rem] text-[13px] italic leading-snug text-foreground/80">
                  {transcript || t("composer.voice.hint")}
                  {voiceState === "listening" && <span className="ml-0.5 animate-pulse">▍</span>}
                </div>
              </div>
            )}

            <textarea
              key={toneKey}
              value={text}
              onChange={(e) => setText(e.target.value)}
              readOnly={!editing}
              rows={10}
              className={`w-full resize-none bg-transparent px-4 py-3.5 text-[14px] leading-relaxed text-foreground outline-none transition-colors ${
                editing ? "ring-2 ring-primary/30" : ""
              }`}
            />
          </div>

          <div className={`flex items-center gap-3 rounded-xl px-4 py-3 ${thermoStyles[toneDef.level]}`}>
            <div className="flex items-center gap-1.5">
              <span className="text-lg leading-none">🌡️</span>
              <span className={`size-2 rounded-full ${thermoDot[toneDef.level]}`} />
            </div>
            <div className="text-[13px] font-medium">{toneThermo}</div>
          </div>
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-6 pt-3">
            {attachments.map((att, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs">
                <Paperclip className="size-3 text-muted-foreground" />
                <span className="max-w-[140px] truncate">{att.filename}</span>
                <button type="button" onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-danger">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-card/40">
          <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-[13px] font-medium text-foreground hover:bg-accent transition-colors cursor-pointer">
            <Paperclip className="size-3.5" />
            <span className="hidden sm:inline">{i18n.language === "fr" ? "Joindre" : "Adjuntar"}</span>
            <input type="file" multiple className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
          </label>
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-[13px] font-medium text-foreground hover:bg-accent transition-colors"
          >
            <Pencil className="size-3.5" /> {t("composer.edit")}
          </button>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-[13px] font-medium text-foreground hover:bg-accent transition-colors"
          >
            {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
            {copied ? t("composer.copied") : t("composer.copy")}
          </button>
          <button
            onClick={handleSend}
            disabled={sending || sent || !text.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-soft disabled:opacity-60"
          >
            {sent ? <Check className="size-3.5" /> : sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            {sent
              ? (i18n.language === "fr" ? "Envoyé !" : "¡Enviado!")
              : sending
                ? (i18n.language === "fr" ? "Envoi…" : "Enviando…")
                : t("composer.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
