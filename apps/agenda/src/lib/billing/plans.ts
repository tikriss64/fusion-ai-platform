// Subscription plans configuration.
// Stripe price IDs are intentionally left blank — they will be wired up in the
// payments part of the build via secrets / Stripe dashboard.
import type { TenantPlan } from "@/lib/types/domain";

export interface PlanDefinition {
  id: TenantPlan;
  name: string;
  monthlyPrice: number; // in major currency units (EUR)
  stripePriceId: string | null;
  limits: {
    professionals: number;
    monthlyAppointments: number;
    smsAddon: boolean;
  };
}

export const PLANS: Record<TenantPlan, PlanDefinition> = {
  trial: {
    id: "trial",
    name: "Trial",
    monthlyPrice: 0,
    stripePriceId: null,
    limits: { professionals: 1, monthlyAppointments: 50, smsAddon: false },
  },
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPrice: 19,
    stripePriceId: null,
    limits: { professionals: 2, monthlyAppointments: 300, smsAddon: false },
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPrice: 49,
    stripePriceId: null,
    limits: { professionals: 8, monthlyAppointments: 2000, smsAddon: true },
  },
  business: {
    id: "business",
    name: "Business",
    monthlyPrice: 99,
    stripePriceId: null,
    limits: { professionals: 50, monthlyAppointments: 100000, smsAddon: true },
  },
};

export const TRIAL_DAYS = 14;
