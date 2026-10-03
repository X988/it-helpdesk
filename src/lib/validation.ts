import { z } from "zod";
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
// bcrypt only considers the first 72 UTF-8 bytes.
export const passwordSchema = z.string().min(12).max(72).refine(v => Buffer.byteLength(v, "utf8") <= 72);
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export const ticketCreateSchema = z.object({
  subject: z.string().trim().min(3).max(160), description: z.string().trim().min(5).max(10000),
  categoryId: z.uuid(), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
});
export const messageCreateSchema = z.object({ body: z.string().trim().min(1).max(10000), visibility: z.enum(["PUBLIC", "INTERNAL"]).default("PUBLIC") });
export const statusSchema = z.object({ status: z.enum(["IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED", "CANCELLED"]) });
export const assignSchema = z.object({ assigneeId: z.uuid() });
export const userCreateSchema = z.object({ email: emailSchema, name: z.string().trim().min(1).max(120), password: passwordSchema, role: z.enum(["USER", "TECHNICIAN", "ADMIN"]).default("USER"), organization: z.string().trim().max(120).default(""), department: z.string().trim().max(120).default("") });
export const userUpdateSchema = z.object({ role: z.enum(["USER", "TECHNICIAN", "ADMIN"]), isActive: z.boolean(), password: passwordSchema.optional() });
export const categorySchema = z.object({ name: z.string().trim().min(1).max(100) });
export const categoryUpdateSchema = z.object({ isActive: z.boolean() });
