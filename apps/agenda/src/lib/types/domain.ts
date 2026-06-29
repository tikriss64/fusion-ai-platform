// Domain-level shared types for the booking SaaS.
// These mirror the database schema (see Lovable Cloud tables) and are
// re-exported from the generated Supabase types where possible.
import type { Tables, Enums } from "@/integrations/supabase/types";

export type Tenant = Tables<"tenants">;
export type Profile = Tables<"profiles">;
export type UserRole = Tables<"user_roles">;
export type Professional = Tables<"professionals">;
export type Client = Tables<"clients">;
export type Service = Tables<"services">;
export type Resource = Tables<"resources">;
export type Appointment = Tables<"appointments">;
export type Payment = Tables<"payments">;
export type Invoice = Tables<"invoices">;
export type Subscription = Tables<"subscriptions">;
export type Notification = Tables<"notifications">;
export type Settings = Tables<"settings">;

export type AppRole = Enums<"app_role">;
export type TenantPlan = Enums<"tenant_plan">;
export type AppointmentStatus = Enums<"appointment_status">;
export type PaymentStatus = Enums<"payment_status">;
export type SubscriptionStatus = Enums<"subscription_status">;
export type NotificationType = Enums<"notification_type">;
export type NotificationStatus = Enums<"notification_status">;
export type ResourceType = Enums<"resource_type">;
