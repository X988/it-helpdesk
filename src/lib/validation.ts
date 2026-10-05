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
});

export const messageCreateSchema = z.object({
  body: z.string().trim().min(1).max(10000),
  visibility: z.enum(["PUBLIC", "INTERNAL"]).default("PUBLIC"),
});
