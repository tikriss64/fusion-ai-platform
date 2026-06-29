import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Search, Sparkles, X, Mail, ArrowRight, Loader2, Archive, Trash2, ShieldAlert } from "lucide-react";
import { EmailDetail } from "@/components/email-detail";

interface RelatedEmail {
  id: string;
  sender: string;
  subject: string;
  summary: string;
  time: string;
}

interface MockAnswer {
  answer: string;
  related: RelatedEmail[];
}

// Devuelve una respuesta "mock" en función de palabras clave en la pregunta.
function buildMockAnswer(q: string, lang: string, t: (k: string) => string): MockAnswer {
  const norm = q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const has = (...kws: string[]) => kws.some((k) => norm.includes(k));

  // ---- Promesas / Juan ----
  if (has("juan") || has("promet", "promesa", "promis")) {
    return {
      answer:
        lang === "fr"
          ? "Juan García attend de toi le **devis de rénovation** que tu lui as promis lundi dernier. C'est ta promesse la plus en retard cette semaine. Je te suggère de l'envoyer aujourd'hui même : tu peux réutiliser le brouillon que tu avais préparé."
          : "Juan García espera de ti el **presupuesto de reforma** que le prometiste el lunes pasado. Es tu promesa más atrasada esta semana. Te sugiero enviarlo hoy mismo: puedes reutilizar el borrador que ya tenías preparado.",
      related: [
        {
          id: "1",
          sender: "Juan García · Reforma Oficina",
          subject: lang === "fr" ? "Re : Devis de rénovation" : "Re: Presupuesto de reforma",
          summary:
            lang === "fr"
              ? "« Tu m'avais dit lundi… toujours rien reçu. »"
              : "«Me dijiste el lunes… aún no he recibido nada.»",
          time: lang === "fr" ? "il y a 3 jours" : "hace 3 días",
        },
        {
          id: "2",
          sender: lang === "fr" ? "Toi → Juan García" : "Tú → Juan García",
          subject: lang === "fr" ? "Devis rénovation bureau" : "Presupuesto reforma oficina",
          summary:
            lang === "fr"
              ? "« Je t'envoie le devis détaillé lundi sans faute. »"
              : "«Te paso el presupuesto detallado el lunes sin falta.»",
          time: lang === "fr" ? "il y a 10 jours" : "hace 10 días",
        },
      ],
    };
  }

  // ---- Facturas ----
  if (has("factura", "facture", "vence", "pago", "paiement", "imp")) {
    return {
      answer:
        lang === "fr"
          ? "Tu as **3 factures** en jeu ce mois-ci. Une est déjà échue (Constructores Norte · 3 200 €, 12 jours de retard) et deux arrivent à échéance : Iberdrola le 15/06 (142,80 €) et HostingPro le 30/06 (1 200 €). Je te recommande de relancer Constructores aujourd'hui."
          : "Tienes **3 facturas** en juego este mes. Una ya está vencida (Constructores Norte · 3.200 €, 12 días de retraso) y dos próximas a vencer: Iberdrola el 15/06 (142,80 €) y HostingPro el 30/06 (1.200 €). Te recomiendo reclamar la de Constructores hoy.",
      related: [
        {
          id: "f1",
          sender: "Constructores del Norte",
          subject: lang === "fr" ? "Facture FN-2026-0188" : "Factura FN-2026-0188",
          summary:
            lang === "fr"
              ? "3 200 € · échue il y a 12 jours"
              : "3.200 € · vencida hace 12 días",
          time: "12/05",
        },
        {
          id: "f2",
          sender: "Iberdrola Clientes S.A.U.",
          subject: lang === "fr" ? "Facture FE25-0094821" : "Factura FE25-0094821",
          summary:
            lang === "fr"
              ? "142,80 € · échéance 15/06"
              : "142,80 € · vence el 15/06",
          time: "01/06",
        },
        {
          id: "f3",
          sender: "Raúl Méndez · HostingPro",
          subject: lang === "fr" ? "Renouvellement annuel" : "Renovación anual",
          summary:
            lang === "fr"
              ? "1 200 € · échéance 30/06"
              : "1.200 € · vence el 30/06",
          time: lang === "fr" ? "hier" : "ayer",
        },
      ],
    };
  }

  // ---- Marta / reclamación ----
  if (has("marta", "reclam", "enfad", "colere", "queja")) {
    return {
      answer:
        lang === "fr"
          ? "Marta López a envoyé **3 e-mails de plus en plus tendus** au sujet du devis non reçu. Son ton est passé de neutre à insatisfait en une semaine. Je te suggère d'appeler avant d'écrire : un appel court désamorce mieux qu'un long e-mail."
          : "Marta López ha enviado **3 correos cada vez más tensos** sobre el presupuesto que no le llegó. Su tono pasó de neutro a insatisfecho en una semana. Te sugiero llamar antes de escribir: una llamada corta desactiva mejor que un correo largo.",
      related: [
        {
          id: "m1",
          sender: "Marta López · Acme S.L.",
          subject: lang === "fr" ? "Re : Devis non reçu" : "Re: Presupuesto no recibido",
          summary:
            lang === "fr"
              ? "Ton : insatisfait · promesse non tenue"
              : "Tono: insatisfecho · promesa incumplida",
          time: "08:14",
        },
      ],
    };
  }

  // ---- Oportunidades ----
  if (has("oportunid", "opportun", "manten", "mainten")) {
    return {
      answer:
        lang === "fr"
          ? "J'ai détecté **2 opportunités tièdes** cette semaine : Elena Vega demande des services de maintenance mensuelle (~12 000 €/an) et Clínica Dental Norte s'intéresse au module CRM (1 800 €/an). Ne laisse pas Elena refroidir."
          : "He detectado **2 oportunidades calientes** esta semana: Elena Vega pregunta por mantenimiento mensual (~12.000 €/año) y Clínica Dental Norte tiene interés en el módulo CRM (1.800 €/año). No dejes que Elena se enfríe.",
      related: [
        {
          id: "o1",
          sender: "Elena Vega · Consultora Delta",
          subject:
            lang === "fr"
              ? "Faites-vous de la maintenance d'infrastructure ?"
              : "¿Hacéis mantenimiento de infraestructura?",
          summary:
            lang === "fr"
              ? "Premier contact · ~12 000 €/an"
              : "Primer contacto · ~12.000 €/año",
          time: "10:05",
        },
        {
          id: "o2",
          sender: "Clínica Dental Norte",
          subject: lang === "fr" ? "Module CRM" : "Módulo de CRM",
          summary: lang === "fr" ? "Intérêt confirmé · 1 800 €/an" : "Interés confirmado · 1.800 €/año",
          time: lang === "fr" ? "hier" : "ayer",
        },
      ],
    };
  }

  // ---- Reuniones / esta semana ----
  if (has("reunion", "réunion", "reunión", "meeting", "semana", "semaine", "hoy", "aujourd")) {
    return {
      answer:
        lang === "fr"
          ? "Cette semaine tu as **3 réunions détectées** dans tes e-mails : Carlos Ruiz aujourd'hui (12:30), Diego Soto jeudi (11:00) et Raúl Méndez la semaine prochaine. Aucune n'est encore confirmée dans ton agenda."
          : "Esta semana tienes **3 reuniones detectadas** en tus correos: Carlos Ruiz hoy (12:30), Diego Soto el jueves (11:00) y Raúl Méndez la próxima semana. Ninguna está aún confirmada en tu agenda.",
      related: [
        {
          id: "r1",
          sender: "Carlos Ruiz · TechNova",
          subject: lang === "fr" ? "Mise à jour du projet web" : "Actualización del proyecto web",
          summary: lang === "fr" ? "Aujourd'hui · 12:30" : "Hoy · 12:30",
          time: "09:32",
        },
        {
          id: "r2",
          sender: "Diego Soto · Financiera Norte",
          subject:
            lang === "fr" ? "Proposition de partenariat" : "Propuesta de partnership",
          summary: lang === "fr" ? "Jeudi · 11:00" : "Jueves · 11:00",
          time: lang === "fr" ? "hier" : "ayer",
        },
      ],
    };
  }

  // ---- Genérico ----
  return {
    answer:
      lang === "fr"
        ? "Voici ce que j'ai trouvé de plus pertinent dans ta boîte. Affine ta question avec un nom, une date ou un type (factures, promesses, réunions) pour des résultats plus ciblés."
        : "Esto es lo más relevante que he encontrado en tu bandeja. Afina la pregunta con un nombre, una fecha o un tipo (facturas, promesas, reuniones) para resultados más precisos.",
    related: [
      {
        id: "g1",
        sender: "Marta López · Acme S.L.",
        subject: lang === "fr" ? "Re : Devis non reçu" : "Re: Presupuesto no recibido",
        summary:
          lang === "fr"
            ? "Réclamation · promesse non tenue"
            : "Reclamación · promesa incumplida",
        time: "08:14",
      },
      {
        id: "g2",
        sender: "Elena Vega · Consultora Delta",
        subject:
          lang === "fr"
            ? "Faites-vous de la maintenance ?"
            : "¿Hacéis mantenimiento?",
        summary: lang === "fr" ? "Opportunité détectée" : "Oportunidad detectada",
        time: "10:05",
      },
    ],
  };
}

const SUGGESTIONS_ES = [
  "¿Qué correos urgentes tengo?",
  "¿Quién me ha prometido algo?",
  "¿Hay algún cliente molesto?",
  "Resume lo más importante de hoy",
  "¿Qué correos comerciales he recibido?",
];
const SUGGESTIONS_FR = [
  "Quels e-mails urgents ai-je ?",
  "Qui m'a promis quelque chose ?",
  "Y a-t-il un client mécontent ?",
  "Résume l'essentiel d'aujourd'hui",
  "Quels e-mails commerciaux ai-je reçus ?",
];

export function AskBar() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || "es").slice(0, 2);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ q: string; data: MockAnswer } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const modalInputRef = useRef<HTMLInputElement>(null);

  // Al abrir el buscador, enfoca y SELECCIONA el texto anterior → escribir lo reemplaza
  // directamente (sin tener que borrarlo a mano para hacer otra pregunta).
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => {
        modalInputRef.current?.focus();
        modalInputRef.current?.select();
      }, 30);
      return () => clearTimeout(id);
    }
  }, [open]);

  // Limpia la pregunta y el resultado → vuelve a mostrar las sugerencias, listo para otra.
  const clearSearch = () => {
    setQuery("");
    setResult(null);
    setLoading(false);
    modalInputRef.current?.focus();
  };

  // Acción directa sobre un correo encontrado (sin IA). Lo quita de la lista al hacerla.
  const doAction = async (id: string, action: "archive" | "trash" | "spam") => {
    try { await fetch(`/api/email/${id}/${action}`, { method: "POST" }); } catch {}
    setResult((r) =>
      r ? { ...r, data: { ...r.data, related: r.data.related.filter((e) => e.id !== id) } } : r,
    );
  };

  const suggestions = lang === "fr" ? SUGGESTIONS_FR : SUGGESTIONS_ES;

  // Cerrar al pulsar Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const fmtTime = (ms: number) =>
    new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "es-ES", { day: "numeric", month: "short" }).format(new Date(ms));

  const ask = async (q: string) => {
    if (!q.trim()) return;
    setOpen(true);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/inbox/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q.trim(), lang }),
      });
      const d = (await res.json()) as {
        answer: string | null;
        related?: { id: string; sender: string; subject: string; summary: string; received_at: number }[];
      };
      const related: RelatedEmail[] = (d.related || []).map((e) => ({
        id: e.id,
        sender: e.sender,
        subject: e.subject,
        summary: e.summary,
        time: fmtTime(e.received_at),
      }));
      setResult({
        q: q.trim(),
        data: {
          answer: d.answer || (lang === "fr" ? "Je n'ai pas trouvé de réponse." : "No encontré respuesta."),
          related,
        },
      });
    } catch {
      setResult({
        q: q.trim(),
        data: { answer: lang === "fr" ? "Erreur de connexion." : "Error de conexión.", related: [] },
      });
    }
    setLoading(false);
  };

  const placeholder = t("ask.placeholder");

  const formattedAnswer = useMemo(() => {
    if (!result) return null;
    // Renderizar **bold** sencillo
    const parts = result.data.answer.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith("**") && p.endsWith("**") ? (
        <strong key={i} className="text-foreground font-semibold">
          {p.slice(2, -2)}
        </strong>
      ) : (
        <span key={i}>{p}</span>
      ),
    );
  }, [result]);

  return (
    <>
      <div className="relative">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ask(query);
          }}
          placeholder={placeholder}
          className="h-9 w-72 lg:w-96 pl-9 pr-3 rounded-full border border-border bg-background/70 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition"
        />
      </div>

      {open && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-20 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            ref={panelRef}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl bg-card border border-border shadow-soft overflow-hidden"
          >
            {/* Input */}
            <div className="flex items-center gap-2 px-4 h-14 border-b border-border">
              <Sparkles className="size-4 text-primary shrink-0" />
              <input
                ref={modalInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") ask(query);
                }}
                placeholder={placeholder}
                className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
              />
              {(query || result) && (
                <button
                  onClick={clearSearch}
                  title={lang === "fr" ? "Nouvelle question" : "Nueva pregunta"}
                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground px-2 h-7 rounded-lg hover:bg-accent transition shrink-0"
                >
                  {lang === "fr" ? "Effacer" : "Limpiar"}
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="size-7 rounded-lg hover:bg-accent grid place-items-center shrink-0"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[60vh] overflow-auto">
              {!result && !loading && (
                <div className="p-5">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
                    {t("ask.suggestionsTitle")}
                  </div>
                  <div className="space-y-1.5">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          setQuery(s);
                          ask(s);
                        }}
                        className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent text-sm transition group"
                      >
                        <Search className="size-3.5 text-muted-foreground" />
                        <span className="flex-1">{s}</span>
                        <ArrowRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {loading && (
                <div className="p-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                  <Loader2 className="size-5 animate-spin text-primary" />
                  {t("ask.thinking")}
                </div>
              )}

              {result && !loading && (
                <div className="p-5 space-y-5">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                      {t("ask.questionLabel")}
                    </div>
                    <div className="text-sm font-medium">{result.q}</div>
                  </div>

                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-primary font-semibold mb-2">
                      <Sparkles className="size-3.5" />
                      {t("ask.aiAnswer")}
                    </div>
                    <p className="text-sm leading-relaxed text-foreground">{formattedAnswer}</p>
                  </div>

                  {result.data.related.length > 0 && (
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                        {t("ask.relatedEmails")} · {result.data.related.length}
                      </div>
                      <div className="space-y-2">
                        {result.data.related.map((e) => (
                          <div
                            key={e.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setOpenId(e.id)}
                            onKeyDown={(ev) => { if (ev.key === "Enter") setOpenId(e.id); }}
                            className="relative isolate rounded-xl border border-border bg-background p-3 hover:border-primary/40 transition cursor-pointer"
                          >
                            <div className="flex items-start gap-3">
                              <div className="size-8 rounded-lg bg-accent grid place-items-center shrink-0">
                                <Mail className="size-4 text-muted-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-semibold truncate">{e.sender}</span>
                                  <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{e.time}</span>
                                </div>
                                <div className="text-sm text-foreground truncate">{e.subject}</div>
                                <div className="text-xs text-muted-foreground truncate mt-0.5">{e.summary}</div>
                              </div>
                            </div>
                            {/* Acciones rápidas (sin IA) — siempre visibles para evitar confusión entre tarjetas */}
                            <div className="mt-2.5 pt-2.5 border-t border-border flex items-center gap-1.5">
                              <button
                                onClick={(ev) => { ev.stopPropagation(); setOpenId(e.id); }}
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-medium transition"
                              >
                                <Mail className="size-3.5" />
                                {lang === "fr" ? "Ouvrir" : "Abrir"}
                              </button>
                              <div className="flex-1" />
                              <button
                                onClick={(ev) => { ev.stopPropagation(); doAction(e.id, "archive"); }}
                                title={lang === "fr" ? "Archiver" : "Archivar"}
                                className="size-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-accent transition"
                              >
                                <Archive className="size-4" />
                              </button>
                              <button
                                onClick={(ev) => { ev.stopPropagation(); doAction(e.id, "spam"); }}
                                title="Spam"
                                className="size-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-warn/20 hover:text-warn transition"
                              >
                                <ShieldAlert className="size-4" />
                              </button>
                              <button
                                onClick={(ev) => { ev.stopPropagation(); doAction(e.id, "trash"); }}
                                title={lang === "fr" ? "Corbeille" : "Papelera"}
                                className="size-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-danger/20 hover:text-danger transition"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-[11px] text-muted-foreground italic">
                    {t("ask.disclaimer")}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Visor de correo abierto desde un resultado de búsqueda */}
      <EmailDetail
        emailId={openId}
        onClose={() => setOpenId(null)}
        onAction={(id) => setResult((r) => (r ? { ...r, data: { ...r.data, related: r.data.related.filter((e) => e.id !== id) } } : r))}
      />
    </>
  );
}
