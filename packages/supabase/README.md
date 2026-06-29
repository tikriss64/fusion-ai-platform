# @fusion/supabase — Fuente única de datos

Cliente, tipos generados y migraciones de la base de datos compartida por
todas las apps. **Una sola base de datos = datos coherentes.**

## Contenido (cuando se implemente)

- Cliente Supabase tipado (browser + server)
- Tipos TypeScript generados del esquema
- Migraciones unificadas (se fusionan las del CRM y las del Tablón)
- **`tenant_id` + RLS por tenant desde el día 1** (preparado para multiempresa
  sin refactor futuro; hoy las políticas del CRM son `USING (true)`)
- `pgvector` con índice **HNSW** para búsqueda semántica
- Embeddings con **gte-small** en Edge Functions (gratis, el dato no sale)

> Vacío por ahora. Se implementa en el paso 3 de la hoja de ruta.
