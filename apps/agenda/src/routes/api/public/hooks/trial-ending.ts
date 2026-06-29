import { createFileRoute } from "@tanstack/react-router";
import { runTrialEnding } from "@/lib/automations/automations.server";

export const Route = createFileRoute("/api/public/hooks/trial-ending")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await runTrialEnding();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          console.error("[cron] trial-ending error", e);
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
