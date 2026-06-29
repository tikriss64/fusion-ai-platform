import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  getOnboardingState,
  saveBusiness,
  saveServices,
  saveSchedule,
  saveTeam,
} from "@/lib/onboarding/onboarding.functions";
import {
  DEFAULT_BUSINESS_HOURS,
  type BusinessHours,
  type ScheduleException,
} from "@/lib/onboarding/constants";
import { Stepper } from "@/components/onboarding/Stepper";
import { StepBusiness, type BusinessForm } from "@/components/onboarding/StepBusiness";
import { StepServices, type ServiceDraft, emptyService } from "@/components/onboarding/StepServices";
import { StepSchedule } from "@/components/onboarding/StepSchedule";
import {
  StepTeam,
  type ProfessionalDraft,
  type ResourceDraft,
} from "@/components/onboarding/StepTeam";
import { SuccessScreen } from "@/components/onboarding/SuccessScreen";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Configura tu negocio — vaciadodepisos.cat" }] }),
  component: OnboardingPage,
});

interface DraftState {
  current: number;
  business: BusinessForm;
  services: ServiceDraft[];
  hours: BusinessHours;
  exceptions: ScheduleException[];
  professionals: ProfessionalDraft[];
  resources: ResourceDraft[];
}

const defaultBusiness: BusinessForm = {
  fullName: "",
  tipoNegocio: "",
  nombreNegocio: "",
  ciudad: "",
  zonaHoraria: "Europe/Madrid",
  moneda: "EUR",
};

function OnboardingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const fetchState = useServerFn(getOnboardingState);
  const saveBusinessFn = useServerFn(saveBusiness);
  const saveServicesFn = useServerFn(saveServices);
  const saveScheduleFn = useServerFn(saveSchedule);
  const saveTeamFn = useServerFn(saveTeam);

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);
  const [persistedServices, setPersistedServices] = useState<
    { id: string; nombre: string; color: string | null }[]
  >([]);
  const [lockedSlug, setLockedSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  const storageKey = user ? `onboarding-draft-${user.id}` : null;

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-state"],
    queryFn: () => fetchState(),
    enabled: !!user,
  });

  // Hydrate draft once data arrives, merging DB state with any local draft.
  useEffect(() => {
    if (!data || draft || !storageKey) return;

    if (data.tenant?.onboarding_completed) {
      navigate({ to: "/dashboard" });
      return;
    }

    let local: Partial<DraftState> | null = null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) local = JSON.parse(raw);
    } catch {
      local = null;
    }

    const settings = data.settings as { business_hours?: BusinessHours; exceptions?: ScheduleException[] } | null;
    setLockedSlug(data.tenant?.slug ?? null);
    setPersistedServices(data.services.map((s) => ({ id: s.id, nombre: s.nombre, color: s.color })));

    const dbStep = data.tenant ? data.tenant.onboarding_step : 2;

    setDraft({
      current: local?.current ?? Math.max(2, dbStep),
      business: local?.business ?? {
        ...defaultBusiness,
        fullName: (user?.user_metadata?.full_name as string) ?? "",
        tipoNegocio: data.tenant?.tipo_negocio ?? "",
        nombreNegocio: data.tenant?.nombre ?? "",
        ciudad: data.tenant?.ciudad ?? "",
        zonaHoraria: data.tenant?.zona_horaria ?? "Europe/Madrid",
        moneda: data.tenant?.moneda ?? "EUR",
      },
      services:
        local?.services ??
        (data.services.length
          ? data.services.map((s) => ({
              nombre: s.nombre,
              duracion_min: s.duracion_min,
              precio: Number(s.precio),
              color: s.color ?? "#6366f1",
              buffer_before_min: s.buffer_before_min,
              buffer_after_min: s.buffer_after_min,
            }))
          : [emptyService()]),
      hours: local?.hours ?? settings?.business_hours ?? DEFAULT_BUSINESS_HOURS,
      exceptions: local?.exceptions ?? settings?.exceptions ?? [],
      professionals:
        local?.professionals ??
        data.professionals.map((p) => ({
          nombre: p.nombre,
          email: p.email ?? "",
          servicios_asignados: p.servicios_asignados ?? [],
        })),
      resources:
        local?.resources ??
        data.resources.map((r) => ({ nombre: r.nombre, tipo: r.tipo, capacidad: r.capacidad })),
    });
  }, [data, draft, storageKey, navigate, user]);

  // Persist draft to localStorage on every change.
  useEffect(() => {
    if (draft && storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(draft));
      } catch {
        /* ignore quota errors */
      }
    }
  }, [draft, storageKey]);

  const update = (patch: Partial<DraftState>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));

  const trialEnds = useMemo(() => {
    if (data?.tenant?.trial_ends_at) return new Date(data.tenant.trial_ends_at);
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d;
  }, [data]);

  if (loading || isLoading || !draft) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </div>
    );
  }

  const handleBusiness = async () => {
    setSaving(true);
    try {
      const res = await saveBusinessFn({
        data: {
          fullName: draft.business.fullName,
          tipoNegocio: draft.business.tipoNegocio,
          nombreNegocio: draft.business.nombreNegocio,
          ciudad: draft.business.ciudad,
          zonaHoraria: draft.business.zonaHoraria,
          moneda: draft.business.moneda,
        },
      });
      setLockedSlug(res.tenant?.slug ?? null);
      update({ current: 3 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleServices = async () => {
    setSaving(true);
    try {
      await saveServicesFn({ data: { services: draft.services } });
      const fresh = await fetchState();
      setPersistedServices(fresh.services.map((s) => ({ id: s.id, nombre: s.nombre, color: s.color })));
      update({ current: 4 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleSchedule = async () => {
    setSaving(true);
    try {
      await saveScheduleFn({ data: { businessHours: draft.hours, exceptions: draft.exceptions } });
      update({ current: 5 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      // Map assigned service ids: drafts may reference persisted ids already.
      await saveTeamFn({
        data: {
          professionals: draft.professionals.map((p) => ({
            nombre: p.nombre,
            email: p.email,
            servicios_asignados: p.servicios_asignados.filter((id) =>
              persistedServices.some((s) => s.id === id),
            ),
          })),
          resources: draft.resources.filter((r) => r.nombre.trim()),
          complete: true,
        },
      });
      if (storageKey) localStorage.removeItem(storageKey);
      update({ current: 6 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  if (draft.current === 6) {
    return <SuccessScreen slug={lockedSlug ?? "tu-negocio"} />;
  }

  return (
    <div className="min-h-screen bg-background">
      {trialEnds && (
        <div className="bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground">
          Prueba gratuita: 14 días sin tarjeta · termina el{" "}
          {trialEnds.toLocaleDateString("es-ES", { day: "numeric", month: "long" })}
        </div>
      )}
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Stepper current={draft.current} />
        <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm">
          {draft.current === 2 && (
            <StepBusiness
              value={draft.business}
              onChange={(business) => update({ business })}
              onNext={handleBusiness}
              saving={saving}
              lockedSlug={lockedSlug}
            />
          )}
          {draft.current === 3 && (
            <StepServices
              services={draft.services}
              onChange={(services) => update({ services })}
              onNext={handleServices}
              onBack={() => update({ current: 2 })}
              saving={saving}
            />
          )}
          {draft.current === 4 && (
            <StepSchedule
              hours={draft.hours}
              exceptions={draft.exceptions}
              onHoursChange={(hours) => update({ hours })}
              onExceptionsChange={(exceptions) => update({ exceptions })}
              onNext={handleSchedule}
              onBack={() => update({ current: 3 })}
              saving={saving}
            />
          )}
          {draft.current === 5 && (
            <StepTeam
              professionals={draft.professionals}
              resources={draft.resources}
              availableServices={persistedServices}
              onProfessionalsChange={(professionals) => update({ professionals })}
              onResourcesChange={(resources) => update({ resources })}
              onFinish={handleFinish}
              onBack={() => update({ current: 4 })}
              saving={saving}
            />
          )}
        </div>
      </div>
    </div>
  );
}
