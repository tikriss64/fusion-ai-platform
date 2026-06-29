# apps/inbox — Bandeja inteligente

Puerta de entrada: sincroniza correos, extrae datos de documentos (facturas,
contratos, PDFs), clasifica y detecta urgencias y riesgos.

**Origen:** se copiará desde `PROYECTO AI INBOX ASSISTANT` (solo lectura).

**Migración pendiente (paso 5):** mover de **Cloudflare D1 + Vectorize** a
**Supabase + pgvector**. La lógica TypeScript se reutiliza; solo cambia dónde
guarda (Postgres) y dónde corre (Edge Functions). Embeddings con gte-small.

> Carpeta vacía por ahora.
