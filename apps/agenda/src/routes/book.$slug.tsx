import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, Check, Clock, Loader2, User } from "lucide-react";
import {
  getPublicBusiness,
  getAvailability,
  getSlots,
  createPublicBooking,
} from "@/lib/booking/public.functions";
import { getIntakeFields } from "@/lib/booking/fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LanguageProvider, useTranslation } from "@/lib/i18n/LanguageContext";
import { localeNames, type Locale } from "@/lib/i18n/config";

export const Route = createFileRoute("/book/$slug")({
  head: () => ({ meta: [{ title: "Reservar cita" }] }),
  loader: ({ params }) => getPublicBusiness({ data: { slug: params.slug } }),
  errorComponent: () => <BookingError />,
  notFoundComponent: () => <BookingError />,
  component: BookingPage,
});

function BookingError() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">No pudimos cargar esta página</h1>
        <p className="mt-2 text-muted-foreground">Inténtalo de nuevo en unos momentos.</p>
      </div>
    </div>
  );
}

type Business = NonNullable<Awaited<ReturnType<typeof getPublicBusiness>>>;
type Slot = { iso: string; professionalId: string | null };

function fmtMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function ymd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function BookingPage() {
  const data = Route.useLoaderData();
  if (!data) return <BookingError />;
  return (
    <LanguageProvider>
      <BookingFlow business={data} />
    </LanguageProvider>
  );
}

function LanguageSelector() {
  const { locale, setLocale } = useTranslation();
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      {(Object.entries(localeNames) as [Locale, string][]).map(([code, name], i, arr) => (
        <span key={code} className="flex items-center gap-1">
          <button
            onClick={() => setLocale(code)}
            className={cn(
              "transition-colors hover:text-foreground",
              locale === code ? "font-semibold text-foreground" : "",
            )}
          >
            {code.toUpperCase()}
          </button>
          {i < arr.length - 1 && <span>·</span>}
        </span>
      ))}
    </div>
  );
}

function BookingFlow({ business }: { business: Business }) {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { tenant, services, professionals } = business;

  const [step, setStep] = useState(1);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [month, setMonth] = useState<Date>(new Date());
  const [slot, setSlot] = useState<Slot | null>(null);

  const service = services.find((s) => s.id === serviceId) ?? null;
  const eligiblePros = useMemo(
    () =>
      professionals.filter(
        (p) =>
          !Array.isArray(p.servicios_asignados) ||
          p.servicios_asignados.length === 0 ||
          (serviceId ? p.servicios_asignados.includes(serviceId) : true),
      ),
    [professionals, serviceId],
  );

  const fetchAvailability = useServerFn(getAvailability);
  const { data: availability } = useQuery({
    queryKey: ["availability", slug, month.getFullYear(), month.getMonth() + 1],
    queryFn: () =>
      fetchAvailability({
        data: { slug, year: month.getFullYear(), month: month.getMonth() + 1 },
      }),
    enabled: step === 2,
  });

  const fetchSlots = useServerFn(getSlots);
  const { data: slotsData, isFetching: slotsLoading } = useQuery({
    queryKey: ["slots", slug, serviceId, professionalId, selectedDate && ymd(selectedDate)],
    queryFn: () =>
      fetchSlots({
        data: {
          slug,
          serviceId: serviceId!,
          professionalId,
          date: ymd(selectedDate!),
        },
      }),
    enabled: step === 2 && !!serviceId && !!selectedDate,
  });

  const availableSet = useMemo(
    () => new Set(availability?.availableDates ?? []),
    [availability],
  );

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <div>
            <h1 className="text-lg font-bold text-foreground">{tenant.nombre}</h1>
            {tenant.ciudad && <p className="text-xs text-muted-foreground">{tenant.ciudad}</p>}
          </div>
          <LanguageSelector />
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 py-6">
        <Stepper step={step} />

        {step === 1 && (
          <div className="mt-6 space-y-6">
            <section>
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                {t("booking.selectService")}
              </h2>
              <div className="space-y-2">
                {services.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("booking.noServices")}</p>
                )}
                {services.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setServiceId(s.id);
                      setProfessionalId(null);
                      setSlot(null);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl border bg-card p-4 text-left transition-colors",
                      serviceId === s.id
                        ? "border-primary ring-1 ring-primary"
                        : "border-border hover:bg-accent",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className="h-8 w-1.5 rounded-full"
                        style={{ backgroundColor: s.color ?? "#6366f1" }}
                      />
                      <span>
                        <span className="block font-medium text-card-foreground">{s.nombre}</span>
                        <span className="block text-xs text-muted-foreground">
                          {s.duracion_min} {t("common.minutes")}
                        </span>
                      </span>
                    </span>
                    <span className="font-semibold text-foreground">
                      {Number(s.precio) > 0
                        ? fmtMoney(Number(s.precio), tenant.moneda || "EUR")
                        : t("common.free")}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {service && eligiblePros.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-foreground">
                  {t("booking.selectProfessional")}
                </h2>
                <div className="space-y-2">
                  <ProOption
                    label={t("booking.noPreference")}
                    selected={professionalId === null}
                    onClick={() => setProfessionalId(null)}
                  />
                  {eligiblePros.map((p) => (
                    <ProOption
                      key={p.id}
                      label={p.nombre}
                      selected={professionalId === p.id}
                      onClick={() => setProfessionalId(p.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            <Button className="w-full" size="lg" disabled={!serviceId} onClick={() => setStep(2)}>
              {t("common.continue")}
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="mt-6 space-y-6">
            <Card className="p-3">
              <Calendar
                mode="single"
                month={month}
                onMonthChange={setMonth}
                selected={selectedDate}
                onSelect={(d) => {
                  setSelectedDate(d);
                  setSlot(null);
                }}
                disabled={(date) => !availableSet.has(ymd(date))}
                modifiers={{ available: (date) => availableSet.has(ymd(date)) }}
                modifiersClassNames={{ available: "font-semibold text-primary" }}
                className="pointer-events-auto mx-auto"
              />
            </Card>

            {selectedDate && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Clock className="h-4 w-4" /> {t("booking.availableSlots")}
                </h2>
                {slotsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
                  </div>
                ) : (slotsData?.slots.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("booking.noSlots")}</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slotsData!.slots.map((sl) => (
                      <button
                        key={sl.iso}
                        onClick={() => setSlot(sl)}
                        className={cn(
                          "rounded-lg border py-2 text-sm font-medium transition-colors",
                          slot?.iso === sl.iso
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card hover:bg-accent",
                        )}
                      >
                        {fmtTime(sl.iso)}
                      </button>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">{t("booking.timezoneNote")}</p>
              </section>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                <ArrowLeft className="mr-1 h-4 w-4" /> {t("common.back")}
              </Button>
              <Button className="flex-1" disabled={!slot} onClick={() => setStep(3)}>
                {t("common.continue")}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && service && slot && (
          <ClientForm
            business={business}
            slug={slug}
            service={service}
            slot={slot}
            professionalId={slot.professionalId ?? professionalId}
            onBack={() => setStep(2)}
            onDone={(token) => navigate({ to: "/my-booking/$token", params: { token } })}
          />
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:underline">
            {t("booking.poweredBy")}
          </Link>
        </p>
      </div>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  const { t } = useTranslation();
  const items = [
    { n: 1, label: t("booking.step1"), icon: User },
    { n: 2, label: t("booking.step2"), icon: CalendarDays },
    { n: 3, label: t("booking.step3"), icon: Check },
  ];
  return (
    <div className="flex items-center justify-between">
      {items.map((it, i) => (
        <div key={it.n} className="flex flex-1 items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold",
                step >= it.n
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground",
              )}
            >
              <it.icon className="h-4 w-4" />
            </div>
            <span className="text-[11px] text-muted-foreground">{it.label}</span>
          </div>
          {i < items.length - 1 && (
            <div className={cn("mx-1 h-0.5 flex-1", step > it.n ? "bg-primary" : "bg-border")} />
          )}
        </div>
      ))}
    </div>
  );
}

function ProOption({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors",
        selected ? "border-primary ring-1 ring-primary" : "border-border hover:bg-accent",
      )}
    >
      <User className="h-4 w-4 text-muted-foreground" />
      <span className="font-medium text-card-foreground">{label}</span>
    </button>
  );
}

function ClientForm({
  business,
  slug,
  service,
  slot,
  professionalId,
  onBack,
  onDone,
}: {
  business: Business;
  slug: string;
  service: Business["services"][number];
  slot: Slot;
  professionalId: string | null;
  onBack: () => void;
  onDone: (token: string) => void;
}) {
  const { t } = useTranslation();
  const fields = getIntakeFields(business.tenant.tipo_negocio);
  const [values, setValues] = useState<Record<string, any>>({});
  const [rgpd, setRgpd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const createBooking = useServerFn(createPublicBooking);

  const price = Number(service.precio);
  const canPay = business.paymentsEnabled && price > 0;

  const set = (name: string, v: any) => setValues((prev) => ({ ...prev, [name]: v }));

  const submit = async (wantsPayment: boolean) => {
    if (!values.nombre || !values.email) {
      toast.error(t("booking.nameEmailRequired"));
      return;
    }
    if (!rgpd) {
      toast.error(t("booking.rgpdRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const { nombre, email, telefono, ...intake } = values;
      const res = await createBooking({
        data: {
          slug,
          serviceId: service.id,
          professionalId,
          startIso: slot.iso,
          client: { nombre, email, telefono },
          intake,
          rgpdConsent: true,
          wantsPayment,
          origin: window.location.origin,
        },
      });
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }
      toast.success(t("booking.confirmed"));
      onDone(res.token);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("booking.createError"));
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-6 space-y-5">
      <Card className="space-y-1 p-4 text-sm">
        <p className="font-medium text-card-foreground">{service.nombre}</p>
        <p className="text-muted-foreground">
          {new Date(slot.iso).toLocaleString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          · {service.duracion_min} {t("common.minutes")}
        </p>
        <p className="font-semibold text-foreground">
          {price > 0 ? fmtMoney(price, business.tenant.moneda || "EUR") : t("common.free")}
        </p>
      </Card>

      <div className="space-y-4">
        {fields.map((f) => (
          <div key={f.name} className="space-y-1.5">
            <Label htmlFor={f.name}>
              {f.label}
              {f.required && <span className="text-destructive"> *</span>}
            </Label>
            {f.type === "textarea" ? (
              <Textarea
                id={f.name}
                value={values[f.name] ?? ""}
                onChange={(e) => set(f.name, e.target.value)}
              />
            ) : f.type === "select" ? (
              <Select value={values[f.name] ?? ""} onValueChange={(v) => set(f.name, v)}>
                <SelectTrigger id={f.name}>
                  <SelectValue placeholder={t("common.selectPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {f.options?.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : f.type === "checkbox-group" ? (
              <div className="space-y-2 rounded-lg border border-border p-3">
                {f.options?.map((o) => {
                  const arr: string[] = values[f.name] ?? [];
                  const checked = arr.includes(o);
                  return (
                    <label key={o} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(c) =>
                          set(f.name, c ? [...arr, o] : arr.filter((x) => x !== o))
                        }
                      />
                      {o}
                    </label>
                  );
                })}
              </div>
            ) : (
              <Input
                id={f.name}
                type={f.type}
                value={values[f.name] ?? ""}
                onChange={(e) => set(f.name, e.target.value)}
              />
            )}
          </div>
        ))}

        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <Checkbox checked={rgpd} onCheckedChange={(c) => setRgpd(!!c)} className="mt-0.5" />
          <span>
            {t("booking.rgpdConsent")} <span className="text-destructive">*</span>
          </span>
        </label>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1" disabled={submitting}>
          <ArrowLeft className="mr-1 h-4 w-4" /> {t("common.back")}
        </Button>
        {canPay ? (
          <Button className="flex-1" onClick={() => submit(true)} disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("booking.payButton", { amount: fmtMoney(price, business.tenant.moneda || "EUR") })
            )}
          </Button>
        ) : (
          <Button className="flex-1" onClick={() => submit(false)} disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("booking.bookWithoutPayment")
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
