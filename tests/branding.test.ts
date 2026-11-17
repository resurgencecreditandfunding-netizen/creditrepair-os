import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";
let br: typeof import("@/lib/branding"), ops: typeof import("@/lib/console"), store: typeof import("@/lib/store");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
let smith: string;
beforeAll(async () => {
  br = await import("@/lib/branding"); ops = await import("@/lib/console"); store = await import("@/lib/store");
  smith = ops.registerCompany({ company: "Smith Tax", legalName: "Smith Tax LLC", address: "9 Oak", kind: "tax_pro", name: "Ann", email: "ann@smith.example", password: "long-password-1" }).tenantId;
});

describe("company branding", () => {
  it("only accepts colours dark enough for white button text", () => {
    expect(br.contrastWithWhite("#000000")).toBeCloseTo(21, 0);
    expect(() => br.setBranding(smith, { accent: "#ffee00" })).toThrow(/too light/);
    expect(() => br.setBranding(smith, { accent: "red; } body { display:none" })).toThrow(/Pick a colour/);
    br.setBranding(smith, { accent: "#1D4ED8" });
    expect(br.brandBar(store.getTenant(smith))).toMatchObject({ brand: "Smith Tax", accent: "#1d4ed8" });
  });
  it("accepts image logos only, and never changes the platform's own brand", () => {
    expect(() => br.setBranding(smith, { logo: Buffer.from("<svg onload=alert(1)>"), accent: "" })).toThrow(/PNG, JPG or WebP/);
    expect(() => br.setBranding(smith, { logo: Buffer.concat([PNG, Buffer.alloc(br.MAX_LOGO)]), accent: "" })).toThrow(/300 KB/);
    br.setBranding(smith, { logo: PNG, accent: "" });
    const bar = br.brandBar(store.getTenant(smith));
    expect(bar.logo).toMatch(/^\/brand\/smith-tax\?v=\d+$/);
    expect(bar.accent).toBeUndefined();
    expect(() => br.setBranding("tenant_default", { accent: "#000000" })).toThrow(/platform/);
    expect(br.brandBar(store.getTenant("tenant_default"))).toEqual({ brand: "Leverage IQ" });
  });
  it("reads the company from its subdomain", () => {
    process.env.BASE_DOMAIN = "leverageiq100.com";
    expect(br.slugFromHost("smith-tax.leverageiq100.com")).toBe("smith-tax");
    expect(br.slugFromHost("SMITH-TAX.leverageiq100.com:443")).toBe("smith-tax");
    expect(br.slugFromHost("www.leverageiq100.com")).toBeNull();
    expect(br.slugFromHost("leverageiq100.com")).toBeNull();
    expect(br.slugFromHost("a.b.leverageiq100.com")).toBeNull();
    expect(br.slugFromHost("smith-tax.evil.com")).toBeNull();
    expect(br.companyLink("smith-tax", "https://x")).toBe("https://smith-tax.leverageiq100.com");
    delete process.env.BASE_DOMAIN;
    expect(br.companyLink("smith-tax", "https://leverageiq100.com")).toBe("https://leverageiq100.com/?t=smith-tax");
  });
});
