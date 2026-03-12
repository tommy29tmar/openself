import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FactInput } from "@/lib/connectors/linkedin-zip/mapper";

// ---------------------------------------------------------------------------
// Mock only the DB-touching layer (batchCreateFacts + insertEvent) — capture facts for assertions.
// The REAL parser + mapper + import orchestration run unchanged.
// ---------------------------------------------------------------------------

const capturedFacts: FactInput[] = [];

const mockBatchCreateFacts = vi
  .fn()
  .mockImplementation(async (inputs: FactInput[]) => {
    capturedFacts.push(...inputs);
    return { factsWritten: inputs.length, factsSkipped: 0, errors: [] };
  });

vi.mock("@/lib/connectors/connector-fact-writer", () => ({
  batchCreateFacts: (...args: any[]) => mockBatchCreateFacts(...args),
}));

vi.mock("@/lib/services/episodic-service", () => ({
  insertEvent: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock yauzl-promise — provide fake ZIP entries with real CSV content
// ---------------------------------------------------------------------------

function createMockEntry(filename: string, content: string) {
  return {
    filename,
    openReadStream: () =>
      Promise.resolve({
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(content, "utf-8");
        },
      }),
  };
}

function createMockZipReader(
  entries: ReturnType<typeof createMockEntry>[],
) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const entry of entries) yield entry;
    },
    close: vi.fn().mockResolvedValue(undefined),
  };
}

const mockFromBuffer = vi.fn();

vi.mock("yauzl-promise", () => ({
  fromBuffer: (...args: any[]) => mockFromBuffer(...args),
}));

// ---------------------------------------------------------------------------
// Import SUT — uses real parser.ts + mapper.ts, only yauzl + fact-writer mocked
// ---------------------------------------------------------------------------

const { importLinkedInZip } = await import(
  "@/lib/connectors/linkedin-zip/import"
);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockScope = {
  cognitiveOwnerKey: "owner-1",
  knowledgeReadKeys: ["sess-1"],
  knowledgePrimaryKey: "sess-1",
  currentSessionId: "sess-1",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LinkedIn ZIP E2E — real parser + real mappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedFacts.length = 0;
  });

  it("full flow: Profile + Positions + Skills CSVs → correct facts", async () => {
    const profileCsv = [
      "First Name,Last Name,Headline,Geo Location",
      "John,Doe,Senior Engineer at Acme,New York",
    ].join("\n");

    const positionsCsv = [
      "Company Name,Title,Started On,Finished On,Description,Location",
      "Acme Corp,Lead Engineer,Jan 2022,,Led the platform team,NYC",
      "StartupX,Developer,Mar 2019,Dec 2021,Built core features,SF",
    ].join("\n");

    const skillsCsv = ["Name", "TypeScript", "React", "Node.js"].join("\n");

    mockFromBuffer.mockResolvedValue(
      createMockZipReader([
        createMockEntry("Profile.csv", profileCsv),
        createMockEntry("Positions.csv", positionsCsv),
        createMockEntry("Skills.csv", skillsCsv),
      ]),
    );

    const report = await importLinkedInZip(
      Buffer.from("fake"),
      mockScope,
      "johndoe",
      "en",
    );

    // Report should reflect all facts
    expect(report.factsWritten).toBeGreaterThan(0);
    expect(report.errors).toHaveLength(0);

    // --- Identity facts from Profile.csv ---
    const identityFacts = capturedFacts.filter(
      (f) => f.category === "identity",
    );
    expect(identityFacts.some((f) => f.key === "li-name")).toBe(true);
    const nameFact = identityFacts.find((f) => f.key === "li-name")!;
    expect(nameFact.value.name).toBe("John Doe");

    expect(identityFacts.some((f) => f.key === "li-headline")).toBe(true);
    const headlineFact = identityFacts.find(
      (f) => f.key === "li-headline",
    )!;
    expect(headlineFact.value.role).toBe("Senior Engineer at Acme");

    expect(identityFacts.some((f) => f.key === "li-location")).toBe(true);
    const locationFact = identityFacts.find(
      (f) => f.key === "li-location",
    )!;
    expect(locationFact.value.city).toBe("New York");

    // --- Experience facts from Positions.csv ---
    const expFacts = capturedFacts.filter((f) => f.category === "experience");
    expect(expFacts).toHaveLength(2);

    // Verify "current" status — only the latest open position (Acme Corp)
    const acmeFact = expFacts.find((f) => f.value.company === "Acme Corp")!;
    expect(acmeFact.value.status).toBe("current");
    expect(acmeFact.value.role).toBe("Lead Engineer");
    expect(acmeFact.value.startDate).toBe("2022-01");
    expect(acmeFact.value.description).toBe("Led the platform team");
    expect(acmeFact.value.location).toBe("NYC");

    const startupFact = expFacts.find(
      (f) => f.value.company === "StartupX",
    )!;
    expect(startupFact.value.status).toBe("past");
    expect(startupFact.value.startDate).toBe("2019-03");
    expect(startupFact.value.endDate).toBe("2021-12");

    // --- Skill facts from Skills.csv ---
    const skillFacts = capturedFacts.filter((f) => f.category === "skill");
    expect(skillFacts).toHaveLength(3);
    expect(skillFacts.every((f) => f.key.startsWith("li-"))).toBe(true);
    expect(skillFacts.map((f) => f.value.name).sort()).toEqual([
      "Node.js",
      "React",
      "TypeScript",
    ]);
  });

  it("excludes messages.csv and ad_targeting.csv from processing", async () => {
    const skillsCsv = ["Name", "Python"].join("\n");
    const messagesCsv = ["From,To,Message", "Alice,Bob,Hello"].join("\n");
    const adTargetingCsv = ["Data", "foo"].join("\n");

    mockFromBuffer.mockResolvedValue(
      createMockZipReader([
        createMockEntry("Skills.csv", skillsCsv),
        createMockEntry("messages.csv", messagesCsv),
        createMockEntry("Ad_Targeting.csv", adTargetingCsv),
      ]),
    );

    const report = await importLinkedInZip(
      Buffer.from("fake"),
      mockScope,
      "user",
      "en",
    );

    // Only skills should produce facts
    expect(capturedFacts).toHaveLength(1);
    expect(capturedFacts[0].category).toBe("skill");
    expect(capturedFacts[0].value.name).toBe("Python");
    expect(report.factsWritten).toBe(1);
  });

  it("handles Education + Languages + Certifications CSVs", async () => {
    const eduCsv = [
      "School Name,Degree Name,Fields of Study,Start Date,End Date",
      "MIT,MS,Computer Science,2015,2017",
    ].join("\n");

    const langCsv = [
      "Name,Proficiency",
      "English,NATIVE_OR_BILINGUAL",
      "French,LIMITED_WORKING",
    ].join("\n");

    const certCsv = [
      "Name,Authority,Started On,Finished On,Url",
      "AWS Solutions Architect,Amazon,Jan 2023,,https://aws.cert",
    ].join("\n");

    mockFromBuffer.mockResolvedValue(
      createMockZipReader([
        createMockEntry("Education.csv", eduCsv),
        createMockEntry("Languages.csv", langCsv),
        createMockEntry("Certifications.csv", certCsv),
      ]),
    );

    const report = await importLinkedInZip(
      Buffer.from("fake"),
      mockScope,
      "user",
      "en",
    );

    expect(report.factsWritten).toBeGreaterThan(0);
    expect(report.errors).toHaveLength(0);

    // Education
    const eduFacts = capturedFacts.filter((f) => f.category === "education");
    expect(eduFacts).toHaveLength(1);
    expect(eduFacts[0].value.institution).toBe("MIT");
    expect(eduFacts[0].value.degree).toBe("MS");
    expect(eduFacts[0].value.field).toBe("Computer Science");
    expect(eduFacts[0].value.startDate).toBe("2015");
    expect(eduFacts[0].value.endDate).toBe("2017");

    // Languages
    const langFacts = capturedFacts.filter((f) => f.category === "language");
    expect(langFacts).toHaveLength(2);
    const english = langFacts.find(
      (f) => f.value.language === "English",
    )!;
    expect(english.value.proficiency).toBe("native");
    const french = langFacts.find(
      (f) => f.value.language === "French",
    )!;
    expect(french.value.proficiency).toBe("intermediate");

    // Certifications → achievement category
    const achFacts = capturedFacts.filter(
      (f) => f.category === "achievement",
    );
    expect(achFacts).toHaveLength(1);
    expect(achFacts[0].value.type).toBe("certification");
    expect(achFacts[0].value.title).toBe("AWS Solutions Architect");
    expect(achFacts[0].value.issuer).toBe("Amazon");
    expect(achFacts[0].value.date).toBe("2023-01");
    expect(achFacts[0].value.url).toBe("https://aws.cert");
  });

  it("handles ZIP with directory prefixes in filenames", async () => {
    const skillsCsv = ["Name", "Python", "Go"].join("\n");

    mockFromBuffer.mockResolvedValue(
      createMockZipReader([
        createMockEntry(
          "Basic_LinkedInDataExport_09-15-2024/Skills.csv",
          skillsCsv,
        ),
      ]),
    );

    const report = await importLinkedInZip(
      Buffer.from("fake"),
      mockScope,
      "user",
      "en",
    );

    const skillFacts = capturedFacts.filter((f) => f.category === "skill");
    expect(skillFacts).toHaveLength(2);
    expect(skillFacts.map((f) => f.value.name).sort()).toEqual(["Go", "Python"]);
    expect(report.factsWritten).toBe(2);
  });

  it("handles corrupt ZIP gracefully — returns error report, no throw", async () => {
    mockFromBuffer.mockRejectedValue(
      new Error("End of central directory record signature not found"),
    );

    const report = await importLinkedInZip(
      Buffer.from("not-a-zip"),
      mockScope,
      "user",
      "en",
    );

    expect(report.factsWritten).toBe(0);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].reason).toContain("Invalid ZIP");
    expect(report.errors[0].reason).toContain(
      "End of central directory record signature not found",
    );
  });

  it("returns empty report for ZIP with no recognized CSVs", async () => {
    mockFromBuffer.mockResolvedValue(
      createMockZipReader([
        createMockEntry("random.txt", "hello world"),
        createMockEntry("unknown.csv", "Col1,Col2\na,b"),
      ]),
    );

    const report = await importLinkedInZip(
      Buffer.from("fake"),
      mockScope,
      "user",
      "en",
    );

    expect(report.factsWritten).toBe(0);
    expect(report.factsSkipped).toBe(0);
    expect(report.errors).toHaveLength(0);
    expect(capturedFacts).toHaveLength(0);
    // batchCreateFacts should NOT be called when no facts gathered
    expect(mockBatchCreateFacts).not.toHaveBeenCalled();
  });

  it("passes scope, username, and factLanguage through to batchCreateFacts", async () => {
    const skillsCsv = ["Name", "Rust"].join("\n");

    mockFromBuffer.mockResolvedValue(
      createMockZipReader([createMockEntry("Skills.csv", skillsCsv)]),
    );

    await importLinkedInZip(
      Buffer.from("fake"),
      mockScope,
      "alice",
      "it",
    );

    expect(mockBatchCreateFacts).toHaveBeenCalledTimes(1);
    const [facts, scope, username, lang] = mockBatchCreateFacts.mock.calls[0];
    expect(facts).toHaveLength(1);
    expect(scope).toBe(mockScope);
    expect(username).toBe("alice");
    expect(lang).toBe("it");
  });

  it("processes all 10 supported file types with real CSV content", async () => {
    const profileCsv = [
      "First Name,Last Name,Headline",
      "Jane,Smith,Product Manager",
    ].join("\n");

    const summaryCsv = ["Summary", "Experienced PM with 10 years in tech."].join(
      "\n",
    );

    const positionsCsv = [
      "Company Name,Title,Started On,Finished On,Description,Location",
      "BigCo,PM,Jan 2020,,Managed products,Berlin",
    ].join("\n");

    const eduCsv = [
      "School Name,Degree Name,Fields of Study,Start Date,End Date",
      "Stanford,MBA,Business,2016,2018",
    ].join("\n");

    const skillsCsv = ["Name", "Strategy"].join("\n");

    const langCsv = ["Name,Proficiency", "German,FULL_PROFESSIONAL"].join("\n");

    const certCsv = [
      "Name,Authority,Started On,Finished On,Url",
      "PMP,PMI,Jun 2021,,",
    ].join("\n");

    mockFromBuffer.mockResolvedValue(
      createMockZipReader([
        createMockEntry("Profile.csv", profileCsv),
        createMockEntry("Profile Summary.csv", summaryCsv),
        createMockEntry("Positions.csv", positionsCsv),
        createMockEntry("Education.csv", eduCsv),
        createMockEntry("Skills.csv", skillsCsv),
        createMockEntry("Languages.csv", langCsv),
        createMockEntry("Certifications.csv", certCsv),
      ]),
    );

    const report = await importLinkedInZip(
      Buffer.from("fake"),
      mockScope,
      "janesmith",
      "en",
    );

    expect(report.errors).toHaveLength(0);
    expect(report.factsWritten).toBeGreaterThan(0);

    // Verify at least one fact per category
    const categories = new Set(capturedFacts.map((f) => f.category));
    expect(categories).toContain("identity"); // Profile + Summary
    expect(categories).toContain("experience"); // Positions
    expect(categories).toContain("education"); // Education
    expect(categories).toContain("skill"); // Skills
    expect(categories).toContain("language"); // Languages
    expect(categories).toContain("achievement"); // Certifications

    // Verify identity facts include both name and summary
    const identityFacts = capturedFacts.filter(
      (f) => f.category === "identity",
    );
    expect(identityFacts.some((f) => f.key === "li-name")).toBe(true);
    expect(identityFacts.some((f) => f.key === "li-summary")).toBe(true);
    expect(
      identityFacts.find((f) => f.key === "li-summary")!.value.text,
    ).toBe("Experienced PM with 10 years in tech.");

    // Verify position
    const expFacts = capturedFacts.filter(
      (f) => f.category === "experience",
    );
    expect(expFacts).toHaveLength(1);
    expect(expFacts[0].value.company).toBe("BigCo");
    expect(expFacts[0].value.status).toBe("current");

    // Verify German language proficiency mapping
    const langFacts = capturedFacts.filter(
      (f) => f.category === "language",
    );
    expect(langFacts[0].value.proficiency).toBe("fluent");

    // Verify certifications in achievement (courses, follows, causes excluded)
    const achFacts = capturedFacts.filter(
      (f) => f.category === "achievement",
    );
    expect(achFacts).toHaveLength(1);
    expect(achFacts[0].value.type).toBe("certification");

    // Verify no interest facts (company follows and causes are excluded)
    const intFacts = capturedFacts.filter(
      (f) => f.category === "interest",
    );
    expect(intFacts).toHaveLength(0);
  });

  it("position key generation: unique keys + collision handling", async () => {
    const positionsCsv = [
      "Company Name,Title,Started On,Finished On,Description,Location",
      "Acme Corp,Developer,Jan 2020,Dec 2020,,",
      "Acme Corp,Senior Dev,Mar 2020,Dec 2021,,",
      "Other Inc,Engineer,Jan 2022,,,",
    ].join("\n");

    mockFromBuffer.mockResolvedValue(
      createMockZipReader([createMockEntry("Positions.csv", positionsCsv)]),
    );

    await importLinkedInZip(
      Buffer.from("fake"),
      mockScope,
      "user",
      "en",
    );

    const expFacts = capturedFacts.filter((f) => f.category === "experience");
    expect(expFacts).toHaveLength(3);

    const keys = expFacts.map((f) => f.key);
    // Same company + same start year → collision suffix
    expect(keys).toContain("li-acme-corp-2020");
    expect(keys).toContain("li-acme-corp-2020-1");
    expect(keys).toContain("li-other-inc-2022");
    // All keys are unique
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("real CSV parsing: handles BOM, empty lines, quoted commas", async () => {
    // BOM prefix + quoted field with comma
    const profileCsv =
      "\uFEFFFirst Name,Last Name,Headline\nJohn,\"Doe, Jr.\",\"Lead Engineer, Platform\"";

    mockFromBuffer.mockResolvedValue(
      createMockZipReader([createMockEntry("Profile.csv", profileCsv)]),
    );

    await importLinkedInZip(
      Buffer.from("fake"),
      mockScope,
      "user",
      "en",
    );

    const nameFact = capturedFacts.find((f) => f.key === "li-name")!;
    expect(nameFact.value.name).toBe("John Doe, Jr.");

    const headlineFact = capturedFacts.find(
      (f) => f.key === "li-headline",
    )!;
    expect(headlineFact.value.role).toBe("Lead Engineer, Platform");
  });

  it("real CSV parsing: handles preamble lines before header", async () => {
    // LinkedIn exports sometimes include preamble text before the CSV header.
    // The parser skips preamble by looking for the first line with a comma.
    // This test uses a multi-column CSV (Education) since single-column CSVs
    // (e.g., Skills with just "Name") don't trigger the preamble skip.
    const eduCsv = [
      "Notes: This file contains your education history.",
      "School Name,Degree Name,Fields of Study,Start Date,End Date",
      "Stanford,BSc,Computer Science,2014,2018",
    ].join("\n");

    mockFromBuffer.mockResolvedValue(
      createMockZipReader([createMockEntry("Education.csv", eduCsv)]),
    );

    await importLinkedInZip(
      Buffer.from("fake"),
      mockScope,
      "user",
      "en",
    );

    const eduFacts = capturedFacts.filter((f) => f.category === "education");
    expect(eduFacts).toHaveLength(1);
    expect(eduFacts[0].value.institution).toBe("Stanford");
    expect(eduFacts[0].value.degree).toBe("BSc");
  });

  it("date normalization: various LinkedIn date formats → ISO", async () => {
    const positionsCsv = [
      "Company Name,Title,Started On,Finished On,Description,Location",
      "Company A,Role A,Jan 2020,Dec 2021,,",
      "Company B,Role B,2018,2019,,",
    ].join("\n");

    mockFromBuffer.mockResolvedValue(
      createMockZipReader([createMockEntry("Positions.csv", positionsCsv)]),
    );

    await importLinkedInZip(
      Buffer.from("fake"),
      mockScope,
      "user",
      "en",
    );

    const expFacts = capturedFacts.filter((f) => f.category === "experience");
    const compA = expFacts.find((f) => f.value.company === "Company A")!;
    expect(compA.value.startDate).toBe("2020-01");
    expect(compA.value.endDate).toBe("2021-12");

    const compB = expFacts.find((f) => f.value.company === "Company B")!;
    expect(compB.value.startDate).toBe("2018");
    expect(compB.value.endDate).toBe("2019");
  });

  it("website URL normalization: adds https:// when missing", async () => {
    const profileCsv = [
      "First Name,Last Name,Websites",
      "Jane,Doe,alice.dev",
    ].join("\n");

    mockFromBuffer.mockResolvedValue(
      createMockZipReader([createMockEntry("Profile.csv", profileCsv)]),
    );

    await importLinkedInZip(
      Buffer.from("fake"),
      mockScope,
      "user",
      "en",
    );

    const websiteFact = capturedFacts.find(
      (f) => f.key === "li-website-0",
    )!;
    expect(websiteFact.value.url).toBe("https://alice.dev");
  });

  it("twitter handle: strips @ prefix", async () => {
    const profileCsv = [
      "First Name,Last Name,Twitter Handles",
      "Jane,Doe,@janecodes",
    ].join("\n");

    mockFromBuffer.mockResolvedValue(
      createMockZipReader([createMockEntry("Profile.csv", profileCsv)]),
    );

    await importLinkedInZip(
      Buffer.from("fake"),
      mockScope,
      "user",
      "en",
    );

    const twitterFact = capturedFacts.find(
      (f) => f.key === "li-twitter",
    )!;
    expect(twitterFact.value.username).toBe("janecodes");
    expect(twitterFact.value.platform).toBe("twitter");
  });

  it("empty CSV rows are skipped — no facts for blank skills", async () => {
    const skillsCsv = ["Name", "", "  ", "TypeScript", ""].join("\n");

    mockFromBuffer.mockResolvedValue(
      createMockZipReader([createMockEntry("Skills.csv", skillsCsv)]),
    );

    await importLinkedInZip(
      Buffer.from("fake"),
      mockScope,
      "user",
      "en",
    );

    const skillFacts = capturedFacts.filter((f) => f.category === "skill");
    expect(skillFacts).toHaveLength(1);
    expect(skillFacts[0].value.name).toBe("TypeScript");
  });

  it("ZIP reader is always closed (even on success)", async () => {
    const skillsCsv = ["Name", "Go"].join("\n");
    const zipReader = createMockZipReader([
      createMockEntry("Skills.csv", skillsCsv),
    ]);
    mockFromBuffer.mockResolvedValue(zipReader);

    await importLinkedInZip(
      Buffer.from("fake"),
      mockScope,
      "user",
      "en",
    );

    expect(zipReader.close).toHaveBeenCalledTimes(1);
  });

  it("multiple positions: only latest open position is current", async () => {
    const positionsCsv = [
      "Company Name,Title,Started On,Finished On,Description,Location",
      "OldCo,Dev,Jan 2015,Dec 2018,,",
      "MidCo,Lead,Jan 2019,,,",
      "NewCo,CTO,Jan 2023,,,",
    ].join("\n");

    mockFromBuffer.mockResolvedValue(
      createMockZipReader([createMockEntry("Positions.csv", positionsCsv)]),
    );

    await importLinkedInZip(
      Buffer.from("fake"),
      mockScope,
      "user",
      "en",
    );

    const expFacts = capturedFacts.filter((f) => f.category === "experience");
    expect(expFacts).toHaveLength(3);

    // Only the latest open position (NewCo, started 2023) should be "current"
    const currentFacts = expFacts.filter(
      (f) => f.value.status === "current",
    );
    expect(currentFacts).toHaveLength(1);
    expect(currentFacts[0].value.company).toBe("NewCo");

    // MidCo is open but not the latest — marked as past
    const midCo = expFacts.find((f) => f.value.company === "MidCo")!;
    expect(midCo.value.status).toBe("past");
  });

  it("all closed positions → all marked as past", async () => {
    const positionsCsv = [
      "Company Name,Title,Started On,Finished On,Description,Location",
      "CompA,Dev,Jan 2015,Dec 2018,,",
      "CompB,Lead,Jan 2019,Dec 2022,,",
    ].join("\n");

    mockFromBuffer.mockResolvedValue(
      createMockZipReader([createMockEntry("Positions.csv", positionsCsv)]),
    );

    await importLinkedInZip(
      Buffer.from("fake"),
      mockScope,
      "user",
      "en",
    );

    const expFacts = capturedFacts.filter((f) => f.category === "experience");
    expect(expFacts.every((f) => f.value.status === "past")).toBe(true);
  });
});
