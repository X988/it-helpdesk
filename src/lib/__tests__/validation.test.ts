import { describe, expect, it } from "vitest";
import { loginSchema, messageCreateSchema, ticketCreateSchema } from "@/lib/validation";
import { parseDomainLogin, syntheticEmail } from "@/lib/domain-login";

describe("validation schemas", () => {
  it("accepts domain login payload", () => {
    const parsed = loginSchema.parse({
      login: "energo\\admin",
      password: "password123",
    });
    expect(parsed.login).toBe("energo\\admin");
  });

  it("accepts username + domain", () => {
    const parsed = loginSchema.parse({
      username: "o.nikishin",
      domain: "energo",
      password: "password12345",
    });
    expect(parsed.username).toBe("o.nikishin");
    expect(parsed.domain).toBe("energo");
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

describe("parseDomainLogin", () => {
  it("parses DOMAIN\\\\user", () => {
    expect(parseDomainLogin({ login: "ENERGO\\O.Nikishin" })).toEqual({
      domain: "energo",
      username: "o.nikishin",
      login: "energo\\o.nikishin",
    });
  });

  it("parses DOMAIN/user and user@domain", () => {
    expect(parseDomainLogin({ login: "energo/admin" }).username).toBe("admin");
    expect(parseDomainLogin({ login: "tech@energo.local" })).toEqual({
      domain: "energo",
      username: "tech",
      login: "energo\\tech",
    });
  });

  it("defaults domain to energo", () => {
    expect(parseDomainLogin({ username: "user" }).domain).toBe("energo");
  });

  it("builds synthetic email", () => {
    expect(syntheticEmail("admin", "energo")).toBe("admin@energo.local");
  });
});
