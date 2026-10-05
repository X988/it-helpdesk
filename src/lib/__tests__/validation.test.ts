import { describe, expect, it } from "vitest";
import {
  loginSchema,
  messageCreateSchema,
  ticketCreateSchema,
  statusChangeSchema,
  organizationSchema,
} from "@/lib/validation";
import { parseDomainLogin, syntheticEmail } from "@/lib/domain-login";
import { formatPerson, formatOrganization, priorityLabel, statusLabel } from "@/lib/labels";

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
      categoryId: "11111111-1111-4111-8111-111111111111",
      direction: "OTHER",
    });
    expect(result.success).toBe(false);
  });

  it("requires direction on ticket create", () => {
    const result = ticketCreateSchema.safeParse({
      subject: "Install Windows",
      description: "need help with windows install",
      categoryId: "11111111-1111-4111-8111-111111111111",
      priority: "URGENT",
    });
    expect(result.success).toBe(false);
  });

  it("accepts ticket with direction", () => {
    const parsed = ticketCreateSchema.parse({
      subject: "Install Windows",
      description: "need help with windows install",
      categoryId: "11111111-1111-4111-8111-111111111111",
      direction: "ADMINISTRATION",
      priority: "URGENT",
    });
    expect(parsed.direction).toBe("ADMINISTRATION");
  });

  it("defaults message visibility to PUBLIC", () => {
    const parsed = messageCreateSchema.parse({ body: "hello" });
    expect(parsed.visibility).toBe("PUBLIC");
  });

  it("accepts status with workMinutes", () => {
    const parsed = statusChangeSchema.parse({ status: "RESOLVED", workMinutes: 45 });
    expect(parsed.workMinutes).toBe(45);
  });

  it("accepts organization create", () => {
    const parsed = organizationSchema.parse({ name: "КП", domain: "Energo" });
    expect(parsed.domain).toBe("energo");
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

describe("labels", () => {
  it("formats person as Name (login)", () => {
    expect(formatPerson("Олег", "o.nikishin")).toBe("Олег (o.nikishin)");
  });

  it("formats organization as Name (domain)", () => {
    expect(formatOrganization("КП", "energo")).toBe("КП (energo)");
  });

  it("uses Russian priority and status", () => {
    expect(priorityLabel.URGENT).toBe("Срочный");
    expect(statusLabel.IN_PROGRESS).toBe("В работе");
  });
});
