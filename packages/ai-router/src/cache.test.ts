import assert from "node:assert/strict";
import { test } from "node:test";
import { cacheKey } from "./cache.ts";

test("cacheKey es determinista (mismas entradas → mismo hash)", () => {
  const a = cacheKey("classify", "groq", "Hola mundo");
  const b = cacheKey("classify", "groq", "Hola mundo");
  assert.equal(a, b);
});

test("cacheKey normaliza espacios y mayúsculas", () => {
  const a = cacheKey("t", undefined, "Hola   MUNDO");
  const b = cacheKey("t", undefined, "hola mundo");
  assert.equal(a, b);
});

test("cacheKey distingue por tarea y por entrada", () => {
  assert.notEqual(cacheKey("classify", undefined, "x"), cacheKey("extract", undefined, "x"));
  assert.notEqual(cacheKey("t", undefined, "uno"), cacheKey("t", undefined, "dos"));
});

test("cacheKey produce un sha256 hex (64 chars)", () => {
  const k = cacheKey("t", undefined, "algo");
  assert.match(k, /^[0-9a-f]{64}$/);
});
