import { createFileRoute } from "@tanstack/react-router";
import { runPaymentTimeouts } from "@/lib/automations/automations.server";

export const Route = createFileRoute("/api/public/hooks/payment-timeouts")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await runPaymentTimeouts();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          console.error("[cron] payment-timeouts error", e);
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
