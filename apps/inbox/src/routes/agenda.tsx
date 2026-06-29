import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  Receipt,
  MessageCircle,
  Video,
  Mail,
  X,
  CalendarDays,
} from "lucide-react";

type EventType = "promise" | "invoice" | "followup" | "meeting";
type EventStatus = "ok" | "warn" | "danger";

interface AgendaEvent {
  id: string;
  type: EventType;
  status: EventStatus;
  title: string;
  source: string; // origen (correo / tarea)
  // offset in days relative to today (negative = past)
  dayOffset: number;
  hour?: string; // "HH:mm"
  manual?: boolean;
  real?: boolean; // evento real detectado en los correos (título ya en texto)
}

const TYPE_ICON: Record<EventType, typeof Clock> = {
  promise: Clock,
  invoice: Receipt,
  followup: MessageCircle,
  meeting: Video,
};

const STATUS_STYLES: Record<
  EventStatus,
  { dot: string; chip: string; border: string; tint: string }
> = {
  ok: {
    dot: "bg-ok",
    chip: "bg-ok/15 text-ok border-ok/25",
    border: "border-l-ok",
    tint: "bg-[color-mix(in_oklab,var(--ok)_8%,transparent)]",
  },
  warn: {
    dot: "bg-warn",
    chip: "bg-warn/20 text-warn-foreground border-warn/30",
    border: "border-l-warn",
    tint: "bg-[color-mix(in_oklab,var(--warn)_10%,transparent)]",
  },
  danger: {
    dot: "bg-danger",
    chip: "bg-danger/15 text-danger border-danger/25",
    border: "border-l-danger",
    tint: "bg-[color-mix(in_oklab,var(--danger)_8%,transparent)]",
  },
};

// Seed events relative to today so the calendar siempre se ve poblado.
const SEED: AgendaEvent[] = [
  { id: "e1", type: "promise", status: "danger", title: "promise.marta", source: "source.marta", dayOffset: 0, hour: "10:00" },
  { id: "e2", type: "promise", status: "warn", title: "promise.juan", source: "source.juan", dayOffset: 0, hour: "17:00" },
  { id: "e3", type: "meeting", status: "ok", title: "meeting.carlos", source: "source.carlos", dayOffset: 0, hour: "12:30" },
  { id: "e4", type: "followup", status: "warn", title: "followup.elena", source: "source.elena", dayOffset: 1, hour: "09:30" },
  { id: "e5", type: "invoice", status: "warn", title: "invoice.iberdrola", source: "source.iberdrola", dayOffset: 2 },
  { id: "e6", type: "meeting", status: "ok", title: "meeting.diego", source: "source.diego", dayOffset: 3, hour: "11:00" },
  { id: "e7", type: "promise", status: "ok", title: "promise.ana", source: "source.ana", dayOffset: 4, hour: "16:00" },
  { id: "e8", type: "invoice", status: "danger", title: "invoice.constructores", source: "source.constructores", dayOffset: -2 },
  { id: "e9", type: "followup", status: "warn", title: "followup.laura", source: "source.laura", dayOffset: 5 },
  { id: "e10", type: "meeting", status: "ok", title: "meeting.raul", source: "source.raul", dayOffset: 7, hour: "10:00" },
  { id: "e11", type: "promise", status: "warn", title: "promise.contrato", source: "source.contrato", dayOffset: 9 },
  { id: "e12", type: "invoice", status: "warn", title: "invoice.hosting", source: "source.hosting", dayOffset: 12 },
  { id: "e13", type: "followup", status: "ok", title: "followup.maria", source: "source.maria", dayOffset: -5 },
];

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function sameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function AgendaPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "fr" ? "fr-FR" : "es-ES";
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [cursor, setCursor] = useState<Date>(startOfMonth(today));
  const [selected, setSelected] = useState<Date>(today);
  const [openEvent, setOpenEvent] = useState<AgendaEvent | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [extra, setExtra] = useState<AgendaEvent[]>([]);
  const [serverEvents, setServerEvents] = useState<AgendaEvent[]>([]);

  // Eventos reales detectados en los correos (promesas, urgentes, reclamaciones).
  useEffect(() => {
    fetch("/api/agenda")
      .then((r) => r.json())
      .then((d: { events: { id: string; type: EventType; status: EventStatus; title: string; source: string; dateMs: number }[] }) => {
        setServerEvents(
          (d.events || []).map((e) => ({
            id: e.id,
            type: e.type,
            status: e.status,
            title: e.title,
            source: e.source,
            dayOffset: Math.round((new Date(e.dateMs).setHours(0, 0, 0, 0) - today.getTime()) / 86400000),
            real: true,
          })),
        );
      })
      .catch(() => {});
  }, [today]);

  const allEvents = useMemo(() => {
    return [...serverEvents, ...extra].map((e) => ({
      ...e,
      date: addDays(today, e.dayOffset),
    }));
  }, [today, serverEvents, extra]);

  // Build month grid (6 weeks, lunes first)
  const cells = useMemo(() => {
    const first = startOfMonth(cursor);
    // Monday = 0
    const offset = (first.getDay() + 6) % 7;
    const start = addDays(first, -offset);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const eventsByDay = useMemo(() => {
    const m = new Map<string, typeof allEvents>();
    for (const e of allEvents) {
      const k = e.date.toDateString();
      const arr = m.get(k) ?? [];
      arr.push(e);
      m.set(k, arr);
    }
    return m;
  }, [allEvents]);

  const dayEvents = (eventsByDay.get(selected.toDateString()) ?? []).sort(
    (a, b) => (a.hour ?? "99").localeCompare(b.hour ?? "99"),
  );

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(cursor);

  const weekdays = useMemo(() => {
    const base = new Date(2024, 0, 1); // a Monday
    return Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(locale, { weekday: "short" }).format(addDays(base, i)),
    );
  }, [locale]);

  const selectedLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(selected);

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto">
        <PageHeader
          icon={CalendarDays}
          title={t("agenda.title")}
          subtitle={t("agenda.subtitle")}
          actions={
            <button
              onClick={() => setManualOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium shadow-soft hover:opacity-90 transition"
            >
              <Plus className="size-4" /> {t("agenda.addEvent")}
            </button>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
          {/* Calendar */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setCursor(addMonths(cursor, -1))}
                className="size-8 rounded-lg hover:bg-accent grid place-items-center transition"
                aria-label="prev"
              >
                <ChevronLeft className="size-4" />
              </button>
              <div className="text-sm font-semibold capitalize">{monthLabel}</div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setCursor(startOfMonth(today));
                    setSelected(today);
                  }}
                  className="px-2.5 h-8 rounded-lg hover:bg-accent text-xs font-medium transition"
                >
                  {t("agenda.today")}
                </button>
                <button
                  onClick={() => setCursor(addMonths(cursor, 1))}
                  className="size-8 rounded-lg hover:bg-accent grid place-items-center transition"
                  aria-label="next"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {weekdays.map((w) => (
                <div
                  key={w}
                  className="text-[11px] font-medium text-muted-foreground text-center py-1 capitalize"
                >
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((d) => {
                const inMonth = d.getMonth() === cursor.getMonth();
                const isToday = sameDate(d, today);
                const isSelected = sameDate(d, selected);
                const evs = eventsByDay.get(d.toDateString()) ?? [];
                return (
                  <button
                    key={d.toISOString()}
                    onClick={() => setSelected(d)}
                    className={[
                      "min-h-[78px] rounded-lg border p-1.5 text-left transition flex flex-col gap-1",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-accent/40",
                      !inMonth && "opacity-40",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={[
                          "text-xs tabular-nums",
                          isToday
                            ? "size-5 rounded-full bg-primary text-primary-foreground grid place-items-center font-semibold"
                            : "font-medium text-foreground",
                        ].join(" ")}
                      >
                        {d.getDate()}
                      </span>
                      {evs.length > 0 && (
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {evs.length}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-auto">
                      {evs.slice(0, 4).map((e) => (
                        <span
                          key={e.id}
                          className={["size-1.5 rounded-full", STATUS_STYLES[e.status].dot].join(
                            " ",
                          )}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground border-t border-border pt-3">
              <span className="font-medium text-foreground">{t("agenda.legend")}:</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-danger" />
                {t("agenda.legendDanger")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-warn" />
                {t("agenda.legendWarn")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-ok" />
                {t("agenda.legendOk")}
              </span>
            </div>
          </div>

          {/* Day list */}
          <aside className="rounded-2xl border border-border bg-card p-4 min-h-[400px]">
            <div className="mb-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("agenda.dayPanel")}
              </div>
              <div className="text-sm font-semibold capitalize mt-0.5">{selectedLabel}</div>
            </div>

            {dayEvents.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-12">
                {t("agenda.emptyDay")}
              </div>
            ) : (
              <ul className="space-y-2">
                {dayEvents.map((e) => {
                  const Icon = TYPE_ICON[e.type];
                  const s = STATUS_STYLES[e.status];
                  return (
                    <li key={e.id}>
                      <button
                        onClick={() => setOpenEvent(e)}
                        className={[
                          "w-full text-left rounded-xl border border-border border-l-4 p-3 hover:shadow-soft transition flex gap-3",
                          s.border,
                          s.tint,
                        ].join(" ")}
                      >
                        <div className="shrink-0 size-8 rounded-lg bg-background/70 grid place-items-center">
                          <Icon className="size-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium truncate">
                              {e.real || e.manual ? e.title : t(`agenda.events.${e.title}`, { defaultValue: e.title })}
                            </span>
                            {e.hour && (
                              <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
                                {e.hour}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className={[
                                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border",
                                s.chip,
                              ].join(" ")}
                            >
                              {t(`agenda.types.${e.type}`)}
                            </span>
                            <span className="text-[11px] text-muted-foreground truncate">
                              {e.manual ? t("agenda.manual") : e.real ? e.source : t(`agenda.sources.${e.source}`, { defaultValue: e.source })}
                            </span>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      </div>

      {/* Event detail modal */}
      {openEvent && (
        <div
          className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"
          onClick={() => setOpenEvent(null)}
        >
          <div
            onClick={(ev) => ev.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-card border border-border shadow-soft p-5"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Mail className="size-4 text-muted-foreground" />
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {openEvent.manual ? t("agenda.manual") : t("agenda.origin")}
                </span>
              </div>
              <button
                onClick={() => setOpenEvent(null)}
                className="size-7 rounded-lg hover:bg-accent grid place-items-center"
              >
                <X className="size-4" />
              </button>
            </div>
            <h3 className="text-base font-semibold">
              {openEvent.real || openEvent.manual ? openEvent.title : t(`agenda.events.${openEvent.title}`, { defaultValue: openEvent.title })}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {openEvent.manual ? t("agenda.manualBody") : openEvent.real ? openEvent.source : t(`agenda.sources.${openEvent.source}`, { defaultValue: openEvent.source })}
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs">
              <span
                className={[
                  "inline-flex items-center gap-1 px-2 py-1 rounded-full border font-medium",
                  STATUS_STYLES[openEvent.status].chip,
                ].join(" ")}
              >
                {t(`agenda.types.${openEvent.type}`)}
              </span>
              {openEvent.hour && (
                <span className="text-muted-foreground tabular-nums">{openEvent.hour}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual add modal */}
      {manualOpen && (
        <ManualEventModal
          onClose={() => setManualOpen(false)}
          onSave={(ev) => {
            setExtra((p) => [
              ...p,
              {
                ...ev,
                id: `m${Date.now()}`,
                manual: true,
                dayOffset: Math.round(
                  (ev._date.getTime() - today.getTime()) / 86400000,
                ),
              },
            ]);
            setSelected(ev._date);
            setManualOpen(false);
          }}
          initialDate={selected}
        />
      )}
    </AppShell>
  );
}

function ManualEventModal({
  onClose,
  onSave,
  initialDate,
}: {
  onClose: () => void;
  onSave: (e: AgendaEvent & { _date: Date }) => void;
  initialDate: Date;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<EventType>("meeting");
  const [status, setStatus] = useState<EventStatus>("ok");
  const [dateStr, setDateStr] = useState(
    `${initialDate.getFullYear()}-${String(initialDate.getMonth() + 1).padStart(2, "0")}-${String(
      initialDate.getDate(),
    ).padStart(2, "0")}`,
  );
  const [hour, setHour] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-card border border-border shadow-soft p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{t("agenda.addTitle")}</h3>
          <button
            onClick={onClose}
            className="size-7 rounded-lg hover:bg-accent grid place-items-center"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {t("agenda.fieldTitle")}
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={t("agenda.fieldTitlePh")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {t("agenda.fieldType")}
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as EventType)}
                className="mt-1 w-full h-9 px-2 rounded-lg border border-input bg-background text-sm"
              >
                <option value="meeting">{t("agenda.types.meeting")}</option>
                <option value="promise">{t("agenda.types.promise")}</option>
                <option value="invoice">{t("agenda.types.invoice")}</option>
                <option value="followup">{t("agenda.types.followup")}</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {t("agenda.fieldStatus")}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as EventStatus)}
                className="mt-1 w-full h-9 px-2 rounded-lg border border-input bg-background text-sm"
              >
                <option value="ok">{t("agenda.legendOk")}</option>
                <option value="warn">{t("agenda.legendWarn")}</option>
                <option value="danger">{t("agenda.legendDanger")}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {t("agenda.fieldDate")}
              </label>
              <input
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="mt-1 w-full h-9 px-3 rounded-lg border border-input bg-background text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {t("agenda.fieldHour")}
              </label>
              <input
                type="time"
                value={hour}
                onChange={(e) => setHour(e.target.value)}
                className="mt-1 w-full h-9 px-3 rounded-lg border border-input bg-background text-sm"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 px-3 rounded-lg border border-border text-sm hover:bg-accent"
          >
            {t("agenda.cancel")}
          </button>
          <button
            disabled={!title.trim()}
            onClick={() => {
              const [y, m, d] = dateStr.split("-").map(Number);
              const date = new Date(y, m - 1, d);
              date.setHours(0, 0, 0, 0);
              onSave({
                id: "",
                type,
                status,
                title: title.trim(),
                source: "__manual__",
                dayOffset: 0,
                hour: hour || undefined,
                _date: date,
              } as AgendaEvent & { _date: Date });
            }}
            className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {t("agenda.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/agenda")({
  head: () => ({ meta: [{ title: "Agenda · AI Inbox Assistant" }] }),
  component: AgendaPage,
});
