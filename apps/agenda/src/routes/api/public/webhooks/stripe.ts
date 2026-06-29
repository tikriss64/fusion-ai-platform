import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { getStripeWebhookSecret } from "@/integrations/stripe/config.server";
import {
  handlePaymentSucceeded,
  handlePaymentFailed,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
} from "@/lib/automations/automations.server";

function verifyStripeSignature(payload: string, sigHeader: string | null, secret: string): boolean {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(
    sigHeader.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k, v];
    }),
  );
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(v1);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = getStripeWebhookSecret();
        const payload = await request.text();

        if (secret) {
          const ok = verifyStripeSignature(payload, request.headers.get("stripe-signature"), secret);
          if (!ok) return new Response("Invalid signature", { status: 401 });
        } else {
          console.warn("[stripe] STRIPE_WEBHOOK_SECRET missing — skipping verification");
        }

        let event: { type: string; data: { object: Record<string, unknown> } };
        try {
          event = JSON.parse(payload);
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        try {
          const obj = event.data.object as Record<string, unknown>;
          switch (event.type) {
            case "checkout.session.completed": {
              const apptId = (obj.metadata as Record<string, string> | undefined)?.appointment_id;
              const intentId = typeof obj.payment_intent === "string" ? obj.payment_intent : "";
              await handlePaymentSucceeded(intentId, apptId);
              break;
            }
            case "payment_intent.succeeded": {
              const apptId = (obj.metadata as Record<string, string> | undefined)?.appointment_id;
              await handlePaymentSucceeded(String(obj.id), apptId);
              break;
            }
            case "payment_intent.payment_failed": {
              const apptId = (obj.metadata as Record<string, string> | undefined)?.appointment_id;
              await handlePaymentFailed(String(obj.id), apptId);
              break;
            }
            case "customer.subscription.updated": {
              await handleSubscriptionUpdated({
                id: String(obj.id),
                status: String(obj.status),
                current_period_end: obj.current_period_end as number | undefined,
                metadata: obj.metadata as Record<string, string> | undefined,
              });
              break;
            }
            case "customer.subscription.deleted": {
              await handleSubscriptionDeleted({
                id: String(obj.id),
                metadata: obj.metadata as Record<string, string> | undefined,
              });
              break;
            }
            default:
              break;
          }
        } catch (e) {
          console.error("[stripe] handler error", e);
          return new Response("Handler error", { status: 500 });
        }

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
