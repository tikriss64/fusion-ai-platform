import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fetchWithRetry } from "./retry.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetchSequence(statuses: number[]): () => number {
  let calls = 0;
  globalThis.fetch = (async () => {
    const status = statuses[Math.min(calls, statuses.length - 1)];
    calls += 1;
    return new Response("{}", { status });
  }) as typeof fetch;
  return () => calls;
}

const fast = { retries: 3, baseDelayMs: 1, maxDelayMs: 2 };

test("devuelve a la primera si la respuesta es 200 (sin reintentos)", async () => {
  const calls = mockFetchSequence([200]);
  const res = await fetchWithRetry("http://x", {}, fast);
  assert.equal(res.status, 200);
  assert.equal(calls(), 1);
});

test("reintenta ante 429 y devuelve cuando llega 200", async () => {
  const calls = mockFetchSequence([429, 429, 200]);
  const res = await fetchWithRetry("http://x", {}, fast);
  assert.equal(res.status, 200);
  assert.equal(calls(), 3);
});

test("agota reintentos y devuelve el último 429", async () => {
  const calls = mockFetchSequence([429]);
  const res = await fetchWithRetry("http://x", {}, fast);
  assert.equal(res.status, 429);
  assert.equal(calls(), 4); // 1 inicial + 3 reintentos
});

test("no reintenta ante errores no transitorios (400)", async () => {
  const calls = mockFetchSequence([400]);
  const res = await fetchWithRetry("http://x", {}, fast);
  assert.equal(res.status, 400);
  assert.equal(calls(), 1);
});

test("reintenta también ante 503 (servidor saturado)", async () => {
  const calls = mockFetchSequence([503, 200]);
  const res = await fetchWithRetry("http://x", {}, fast);
  assert.equal(res.status, 200);
  assert.equal(calls(), 2);
});
