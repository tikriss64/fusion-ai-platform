// Server-only email + SMS senders. Degrade gracefully (log + skip) when the
// relevant key is still a placeholder so the rest of the flow keeps working.
import { EMAIL_FROM_DEFAULT, getResendApiKey } from "@/integrations/resend/config.server";
import { getTwilioConfig } from "@/integrations/twilio/config.server";

export interface EmailAttachment {
  filename: string;
  /** base64-encoded content */
  content: string;
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

export async function sendEmail(args: SendEmailArgs): Promise<{ sent: boolean; error?: string }> {
  const key = getResendApiKey();
  if (!key) {
    console.warn("[notify] RESEND_API_KEY no configurada — email no enviado a", args.to);
    return { sent: false, error: "RESEND_API_KEY pendiente" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM_DEFAULT,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        attachments: args.attachments,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[notify] Resend error", res.status, text);
      return { sent: false, error: `Resend ${res.status}: ${text.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[notify] Resend exception", msg);
    return { sent: false, error: msg };
  }
}

export function smsConfigured(): boolean {
  return getTwilioConfig() !== null;
}

export async function sendSms(to: string, body: string): Promise<{ sent: boolean; error?: string }> {
  const cfg = getTwilioConfig();
  if (!cfg) {
    return { sent: false, error: "Twilio pendiente" };
  }
  const { accountSid: sid, authToken: token, fromNumber: from } = cfg;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[notify] Twilio error", res.status, text);
      return { sent: false, error: `Twilio ${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { sent: false, error: msg };
  }
}
