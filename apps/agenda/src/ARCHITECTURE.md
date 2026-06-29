# Arquitectura del proyecto — SaaS de reservas multi-tenant

Stack real (adaptado a la plataforma Lovable):

- **Frontend/SSR**: TanStack Start (React 19) + TypeScript + TailwindCSS + shadcn/ui
- **Base de datos + Auth**: Lovable Cloud (Supabase PostgreSQL + RLS)
- **Server-side**: TanStack server functions (`createServerFn`) y server routes (`src/routes/api/`)
- **Pagos**: Stripe (Checkout + Subscriptions + Webhooks)
- **Emails**: Resend · **SMS**: Twilio (add-on opcional)
- **Calendario**: FullCalendar · **i18n**: ES/FR/EN

> Nota: La plataforma no usa Next.js; TanStack Start cubre las mismas
> necesidades (SSR, rutas API, RPC tipado servidor↔cliente).

## Multi-tenancy y seguridad

Cada tabla incluye `tenant_id` y tiene **Row Level Security** activado. El
aislamiento se basa en funciones `security definer`:

- `current_tenant_id()` → tenant del usuario autenticado (vía `profiles`)
- `has_role(user_id, role)` → comprobación de rol sin recursión
- Los roles viven en `user_roles` (tabla separada, anti escalada de privilegios)

## Estructura de carpetas

```
src/
├── routes/                      # Rutas de página y API (file-based)
│   └── api/public/webhooks/     # Stripe webhook (a implementar)
├── lib/
│   ├── auth/                    # Contexto de usuario/tenant (server fns)
│   ├── billing/                 # Planes y lógica de suscripción
│   ├── i18n/                    # config + messages (es/fr/en)
│   └── types/                   # Tipos de dominio (derivados del schema)
├── integrations/
│   ├── supabase/                # Cliente auto-generado (no editar)
│   ├── stripe/                  # Config Stripe (server-only)
│   ├── resend/                  # Config emails (server-only)
│   └── twilio/                  # Config SMS (server-only)
└── components/                  # UI (shadcn/ui) — a construir en partes siguientes
```

## Tablas (todas con `tenant_id` + RLS)

tenants · profiles · user_roles · professionals · clients · services ·
resources · appointments · payments · invoices · subscriptions ·
notifications · settings

## Secrets pendientes (se configuran en sus respectivas partes)

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`,
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
