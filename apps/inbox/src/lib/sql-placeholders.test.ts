import assert from "node:assert/strict";
import { test } from "node:test";
import { toPg } from "./sql-placeholders.ts";

test("traduce ? posicionales a $1,$2,...", () => {
  assert.equal(
    toPg("SELECT * FROM email WHERE id = ? AND folder = ?"),
    "SELECT * FROM email WHERE id = $1 AND folder = $2",
  );
});

test("respeta ? dentro de literales entre comillas", () => {
  assert.equal(
    toPg("UPDATE t SET msg = '¿qué?' WHERE id = ?"),
    "UPDATE t SET msg = '¿qué?' WHERE id = $1",
  );
});

test("sin placeholders devuelve la consulta igual", () => {
  assert.equal(toPg("SELECT 1"), "SELECT 1");
});

test("cuenta correctamente con casts ::halfvec", () => {
  assert.equal(
    toPg("SELECT 1 - (embedding <=> ?::halfvec) ORDER BY embedding <=> ?::halfvec LIMIT ?"),
    "SELECT 1 - (embedding <=> $1::halfvec) ORDER BY embedding <=> $2::halfvec LIMIT $3",
  );
});
