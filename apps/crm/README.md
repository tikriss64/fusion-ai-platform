# apps/crm — Núcleo operativo

El corazón del sistema. Gestiona clientes, presupuestos, facturas y leads.

**Origen:** se copiará desde `PROYECTO CRM FACTURACION PRESUPUESTOS` (solo lectura).

**Piezas clave a reutilizar:**
- Command Router (~1.101 líneas, regex, 0 tokens) → se moverá a `packages/ai-router`
- Tabla `leads` ya conectada al formulario de vaciadodepisos.cat
- Lógica de presupuestos y facturación (PDF)

> Carpeta vacía por ahora. El código se copia en el paso 4 de la hoja de ruta.
