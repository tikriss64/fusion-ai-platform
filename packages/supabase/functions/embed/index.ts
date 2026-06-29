// Edge Function "embed" — genera embeddings con gte-small (384d).
// Corre DENTRO de Supabase: gratis, sin API externa, el dato no sale del servidor.
// Desplegar con:  supabase functions deploy embed
//
// @ts-nocheck  (entorno Deno de Supabase, no Node)

const model = new Supabase.ai.Session("gte-small");

Deno.serve(async (req: Request) => {
  try {
    const { input } = await req.json();
    if (typeof input !== "string" || input.length === 0) {
      return new Response(JSON.stringify({ error: "input requerido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    // mean_pool + normalize → vector de 384 dims listo para cosine distance.
    const embedding = await model.run(input, { mean_pool: true, normalize: true });
    return new Response(JSON.stringify({ embedding }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
