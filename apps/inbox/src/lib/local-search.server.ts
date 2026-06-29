// Búsqueda "local-first": resuelve consultas mecánicas directamente sobre los datos de D1
// SIN llamar a la IA (ahorro de tokens). Devuelve null cuando la pregunta es semántica
// (phishing, "lo importante", resúmenes...) para que la resuelva la IA como apoyo.

export interface LocalSearchResult {
  answer: string;
  matchIds: number[]; // índices 1-based sobre la lista de correos recibida
}

export interface SearchEmail {
  sender: string;
  subject: string;
  summary: string | null;
  snippet: string;
  type: string | null;
  promise: string | null;
  tone_warning: string | null;
}

const STOPWORDS = new Set([
  "busca", "buscar", "cherche", "chercher", "trouve", "trouver", "mail", "mails", "correo",
  "correos", "email", "emails", "courriel", "courriels", "les", "des", "los", "las", "que",
  "qui", "sont", "son", "est", "una", "uno", "del", "mes", "mis", "mon", "ma", "mostrar",
  "muestra", "montre", "montrer", "todos", "todas", "tous", "toutes", "con", "avec", "para",
  "pour", "dans", "dame", "tengo", "tienes", "hay", "the", "and", "are",
]);

function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function isFrench(q: string): boolean {
  return (
    /[àâçéèêëîïôûù]/.test(q) ||
    /\b(cherche|trouve|quel|quels|quelles|mécontent|mecontent|réclamation|courriel|fournisseur|facture|colère|arnaque|non lus)\b/i.test(q)
  );
}

export function localSearch(question: string, emails: SearchEmail[], lang: string = "es"): LocalSearchResult | null {
  const q = norm(question);
  if (!q.trim()) return null;
  const fr = lang === "fr";

  // Preguntas semánticas (juicio que necesita IA) → delegar a la IA.
  const semantic = [
    "phishing", "arnaque", "escroquerie", "estafa", "sospechos", "suspect", "scam",
    "resume", "resum", "important", "prioritaire", "prioridad", "deberia", "debria",
    "devrais", "peligros", "dangereux", "fraude", "fraud",
  ];
  if (semantic.some((s) => q.includes(s))) return null;

  const has = (...kw: string[]) => kw.some((k) => q.includes(norm(k)));
  const indicesOf = (arr: SearchEmail[]) => arr.map((e) => emails.indexOf(e) + 1);
  const count = (n: number, es: string, frLabel: string) =>
    fr ? `J'ai trouvé ${n} e-mail(s) : ${frLabel}.` : `He encontrado ${n} correo(s): ${es}.`;

  let filtered: SearchEmail[] | null = null;
  let answer = "";

  if (has("urgent", "urgente")) {
    filtered = emails.filter((e) => e.type === "Urgente");
    answer = count(filtered.length, "urgentes", "urgents");
  } else if (has("reclamac", "reclamation", "queja", "plainte")) {
    filtered = emails.filter((e) => e.type === "Reclamación");
    answer = count(filtered.length, "reclamaciones", "réclamations");
  } else if (has("enfad", "mecontent", "colere", "molesto", "insatisf", "enerv")) {
    filtered = emails.filter((e) => !!e.tone_warning);
    answer = count(filtered.length, "con tono negativo", "au ton négatif");
  } else if (has("promesa", "promet", "promis", "prometido", "compromis")) {
    filtered = emails.filter((e) => !!e.promise);
    answer = count(filtered.length, "con promesas pendientes", "avec des promesses");
  } else if (has("comercial", "publicidad", "newsletter", "promo", "commercial", "pub ")) {
    filtered = emails.filter((e) => e.type === "Comercial");
    answer = count(filtered.length, "comerciales", "commerciaux");
  } else if (has("factura", "facture", "proveedor", "fournisseur")) {
    filtered = emails.filter((e) => e.type === "Proveedor" || /factur/.test(norm(`${e.subject} ${e.summary ?? ""}`)));
    answer = count(filtered.length, "de proveedores o facturas", "de fournisseurs ou factures");
  } else if (has("cliente", "client")) {
    filtered = emails.filter((e) => e.type === "Cliente");
    answer = count(filtered.length, "de clientes", "de clients");
  }

  if (filtered) return { answer, matchIds: indicesOf(filtered) };

  // Búsqueda por palabras clave (ej. "de Juan", "linkedin", "amazon").
  const words = q.split(/[^a-z0-9@.]+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
  if (words.length > 0) {
    const matched: number[] = [];
    emails.forEach((e, i) => {
      const hay = norm(`${e.sender} ${e.subject} ${e.summary ?? ""}`);
      if (words.some((w) => hay.includes(w))) matched.push(i + 1);
    });
    if (matched.length > 0) {
      answer = fr
        ? `J'ai trouvé ${matched.length} e-mail(s) correspondant(s).`
        : `He encontrado ${matched.length} correo(s) que coinciden.`;
      return { answer, matchIds: matched };
    }
  }

  return null; // No es mecánico → lo resuelve la IA
}
