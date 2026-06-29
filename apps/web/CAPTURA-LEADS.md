# Conectar el formulario de vaciadodepisos.cat al CRM

Esto hace que cada formulario enviado en la web cree un **lead en el CRM**,
SIN dejar de enviarse el email de siempre (`enviar.php`). Doble envío: email + CRM.

## Paso 1 — Aplicar la migración 0013 en Supabase

Crea la función pública `submit_lead`. (Pegar `0013_public_lead_intake.sql` en el
SQL Editor → Run.)

## Paso 2 — Pegar este snippet en la web

Añádelo **antes de `</body>`** en las páginas que tengan el formulario de contacto
(ej. `index.html`, `contacto.html`…). Rellena las DOS constantes de arriba con tus
datos de Supabase (la **anon key es pública**, es segura en el navegador).

```html
<!-- ── Captura de leads → CRM vaciadodepisos.cat ────────────────────────── -->
<script>
(function () {
  // ⬇️ RELLENA ESTOS DOS VALORES (Project Settings > API en Supabase)
  var SUPABASE_URL      = "https://TU-PROYECTO.supabase.co";
  var SUPABASE_ANON_KEY = "eyJ...";   // anon / publishable key (pública)

  // ⬇️ AJUSTA el selector a tu formulario real (id o clase).
  var form = document.querySelector("#formulario-contacto") ||
             document.querySelector("form");
  if (!form) return;

  // Honeypot anti-bots: campo oculto. Un humano no lo ve ni lo rellena; muchos
  // bots sí. Si llega relleno, no creamos el lead (evita basura en el CRM).
  var hp = document.createElement("input");
  hp.type = "text"; hp.name = "_hp_website"; hp.tabIndex = -1;
  hp.autocomplete = "off"; hp.setAttribute("aria-hidden", "true");
  hp.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;";
  form.appendChild(hp);

  form.addEventListener("submit", function () {
    // Fire-and-forget: NO bloquea el envío normal a enviar.php (sigue el email).
    try {
      var fd = new FormData(form);
      var g = function (k) { return (fd.get(k) || "").toString().trim(); };
      // Si el honeypot viene relleno = bot → no creamos lead en el CRM.
      if (g("_hp_website")) return;
      fetch(SUPABASE_URL + "/rest/v1/rpc/submit_lead", {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": "Bearer " + SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          // mapea los name="" de tus inputs a la izquierda
          _nombre:   g("nombre") || g("name") || g("nom"),
          _telefono: g("telefono") || g("phone") || g("tel"),
          _email:    g("email") || g("correo"),
          _servicio: g("servicio") || g("service"),
          _ciudad:   g("ciudad") || g("poblacion") || g("city"),
          _mensaje:  g("mensaje") || g("message") || g("comentarios"),
          _origen_pagina: location.pathname
        })
      }).catch(function () {});
    } catch (e) {}
    // sin preventDefault → el formulario sigue a enviar.php como siempre
  });
})();
</script>
```

## Paso 3 — Ajustar los nombres de los campos

Mira los `name="..."` de los inputs de tu formulario y ajústalos en el snippet
(la parte `g("...")`). Por ejemplo, si tu input del teléfono es
`<input name="movil">`, cambia `g("telefono")` por `g("movil")`.

## Paso 4 — Subir la web

Sube la página modificada a tu hosting como haces normalmente. A partir de ahí,
cada envío del formulario aparece en **Leads** dentro del CRM (estado "nuevo").

## Probar sin tocar la web (opcional)

Puedes simular un lead desde el SQL Editor de Supabase:

```sql
select public.submit_lead('Cliente de prueba', '666112233', 'test@correo.com',
  'vaciado', 'Gràcia', 'Barcelona', 'Necesito vaciar un piso de 60m2', '/test');
```

Devuelve un UUID y el lead aparece en el CRM. Así verificas el circuito completo
antes de tocar la web real.
