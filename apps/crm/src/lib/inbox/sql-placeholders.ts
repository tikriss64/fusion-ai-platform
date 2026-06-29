// Traducción de placeholders D1/SQLite (`?`) a Postgres (`$1,$2,...`).
// Aislado y sin dependencias para poder testearlo de forma unitaria.

/** Traduce `?` posicionales a `$1,$2,...` respetando literales entre comillas. */
export function toPg(query: string): string {
  let i = 0;
  let inSingle = false;
  let out = "";
  for (let c = 0; c < query.length; c++) {
    const ch = query[c];
    if (ch === "'") inSingle = !inSingle;
    if (ch === "?" && !inSingle) {
      i += 1;
      out += `$${i}`;
    } else {
      out += ch;
    }
  }
  return out;
}
