import { describe, expect, it } from "vitest";
import { loginSchema, messageCreateSchema, ticketCreateSchema } from "@/lib/validation";

describe("validation schemas", () => {
  it("normalizes login email", () => {
    const parsed = loginSchema.parse({ email: " Admin@Example.Local ", password: "password123" });
    expect(parsed.email).toBe("admin@example.local");
  });

  it("rejects short ticket subjects", () => {
    const result = ticketCreateSchema.safeParse({
      subject: "ab",
      description: "need help with vpn",
      categoryId: "11111111-1111-1111-1111-111111111111",
    });
    expect(result.success).toBe(false);
  });

  it("defaults message visibility to PUBLIC", () => {
    const parsed = messageCreateSchema.parse({ body: "hello" });
    expect(parsed.visibility).toBe("PUBLIC");
  });
});
