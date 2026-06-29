// Twilio SMS integration entrypoint (server-only, optional add-on).
// 👉 Pega aquí tus credenciales de Twilio cuando las tengas. Mientras contengan
// el texto "A PONER AQUI", el SMS se considera no configurado (solo se envía email).
const TWILIO_ACCOUNT_SID_PLACEHOLDER = "CODIGO ACCOUNT SID DE TWILIO A PONER AQUI";
const TWILIO_AUTH_TOKEN_PLACEHOLDER = "CODIGO AUTH TOKEN DE TWILIO A PONER AQUI";
const TWILIO_FROM_NUMBER_PLACEHOLDER = "NUMERO DE TWILIO A PONER AQUI";

function resolve(envValue: string | undefined, placeholder: string): string | null {
  const v = envValue ?? placeholder;
  if (!v || v.includes("A PONER AQUI")) return null;
  return v;
}

export function getTwilioConfig(): { accountSid: string; authToken: string; fromNumber: string } | null {
  const accountSid = resolve(process.env.TWILIO_ACCOUNT_SID, TWILIO_ACCOUNT_SID_PLACEHOLDER);
  const authToken = resolve(process.env.TWILIO_AUTH_TOKEN, TWILIO_AUTH_TOKEN_PLACEHOLDER);
  const fromNumber = resolve(process.env.TWILIO_FROM_NUMBER, TWILIO_FROM_NUMBER_PLACEHOLDER);
  if (!accountSid || !authToken || !fromNumber) return null;
  return { accountSid, authToken, fromNumber };
}
