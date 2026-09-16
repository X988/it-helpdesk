import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email().max(254).transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8).max(128),
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
