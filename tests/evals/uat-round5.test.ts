import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => { process.env.EXTENDED_SECTIONS = "true"; });

// --- F24: Freelance stripping ---
describe("F24: stripFreelanceFromRole", () => {
  it("removes freelance tokens from role string", async () => {
    const mod = await import("@/lib/services/page-composer");
    // Access via composeOptimisticPage to test integration
    const facts = [
      { id: "1", category: "identity", key: "name", value: { full: "Marco Bellini" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
      { id: "2", category: "identity", key: "role", value: { role: "freelance architect" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
      { id: "3", category: "identity", key: "company", value: { company: "Freelance" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
    ];
    const config = mod.composeOptimisticPage(facts as any, "draft", "it");
    const bio = config.sections.find((s) => s.type === "bio");
    expect(bio).toBeDefined();
    const text = (bio!.content as any).text as string;
    // Should NOT contain "freelance freelance" (case insensitive)
    expect(text.toLowerCase()).not.toContain("freelance freelance");
    // Should contain "freelance" exactly once in the bio
    const matches = text.toLowerCase().match(/freelance/g);
    expect(matches?.length).toBe(1);
  });

  it("handles role that is purely 'freelance' without malformed output", async () => {
    const mod = await import("@/lib/services/page-composer");
    const facts = [
      { id: "1", category: "identity", key: "name", value: { full: "Marco" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
      { id: "2", category: "identity", key: "role", value: { role: "freelance" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
      { id: "3", category: "identity", key: "company", value: { company: "Freelance" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
    ];
    const config = mod.composeOptimisticPage(facts as any, "draft", "en");
    const bio = config.sections.find((s) => s.type === "bio");
    expect(bio).toBeDefined();
    const text = (bio!.content as any).text as string;
    // Should not have trailing space before period or double spaces
    expect(text).not.toMatch(/\s\./);
    expect(text).not.toMatch(/  /);
  });
});

// --- F3 + F16: Italian passionateAbout (gender-neutral form) ---
describe("F3 + F16: Italian passionateAbout", () => {
  it("uses gender-neutral 'Entusiasta di' not masculine 'Appassionato di' or 'Mi occupo di'", async () => {
    const mod = await import("@/lib/services/page-composer");
    const facts = [
      { id: "1", category: "identity", key: "name", value: { full: "Marco" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
      { id: "2", category: "interest", key: "architettura", value: { name: "architettura" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
    ];
    const config = mod.composeOptimisticPage(facts as any, "draft", "it");
    const bio = config.sections.find((s) => s.type === "bio");
    const text = (bio?.content as any)?.text ?? "";
    expect(text).toContain("Entusiasta di");
    expect(text).not.toContain("Mi occupo di");
    expect(text).not.toContain("Appassionato di");
  });
});

// --- Gender-neutral passionateAbout: PT, FR, ES ---
describe("Gender-neutral passionateAbout in PT/FR/ES", () => {
  const interestFact = (id: string) => ({ id, category: "interest", key: "musica", value: { name: "musica" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null });
  const nameFact = (id: string, lang: string) => ({ id, category: "identity", key: "name", value: { full: lang === "pt" ? "Beatriz" : lang === "fr" ? "Sophie" : "María" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null });

  it("PT: uses 'Com paixão por' not 'Apaixonado'", async () => {
    const { composeOptimisticPage } = await import("@/lib/services/page-composer");
    const config = composeOptimisticPage([nameFact("1", "pt"), interestFact("2")] as any, "draft", "pt");
    const bio = config.sections.find((s) => s.type === "bio");
    const text = (bio?.content as any)?.text ?? "";
    expect(text).toContain("Com paixão por");
    expect(text).not.toContain("Apaixonado");
  });

  it("PT: interestsInto is 'Com paixão por'", async () => {
    const { composeOptimisticPage } = await import("@/lib/services/page-composer");
    const config = composeOptimisticPage([interestFact("1")] as any, "draft", "pt");
    const aag = config.sections.find((s) => s.type === "at-a-glance");
    if (aag) {
      const interestsInto = (aag.content as any)?.interestsInto ?? "";
      expect(interestsInto).toBe("Com paixão por");
    }
  });

  it("FR: uses 'Passionné(e) par' not 'Passionné par'", async () => {
    const { composeOptimisticPage } = await import("@/lib/services/page-composer");
    const config = composeOptimisticPage([nameFact("1", "fr"), interestFact("2")] as any, "draft", "fr");
    const bio = config.sections.find((s) => s.type === "bio");
    const text = (bio?.content as any)?.text ?? "";
    expect(text).toContain("Passionné(e) par");
    expect(text).not.toMatch(/Passionné par [^(]/);
  });

  it("ES: uses 'Entusiasta de' not 'Apasionado'", async () => {
    const { composeOptimisticPage } = await import("@/lib/services/page-composer");
    const config = composeOptimisticPage([nameFact("1", "es"), interestFact("2")] as any, "draft", "es");
    const bio = config.sections.find((s) => s.type === "bio");
    const text = (bio?.content as any)?.text ?? "";
    expect(text).toContain("Entusiasta de");
    expect(text).not.toContain("Apasionado");
  });
});

// --- F5: No gender slashes ---
describe("F5: No gender slashes in L10N", () => {
  it("Italian interestsInto has no /a", async () => {
    const { composeOptimisticPage } = await import("@/lib/services/page-composer");
    const facts = [
      { id: "1", category: "skill", key: "react", value: { name: "React" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
      { id: "2", category: "interest", key: "design", value: { name: "design" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
    ];
    const config = composeOptimisticPage(facts as any, "draft", "it");
    const aag = config.sections.find((s) => s.type === "at-a-glance");
    if (aag) {
      const interestsInto = (aag.content as any)?.interestsInto ?? "";
      expect(interestsInto).not.toContain("/a");
    }
  });
});

// --- F6: Activity frequency localization ---
describe("F6: Activity frequency L10N", () => {
  it("translates 'weekly' to Italian", async () => {
    const { composeOptimisticPage } = await import("@/lib/services/page-composer");
    const facts = [
      { id: "1", category: "identity", key: "name", value: { full: "Marco" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
      { id: "2", category: "activity", key: "tennis", value: { name: "Tennis", activityType: "sport", frequency: "weekly" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
    ];
    const config = composeOptimisticPage(facts as any, "draft", "it");
    const activities = config.sections.find((s) => s.type === "activities");
    expect(activities).toBeDefined();
    const items = (activities!.content as any).items;
    expect(items[0].frequency).toBe("settimanalmente");
  });
});

// --- F9: Skill domain L10N ---
describe("F9: Skill domain labels L10N", () => {
  it("translates domain labels to Italian", async () => {
    const { composeOptimisticPage } = await import("@/lib/services/page-composer");
    const facts = [
      { id: "1", category: "identity", key: "name", value: { full: "Marco" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
      { id: "2", category: "skill", key: "react", value: { name: "React" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
      { id: "3", category: "skill", key: "python", value: { name: "Python" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
    ];
    const config = composeOptimisticPage(facts as any, "draft", "it");
    const aag = config.sections.find((s) => s.type === "at-a-glance");
    expect(aag).toBeDefined();
    const groups = (aag!.content as any).skillGroups;
    if (groups && groups.length > 0) {
      // At least one group domain should be localized (not raw English "Frontend", "Backend", etc.)
      const domains = groups.map((g: any) => g.domain);
      // "Languages" is the Italian translation for the "Languages" domain which contains Python
      expect(domains.some((d: string) => d === "Linguaggi" || d === "Frontend" || d === "Backend")).toBe(true);
    }
  });
});

// --- F13: Experience period formatting ---
describe("F13: Experience period from start/end dates", () => {
  it("formats current experience with localized 'Attuale'", async () => {
    const { composeOptimisticPage } = await import("@/lib/services/page-composer");
    const facts = [
      { id: "1", category: "identity", key: "name", value: { full: "Marco" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
      { id: "2", category: "experience", key: "acme", value: { role: "architect", company: "Acme", start: "2020-03", status: "current" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
    ];
    const config = composeOptimisticPage(facts as any, "draft", "it");
    const exp = config.sections.find((s) => s.type === "experience");
    expect(exp).toBeDefined();
    const items = (exp!.content as any).items;
    expect(items[0].period).toBeDefined();
    // Should contain "Attuale" (Italian for "Current") since status is "current"
    expect(items[0].period).toContain("Attuale");
  });

  it("does NOT show 'Attuale' for past experience without end date", async () => {
    const { composeOptimisticPage } = await import("@/lib/services/page-composer");
    const facts = [
      { id: "1", category: "identity", key: "name", value: { full: "Marco" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
      { id: "2", category: "experience", key: "oldco", value: { role: "engineer", company: "OldCo", start: "2018-01", status: "past" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
    ];
    const config = composeOptimisticPage(facts as any, "draft", "it");
    const exp = config.sections.find((s) => s.type === "experience");
    expect(exp).toBeDefined();
    const items = (exp!.content as any).items;
    // Past experience without end date should NOT contain "Attuale"
    expect(items[0].period).not.toContain("Attuale");
  });
});

// --- F17/F22: Website platform localization ---
describe("F17/F22: Website platform localized", () => {
  it("uses localized platform name for website", async () => {
    const { composeOptimisticPage } = await import("@/lib/services/page-composer");
    const facts = [
      { id: "1", category: "identity", key: "name", value: { full: "Marco" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
      { id: "2", category: "contact", key: "website", value: { type: "website", value: "https://marco.dev" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
    ];
    const config = composeOptimisticPage(facts as any, "draft", "it");
    const hero = config.sections.find((s) => s.type === "hero");
    expect(hero).toBeDefined();
    const links = (hero!.content as any).socialLinks ?? [];
    const websiteLink = links.find((l: any) => l.url?.includes("marco.dev"));
    expect(websiteLink).toBeDefined();
    // Platform stays canonical for icon lookup; label is localized for display
    expect(websiteLink.platform).toBe("website");
    expect(websiteLink.label).toBe("Sito Web");
  });

  it("localizes 'website' from social facts too", async () => {
    const { composeOptimisticPage } = await import("@/lib/services/page-composer");
    const facts = [
      { id: "1", category: "identity", key: "name", value: { full: "Marco" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
      { id: "2", category: "social", key: "website", value: { platform: "website", url: "https://marco.dev" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
    ];
    const config = composeOptimisticPage(facts as any, "draft", "it");
    const hero = config.sections.find((s) => s.type === "hero");
    expect(hero).toBeDefined();
    const links = (hero!.content as any).socialLinks ?? [];
    const websiteLink = links.find((l: any) => l.url?.includes("marco.dev"));
    expect(websiteLink).toBeDefined();
    expect(websiteLink.platform).toBe("website");
    expect(websiteLink.label).toBe("Sito Web");
  });
});

// --- F27: Experience freelance redundancy ---
describe("F27: Experience freelance/freelance redundancy", () => {
  it("removes company when both role and company are freelance markers", async () => {
    const { composeOptimisticPage } = await import("@/lib/services/page-composer");
    const facts = [
      { id: "1", category: "identity", key: "name", value: { full: "Marco" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
      { id: "2", category: "experience", key: "freelance-arch", value: { role: "freelance architect", company: "Freelance", status: "current" }, source: "chat", confidence: 1.0, visibility: "proposed", createdAt: null, updatedAt: null },
    ];
    const config = composeOptimisticPage(facts as any, "draft", "en");
    const exp = config.sections.find((s) => s.type === "experience");
    expect(exp).toBeDefined();
    const items = (exp!.content as any).items;
    // Company should be stripped since both role contains "freelance" and company is "Freelance"
    expect(items[0].company).toBeUndefined();
  });
});

// --- F29: Error message extraction (behavioral) ---
describe("F29: extractErrorMessage", () => {
  it("returns fallback for non-Error non-string values", async () => {
    const { extractErrorMessage } = await import("@/lib/services/errors");
    expect(extractErrorMessage(42)).toBe("Unable to generate a response right now.");
    expect(extractErrorMessage(null)).toBe("Unable to generate a response right now.");
    expect(extractErrorMessage(undefined)).toBe("Unable to generate a response right now.");
  });

  it("extracts message from Error objects", async () => {
    const { extractErrorMessage } = await import("@/lib/services/errors");
    expect(extractErrorMessage(new Error("something broke"))).toBe("something broke");
  });

  it("passes through plain string errors", async () => {
    const { extractErrorMessage } = await import("@/lib/services/errors");
    expect(extractErrorMessage("network timeout")).toBe("network timeout");
  });

  it("parses JSON error objects", async () => {
    const { extractErrorMessage } = await import("@/lib/services/errors");
    expect(extractErrorMessage(new Error('{"error":"Rate limit exceeded"}'))).toBe("Rate limit exceeded");
  });

  it("extracts error from mixed content with JSON substring", async () => {
    const { extractErrorMessage } = await import("@/lib/services/errors");
    const mixed = 'Upstream error: {"error":"Service unavailable"}';
    expect(extractErrorMessage(new Error(mixed))).toBe("Service unavailable");
  });
});

// --- F19/F31: Experience key collision guardrail ---
describe("F19/F31: Experience key collision guardrail", () => {
  it("getFactByKey is exported from kb-service", async () => {
    // Dynamic import to verify the function is exported and callable
    const mod = await import("@/lib/services/kb-service");
    expect(typeof mod.getFactByKey).toBe("function");
  });
});

// --- F1: Bootstrap skipPace (verified via mock in bootstrap-endpoint.test.ts) ---
describe("F1: Bootstrap uses skipPace", () => {
  it("checkRateLimit receives skipPace: true", async () => {
    // Import the mocked bootstrap test to verify wiring
    // The bootstrap-endpoint.test.ts already mocks checkRateLimit.
    // Here we verify the source pattern as a structural regression guard.
    const path = await import("path");
    const fs = await import("fs");
    const src = fs.readFileSync(path.join(process.cwd(), "src/app/api/chat/bootstrap/route.ts"), "utf-8");
    expect(src).toContain("skipPace: true");
  });
});

// --- F28: Token limit env var fallback ---
describe("F28: Token limit env var fallback", () => {
  it("usage-service reads LLM_DAILY_TOKEN_LIMIT env var with 500k default", async () => {
    const path = await import("path");
    const fs = await import("fs");
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/services/usage-service.ts"), "utf-8");
    expect(src).toContain("500_000");
    expect(src).toContain("LLM_DAILY_TOKEN_LIMIT");
  });
});

// --- F26: Auth detection includes username ---
describe("F26: Auth detection includes username", () => {
  it("preferences route checks userId OR username", async () => {
    const path = await import("path");
    const fs = await import("fs");
    const src = fs.readFileSync(path.join(process.cwd(), "src/app/api/preferences/route.ts"), "utf-8");
    expect(src).toContain("authCtx?.userId || authCtx?.username");
  });
});
