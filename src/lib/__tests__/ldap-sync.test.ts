import { describe, expect, it } from "vitest";
import { parseOuFromDn } from "@/lib/ldap-dn";

describe("parseOuFromDn", () => {
  it("parses nested OU under DTE", () => {
    const dn = "CN=Oleg Nikishin,OU=DCAdmin,OU=DTE,DC=energo,DC=local";
    const p = parseOuFromDn(dn);
    expect(p.ouName).toBe("DCAdmin");
    expect(p.ouDn).toBe("OU=DCAdmin,OU=DTE,DC=energo,DC=local");
    expect(p.parentDn).toBe("OU=DTE,DC=energo,DC=local");
    expect(p.path).toBe("DCAdmin / DTE");
  });

  it("handles single OU", () => {
    const p = parseOuFromDn("CN=x,OU=BUH,DC=energo,DC=local");
    expect(p.ouName).toBe("BUH");
    expect(p.parentDn).toBe("DC=energo,DC=local");
  });
});
