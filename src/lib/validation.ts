import { z } from "zod";
import { DEFAULT_DOMAIN } from "@/lib/domain-login";

const usernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9._-]+$/, "Invalid username");

const domainSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9._-]+$/, "Invalid domain")
  .default(DEFAULT_DOMAIN);

/** Domain login: either login="energo\\user" or username+domain, plus password. */
export const loginSchema = z
  .object({
    login: z.string().trim().min(1).max(128).optional(),
    username: usernameSchema.optional(),
    domain: domainSchema.optional(),
    password: z.string().min(8).max(128),
    /** Legacy — still accepted and mapped to username. */
    email: z.string().trim().max(254).optional(),
  })
  .refine((v) => Boolean(v.login || v.username || v.email), {
    message: "login or username required",
  });

export const ticketCreateSchema = z.object({
  subject: z.string().trim().min(3).max(160),
  description: z.string().trim().min(5).max(10000),
  categoryId: z.string().uuid(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  direction: z.enum(["PROGRAMMING", "ADMINISTRATION", "OTHER"]),
  organizationId: z.string().uuid().optional().nullable(),
});

export const messageCreateSchema = z.object({
  body: z.string().trim().min(1).max(10000),
  visibility: z.enum(["PUBLIC", "INTERNAL"]).default("PUBLIC"),
});

export const statusChangeSchema = z.object({
  status: z.enum(["IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED", "CANCELLED"]),
  workMinutes: z.number().int().min(1).max(100000).optional(),
  workHours: z.number().min(0).max(1000).optional(),
});

export const assignSchema = z.object({
  assigneeId: z.string().uuid(),
});

export const organizationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  domain: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, "Invalid domain")
    .transform((v) => v.toLowerCase()),
  isActive: z.boolean().optional().default(true),
});
