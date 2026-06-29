// Resend email integration entrypoint (server-only).
// 👉 Pega aquí tu clave de API de Resend cuando la tengas. Mientras contenga el
// texto "A PONER AQUI", no se enviarán emails (se registran y se omiten).
const RESEND_API_KEY_PLACEHOLDER = "CODIGO API DE RESEND A PONER AQUI";

export const EMAIL_FROM_DEFAULT = "Reservas <no-reply@example.com>";

/** Returns the Resend API key, or null while it is still a placeholder. */
export function getResendApiKey(): string | null {
  const v = process.env.RESEND_API_KEY ?? RESEND_API_KEY_PLACEHOLDER;
  if (!v || v.includes("A PONER AQUI")) return null;
  return v;
}
