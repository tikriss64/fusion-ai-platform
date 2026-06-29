# FUSION AI Platform

<div align="center">

**🇬🇧 English · 🇫🇷 Français · 🇪🇸 Español**

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare)](https://workers.cloudflare.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-Monorepo-EF4444)](https://turbo.build/)

</div>

---

## 🇬🇧 English

### Unified AI-powered business management platform

FUSION is a monorepo that brings together four tools into a single coherent system — a true "mission control" for daily business operations, built to be maximally powerful with minimal AI token cost.

**Apps included:**
- **CRM** — clients, quotes, invoices, leads (auto-captured from website forms), field jobs, AI assistant (voice + text)
- **Inbox** — AI-powered Gmail inbox with categorization, document extraction, risks & waiting tracking
- **Agenda** — field operations scheduling, intervention tracking, conflict detection
- **Web** — vaciadodepisos.cat lead capture integration

**AI Architecture (hybrid, cost-optimized):**
- Gemini Flash — navigation, voice input, simple actions
- Groq — deeper interpretation tasks
- Local command router — handles ~80% of commands with zero tokens (instant response)
- No automatic action chains — every operation individually validated for data security

**Key features:**
- Row-Level Security (Supabase RLS) — data isolation between tenants
- Mission Control dashboard — KPIs, revenue, active modules overview
- Voice + text AI assistant — create clients, quotes, invoices in natural language
- Document extraction — AI reads attachments and fills data automatically
- Risk detection — overdue invoices, pending quotes flagged automatically
- Multilingual — ES/FR

**Tech stack:**
| Layer | Technology |
|---|---|
| Runtime | Bun 1.3 |
| Orchestration | Turborepo |
| Lint + Format | Biome 2.2 |
| Frontend | TanStack Start + React + shadcn/ui |
| Backend/Data | Supabase (PostgreSQL + pgvector HNSW) |
| Deployment | Cloudflare Workers |
| AI | Gemini Flash + Groq |

---

## 🇫🇷 Français

### Plateforme unifiée de gestion d'entreprise assistée par IA

FUSION est un monorepo qui regroupe quatre outils en un seul système cohérent — une véritable « salle de contrôle » pour la gestion quotidienne, conçue pour être maximalement puissante avec un coût IA minimal.

**Applications incluses :** CRM (clients, devis, factures, leads, jobs terrain, assistant IA voix+texte), Inbox (bandeja Gmail IA), Agenda (opérations terrain), Web (intégration vaciadodepisos.cat).

**Architecture IA hybride :** Gemini Flash + Groq + routeur local (~80% des commandes sans token). Aucune chaîne d'actions automatiques — chaque opération validée individuellement pour la sécurité des données.

---

## 🇪🇸 Español

### Plataforma unificada de gestión empresarial con IA

FUSION es un monorepo que reúne cuatro herramientas en un solo sistema coherente — una verdadera «sala de control» para la gestión diaria, construida para ser maximalmente potente con mínimo coste de tokens IA.

**Apps incluidas:** CRM (clientes, presupuestos, facturas, leads, trabajos de campo, asistente IA voz+texto), Inbox (bandeja Gmail IA), Agenda (operaciones de campo), Web (integración vaciadodepisos.cat).

**Arquitectura IA híbrida:** Gemini Flash + Groq + router local (~80% de comandos sin tokens). Sin cadenas de acciones automáticas — cada operación validada individualmente.

---

## Setup

```bash
# Install dependencies
bun install

# Configure environment
cp apps/crm/.env.example apps/crm/.env
# Fill in Supabase URL, anon key, Cloudflare account details

# Run all apps in development
bun dev

# Build all
bun build

# Deploy CRM to Cloudflare
cd apps/crm && wrangler deploy
```

## Environment Variables

Each app has its own `.env.example`. Required secrets:
- `SUPABASE_URL` + `SUPABASE_ANON_KEY` — database connection
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — Gmail OAuth
- `GEMINI_API_KEY` — AI (free tier available)
- `GROQ_API_KEY` — AI backup (free tier available)

## License

MIT
