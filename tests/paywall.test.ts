import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_PATH = ":memory:";
let pw: typeof import("@/lib/paywall"), store: typeof import("@/lib/store"), billing: typeof import("@/lib/billing");
let docs: typeof import("@/lib/documents"), journey: typeof import("@/lib/journey"), ops: typeof import("@/lib/console");
let db: typeof import("@/lib/db").db, sample: typeof import("@/lib/sample");
const meta = { ip: "203.0.113.1", userAgent: "test" };
const person = (tenant: string, name: string) => ({ tenant, name, email: `${name.split(" ")[0].toLowerCase()}@example.com`, phone: "", address: "1 Main", city: "Daytona Beach", state: "FL", zip: "32114", dob: "1988-04-12", ssnLast4: "1234", businessStage: "operating", fundingGoal: "" });

/** Signs, gets past the waiting period, reviews, freezes and drafts round 1. */
function readyWithDrafts(tenant: string, name: string) {
  const id = store.createClient(person(tenant, name));
  store.ackDisclosure(id, meta); store.signContract(id, name, meta);
  db().prepare("UPDATE clients SET signed_at='2026-01-05T12:00:00Z', report_reviewed_at='2026-01-06', freeze_done_at='2026-01-06' WHERE id=?").run(id);
  store.saveReport(id, sample.sampleReport());
  store.buildRound(id);
  return id;
}

beforeAll(async () => {
  pw = await import("@/lib/paywall"); store = await import("@/lib/store"); billing = await import("@/lib/billing");
  docs = await import("@/lib/documents"); journey = await import("@/lib/journey"); ops = await import("@/lib/console");
  db = (await import("@/lib/db")).db; sample = await import("@/lib/sample");
  ops.registerCompany({ company: "Smith Tax", legalName: "Smith Tax LLC", address: "9 Oak", kind: "tax_pro", name: "Ann", email: "ann@smith.example", password: "long-password-1" });
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.STRIPE_SECRET_KEY; });

describe("price", () => {
  it("is $37 for direct clients and $0 for an operator's clients", () => {
    expect(store.priceAtSigning("tenant_default")).toBe(3700);
    expect(store.priceAtSigning(store.getTenant("smith-tax").id)).toBe(0);
    expect(pw.priceLabel(3700)).toBe("$37");
    expect(pw.priceLabel(4950)).toBe("$49.50");
  });
  it("is written into the direct client's agreement, stating it is charged only once letters are complete", () => {
    const all = docs.contractDocs({ name: "Leverage IQ", address: "220 Sheila Ave", legalName: "Resurgence Consulting Services Incorporated" }, "x", 3700);
    const agreement = all.find((d) => d.key === "service_agreement")!.body;
    expect(agreement).toContain("The total cost of these services is $37.00, paid once, only after your dispute letters for your first round are complete");
    expect(agreement).toContain("nothing is charged before your letters are complete");
    expect(agreement).not.toContain("$0.00");
    expect(all.find((d) => d.key === "funding_disclosure")!.body).toMatch(/^Your dispute letters cost \$37\.00/);
    const free = docs.contractDocs({ name: "Smith Tax", address: "9 Oak" }, "x", 0).find((d) => d.key === "service_agreement")!.body;
    expect(free).toContain("The total cost of these services is $0.00");
  });
  it("is locked in at signing, so a later change does not affect people who already signed", () => {
    const id = store.createClient(person("default", "Early Bird"));
    store.ackDisclosure(id, meta); store.signContract(id, "Early Bird", meta);
    expect(store.getClient(id)!.price_cents).toBe(3700);
    const owner = { id: "o", tenant_id: "tenant_default", email: "o@x", name: "O", role: "platform" as const };
    pw.setDirectPrice(owner, 49);
    expect(store.getClient(id)!.price_cents).toBe(3700);
    expect(store.priceAtSigning("tenant_default")).toBe(4900);
    pw.setDirectPrice(owner, 37);
    expect(() => pw.setDirectPrice({ ...owner, role: "admin" }, 1)).toThrow(/platform owner/);
  });
});

describe("the gate", () => {
  it("lets direct clients draft and preview for free, but not approve until paid", () => {
    const id = readyWithDrafts("default", "Pat Payer");
    const c = store.getClient(id)!;
    expect(store.needsPayment(c)).toBe(true);
    const letter = (store.getLetters(id) as any[])[0];
    expect(() => store.attestLetter(id, letter.id)).toThrow(/Unlock your letters/);
    expect(journey.journey(c).current?.key).toBe("unlock_letters");
  });
  it("never applies to an operator's clients", () => {
    const id = readyWithDrafts("smith-tax", "Free Client");
    expect(store.needsPayment(store.getClient(id)!)).toBe(false);
    expect(journey.journey(store.getClient(id)!).steps.some((s) => s.key === "unlock_letters")).toBe(false);
    const letter = (store.getLetters(id) as any[])[0];
    expect(() => store.attestLetter(id, letter.id)).not.toThrow();
  });
  it("hides each item's facts and citations in the preview, on the server", () => {
    const id = (db().prepare("SELECT id FROM clients WHERE name = 'Pat Payer'").get() as any).id;
    const letter = (store.getLetters(id) as any[]).find((l) => l.recipient_bureau === "EX");
    const segs = pw.previewSegments(letter.body);
    const shown = segs.filter((x) => !x.hidden).map((x) => x.text).join("");
    const hidden = segs.filter((x) => x.hidden).map((x) => x.text).join("");
    expect(shown).toContain("To whom it may concern:");
    expect(shown).toContain("What I am asking for:");
    expect(shown).toContain("ITEM 1:");
    expect(shown).not.toContain("§ 607(b)");
    expect(shown).not.toMatch(/\$2,315|reports a balance of/);
    for (const fact of letter.cases.flatMap((c: any) => JSON.parse(c.findings).map((f: any) => f.fact))) expect(shown + hidden).not.toContain(fact);
    expect(hidden.length).toBeGreaterThan(100);
  });
});

describe("paying", () => {
  const paidSession = (clientId: string, status = "paid") => ({ id: "cs_test_1", mode: "payment", payment_status: status, payment_intent: "pi_1", amount_total: 3700, metadata: { kind: "letters", client_id: clientId } });
  it("starts a $37 Stripe checkout that accepts promotion codes", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    const id = (db().prepare("SELECT id FROM clients WHERE name = 'Pat Payer'").get() as any).id;
    let sent: URLSearchParams | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => { sent = new URLSearchParams(String(init.body)); return new Response(JSON.stringify({ url: "https://checkout.stripe.com/c/x" })); }));
    expect(await pw.startCheckout(store.getClient(id)!, "https://leverageiq100.com")).toBe("https://checkout.stripe.com/c/x");
    expect(Object.fromEntries(sent!)).toMatchObject({
      mode: "payment", "line_items[0][price_data][unit_amount]": "3700", allow_promotion_codes: "true",
      "metadata[kind]": "letters", "metadata[client_id]": id, success_url: "https://leverageiq100.com/disputes/unlocked?session_id={CHECKOUT_SESSION_ID}",
    });
  });
  it("unlocks on return from checkout only for a paid session belonging to this client", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    const id = (db().prepare("SELECT id FROM clients WHERE name = 'Pat Payer'").get() as any).id;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(paidSession("someone-else")))));
    expect(await pw.confirmSession(id, "cs_test_1")).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(paidSession(id, "unpaid")))));
    expect(await pw.confirmSession(id, "cs_test_1")).toBe(false);
    expect(await pw.confirmSession(id, "../../v1/balance")).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(paidSession(id)))));
    expect(await pw.confirmSession(id, "cs_test_1")).toBe(true);
    const c = store.getClient(id)!;
    expect(c).toMatchObject({ paid_cents: 3700, payment_ref: "pi_1" });
    expect(store.needsPayment(c)).toBe(false);
    const letter = (store.getLetters(id) as any[])[0];
    expect(() => store.attestLetter(id, letter.id)).not.toThrow();
  });
  it("also unlocks from the webhook, once, including a 100%-off community code", () => {
    const id = readyWithDrafts("default", "Community Member");
    expect(billing.applyEvent({ type: "checkout.session.completed", data: { object: { ...paidSession(id, "no_payment_required"), amount_total: 0 } } })).toBe("letters_paid");
    expect(billing.applyEvent({ type: "checkout.session.completed", data: { object: paidSession(id) } })).toBe("letters already paid");
    expect(store.getClient(id)).toMatchObject({ paid_cents: 0 });
    expect(store.needsPayment(store.getClient(id)!)).toBe(false);
  });
});
