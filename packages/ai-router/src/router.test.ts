import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQuoteData } from "./router.ts";

test("parseQuoteData extrae tipo, m2, precio y flags sin IA", () => {
  const d = parseQuoteData("vaciado 60m2 en Gràcia por 450 euros sin ascensor");
  assert.equal(d.tipo_servicio, "vaciado");
  assert.equal(d.metros_cuadrados, 60);
  assert.equal(d.precio, 450);
  assert.ok(d.flags.includes("sin_ascensor"));
});

test("parseQuoteData detecta retirada de muebles y urgencia", () => {
  const d = parseQuoteData("retirada de muebles urgente, hoy mismo");
  assert.equal(d.tipo_servicio, "retirada_muebles");
  assert.ok(d.flags.includes("urgente"));
});

test("parseQuoteData con precio decimal y coma", () => {
  const d = parseQuoteData("limpieza por 99,50 €");
  assert.equal(d.tipo_servicio, "limpieza");
  assert.equal(d.precio, 99.5);
});

test("parseQuoteData sin datos devuelve flags vacíos", () => {
  const d = parseQuoteData("buenos días");
  assert.deepEqual(d.flags, []);
  assert.equal(d.tipo_servicio, undefined);
});
