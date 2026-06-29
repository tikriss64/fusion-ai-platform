import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getBusinessBySlug,
  getMonthAvailability,
  getDaySlots,
  createBooking,
  getBookingByToken,
  rescheduleBooking,
  cancelBooking,
} from "./public.server";

export const getPublicBusiness = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data }) => getBusinessBySlug(data.slug));

export const getAvailability = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z
      .object({
        slug: z.string().min(1).max(64),
        year: z.number().int().min(2020).max(2100),
        month: z.number().int().min(1).max(12),
      })
      .parse(d),
  )
  .handler(async ({ data }) => getMonthAvailability(data.slug, data.year, data.month));

export const getSlots = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z
      .object({
        slug: z.string().min(1).max(64),
        serviceId: z.string().uuid(),
        professionalId: z.string().uuid().nullable(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ data }) =>
    getDaySlots(data.slug, data.serviceId, data.professionalId, data.date),
  );

export const createPublicBooking = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        slug: z.string().min(1).max(64),
        serviceId: z.string().uuid(),
        professionalId: z.string().uuid().nullable(),
        startIso: z.string().min(10).max(40),
        client: z.object({
          nombre: z.string().trim().min(1).max(120),
          email: z.string().trim().email().max(255),
          telefono: z.string().trim().max(40).optional(),
        }),
        intake: z.record(z.string(), z.any()).default({}),
        rgpdConsent: z.literal(true),
        wantsPayment: z.boolean().default(false),
        origin: z.string().min(1).max(255),
      })
      .parse(d),
  )
  .handler(async ({ data }) => createBooking(data));

export const getBooking = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => getBookingByToken(data.token));

export const rescheduleBookingFn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ token: z.string().uuid(), startIso: z.string().min(10).max(40) }).parse(d),
  )
  .handler(async ({ data }) => rescheduleBooking(data.token, data.startIso));

export const cancelBookingFn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => cancelBooking(data.token));
