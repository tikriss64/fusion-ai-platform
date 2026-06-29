// Stripe integration entrypoint (server-only).
// 👉 Pega aquí tus claves de Stripe cuando las tengas. Mientras contengan el
// texto "A PONER AQUI", el sistema las considera "no configuradas" y los pagos
// se desactivan automáticamente sin romper la app.
const STRIPE_SECRET_KEY_PLACEHOLDER = "CODIGO API SECRETA DE STRIPE A PONER AQUI";
const STRIPE_WEBHOOK_SECRET_PLACEHOLDER = "CODIGO SECRETO DEL WEBHOOK DE STRIPE A PONER AQUI";

export const STRIPE_API_VERSION = "2024-06-20" as const;

function resolve(envValue: string | undefined, placeholder: string): string | null {
  const v = envValue ?? placeholder;
  if (!v || v.includes("A PONER AQUI")) return null;
  return v;
}

/** Returns the Stripe secret key, or null while it is still a placeholder. */
export function getStripeSecretKey(): string | null {
  return resolve(process.env.STRIPE_SECRET_KEY, STRIPE_SECRET_KEY_PLACEHOLDER);
}

/** Returns the Stripe webhook signing secret, or null while still a placeholder. */
export function getStripeWebhookSecret(): string | null {
  return resolve(process.env.STRIPE_WEBHOOK_SECRET, STRIPE_WEBHOOK_SECRET_PLACEHOLDER);
}

export function stripeEnabled(): boolean {
  return getStripeSecretKey() !== null;
}
