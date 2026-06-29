import assert from "node:assert/strict";
import { test } from "node:test";
import { redact, restore } from "./pii.ts";

test("redact enmascara email, teléfono ES y nombre etiquetado", () => {
  const input = "Presupuesto para Juan Pérez, tel 666112233, email juan@correo.com";
  const r = redact(input);
  assert.equal(r.hasPii, true);
  assert.notEqual(r.masked, input);
  assert.match(r.masked, /\[NOMBRE_1\]/);
  assert.match(r.masked, /\[TEL_1\]/);
  assert.match(r.masked, /\[EMAIL_1\]/);
  // El dato real NO debe aparecer en el texto enmascarado.
  assert.ok(!r.masked.includes("666112233"));
  assert.ok(!r.masked.includes("juan@correo.com"));
});

test("restore reconstruye el texto original (round-trip)", () => {
  const input = "Contacta a Ana López en ana@x.es o al 612345678";
  const r = redact(input);
  assert.equal(restore(r.masked, r.map), input);
});

test("texto sin PII no se altera", () => {
  const input = "vaciado de piso de 60 metros cuadrados";
  const r = redact(input);
  assert.equal(r.hasPii, false);
  assert.equal(r.masked, input);
});

test("IBAN y DNI se detectan", () => {
  const r = redact("IBAN ES9121000418450200051332 y DNI 12345678Z");
  assert.match(r.masked, /\[IBAN_1\]/);
  assert.match(r.masked, /\[DNI_1\]/);
});
