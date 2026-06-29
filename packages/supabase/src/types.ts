// Tipos de la base de datos.
//
// Generar los tipos reales con la CLI tras aplicar las migraciones:
//   supabase gen types typescript --local > packages/supabase/src/types.gen.ts
// y luego re-exportar `Database` desde aquí. De momento es un tipo abierto para
// no bloquear el desarrollo.
export type Database = Record<string, unknown> & {
  public: { Tables: Record<string, never>; Functions: Record<string, never> };
};
