import { createFileRoute } from "@tanstack/react-router";
import { runReminders } from "@/lib/automations/automations.server";

export const Route = createFileRoute("/api/public/hooks/reminders")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await runReminders();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          console.error("[cron] reminders error", e);
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
