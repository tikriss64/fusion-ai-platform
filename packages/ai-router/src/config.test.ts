import assert from "node:assert/strict";
import { test } from "node:test";
import { computeCost, findModel, MODELS, pickModel } from "./config.ts";

test("pickModel nivel 1 con Groq disponible elige Llama 8B", () => {
  const m = pickModel(1, "anonymous", new Set(["groq"]));
  assert.equal(m?.id, "llama-3.1-8b-instant");
  assert.equal(m?.provider, "groq");
});

test("pickModel nivel 1 solo OpenRouter elige el auto-router gratis", () => {
  const m = pickModel(1, "anonymous", new Set(["openrouter"]));
  assert.equal(m?.id, "openrouter/free");
});

test("pickModel sin proveedores disponibles devuelve null", () => {
  const m = pickModel(1, "anonymous", new Set());
  assert.equal(m, null);
});

test("pickModel con PII prefiere modelos que NO entrenan con datos", () => {
  // En nivel 2, con todos disponibles, para PII no debe salir un modelo
  // que entrene (trainsOnData=true). Verificamos la propiedad del elegido.
  const m = pickModel(2, "pii", new Set(["groq", "gemini", "claude", "openrouter"]));
  assert.ok(m, "debe elegir alguno");
  assert.equal(m?.trainsOnData, false);
});

test("computeCost calcula coste por millón correctamente", () => {
  const spec = findModel("llama-3.1-8b-instant");
  assert.ok(spec);
  // 1M in + 1M out = costInPerM + costOutPerM
  const cost = computeCost(spec!, 1_000_000, 1_000_000);
  assert.equal(cost, spec!.costInPerM + spec!.costOutPerM);
});

test("computeCost de un modelo gratis es 0", () => {
  const free = findModel("openrouter/free");
  assert.ok(free);
  assert.equal(computeCost(free!, 5_000_000, 5_000_000), 0);
});

test("el registro incluye al menos un modelo por nivel", () => {
  assert.ok(MODELS.some((m) => m.tier === 1));
  assert.ok(MODELS.some((m) => m.tier === 2));
});

test("todos los modelos de Groq están marcados como no-entrenan (PII-safe)", () => {
  for (const m of MODELS.filter((x) => x.provider === "groq")) {
    assert.equal(m.trainsOnData, false);
  }
});
