import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockBatchCreateFacts = vi
  .fn()
  .mockResolvedValue({ factsWritten: 5, factsSkipped: 0, errors: [] });

vi.mock("@/lib/connectors/connector-fact-writer", () => ({
  batchCreateFacts: (...args: any[]) => mockBatchCreateFacts(...args),
}));

vi.mock("@/lib/services/episodic-service", () => ({
  insertEvent: vi.fn(),
}));

vi.mock("@/lib/connectors/linkedin-zip/activity-mapper", () => ({
  mapCertificationsToEpisodic: vi.fn(() => []),
  mapArticlesToEpisodic: vi.fn(() => []),
}));

// Mock parser — returns rows from content so we can verify which files were parsed
const mockParseLinkedInCsv = vi.fn().mockImplementation((content: string) => {
  // Return a simple row so mappers have something to work with
  try {
    return JSON.parse(content);
  } catch {
    return [];
  }
});

vi.mock("@/lib/connectors/linkedin-zip/parser", () => ({
  parseLinkedInCsv: (...args: any[]) => mockParseLinkedInCsv(...args),
}));

// Mock mappers — each returns a single fact tagged with the mapper name
const mockMapProfile = vi.fn().mockReturnValue([
  { category: "identity", key: "li-name", value: { name: "Test" } },
]);
const mockMapProfileSummary = vi.fn().mockReturnValue([
  { category: "identity", key: "li-summary", value: { text: "Summary" } },
]);
const mockMapPositions = vi.fn().mockReturnValue([
  { category: "experience", key: "li-acme-2020", value: { company: "Acme" } },
]);
const mockMapEducation = vi.fn().mockReturnValue([
  { category: "education", key: "li-edu-mit-0", value: { institution: "MIT" } },
]);
const mockMapSkills = vi.fn().mockReturnValue([
  { category: "skill", key: "li-typescript", value: { name: "TypeScript" } },
]);
const mockMapLanguages = vi.fn().mockReturnValue([
  { category: "language", key: "li-lang-english", value: { language: "English" } },
]);
const mockMapCertifications = vi.fn().mockReturnValue([
  { category: "achievement", key: "li-cert-aws-0", value: { title: "AWS" } },
]);
vi.mock("@/lib/connectors/linkedin-zip/mapper", () => ({
  mapProfile: (...args: any[]) => mockMapProfile(...args),
  mapProfileSummary: (...args: any[]) => mockMapProfileSummary(...args),
  mapPositions: (...args: any[]) => mockMapPositions(...args),
  mapEducation: (...args: any[]) => mockMapEducation(...args),
  mapSkills: (...args: any[]) => mockMapSkills(...args),
  mapLanguages: (...args: any[]) => mockMapLanguages(...args),
  mapCertifications: (...args: any[]) => mockMapCertifications(...args),
}));

// --- yauzl-promise mock ---

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

// --- Import SUT after mocks ---

const { importLinkedInZip } = await import(
  "@/lib/connectors/linkedin-zip/import"
);

// --- Fixtures ---

const mockScope = {
  cognitiveOwnerKey: "owner-1",
  knowledgeReadKeys: ["sess-1"],
  knowledgePrimaryKey: "sess-1",
  currentSessionId: "sess-1",
};

describe("importLinkedInZip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchCreateFacts.mockResolvedValue({
      factsWritten: 5,
      factsSkipped: 0,
      errors: [],
    });
  });

  it("extracts CSVs, maps them, and calls batchCreateFacts with combined facts", async () => {
    const zipReader = createMockZipReader([
      createMockEntry("Profile.csv", "[]"),
      createMockEntry("Skills.csv", "[]"),
    ]);
    mockFromBuffer.mockResolvedValue(zipReader);

    const report = await importLinkedInZip(
      Buffer.from("fake-zip"),
      mockScope,
      "testuser",
      "en",
    );

    // Both mappers should have been called
    expect(mockMapProfile).toHaveBeenCalledTimes(1);
    expect(mockMapSkills).toHaveBeenCalledTimes(1);

    // batchCreateFacts receives combined facts from both mappers
    expect(mockBatchCreateFacts).toHaveBeenCalledTimes(1);
    const [facts, scope, username, lang] = mockBatchCreateFacts.mock.calls[0];
    expect(facts).toHaveLength(2); // 1 from mapProfile + 1 from mapSkills
    expect(scope).toBe(mockScope);
    expect(username).toBe("testuser");
    expect(lang).toBe("en");

    expect(report.factsWritten).toBe(5);
    expect(report.factsSkipped).toBe(0);
  });

  it("returns ImportReport with correct counts from batchCreateFacts", async () => {
    mockBatchCreateFacts.mockResolvedValue({
      factsWritten: 3,
      factsSkipped: 2,
      errors: [{ key: "li-x", reason: "validation failed" }],
    });

    const zipReader = createMockZipReader([
      createMockEntry("Positions.csv", "[]"),
    ]);
    mockFromBuffer.mockResolvedValue(zipReader);

    const report = await importLinkedInZip(
      Buffer.from("fake-zip"),
      mockScope,
      "testuser",
      "en",
    );

    expect(report.factsWritten).toBe(3);
    expect(report.factsSkipped).toBe(2);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].reason).toBe("validation failed");
  });

  it("skips excluded files (messages.csv, ad_targeting.csv)", async () => {
    const zipReader = createMockZipReader([
      createMockEntry("messages.csv", "[]"),
      createMockEntry("Ad_Targeting.csv", "[]"), // case-insensitive match
      createMockEntry("Skills.csv", "[]"),
    ]);
    mockFromBuffer.mockResolvedValue(zipReader);

    await importLinkedInZip(
      Buffer.from("fake-zip"),
      mockScope,
      "testuser",
      "en",
    );

    // Only Skills.csv should be processed
    expect(mockMapSkills).toHaveBeenCalledTimes(1);
    // parseLinkedInCsv should only be called for Skills.csv (1 time)
    expect(mockParseLinkedInCsv).toHaveBeenCalledTimes(1);
  });

  it("handles ZIP with no recognized CSVs — returns empty report", async () => {
    const zipReader = createMockZipReader([
      createMockEntry("unknown_file.csv", "[]"),
      createMockEntry("readme.txt", "hello"),
    ]);
    mockFromBuffer.mockResolvedValue(zipReader);

    const report = await importLinkedInZip(
      Buffer.from("fake-zip"),
      mockScope,
      "testuser",
      "en",
    );

    expect(report.factsWritten).toBe(0);
    expect(report.factsSkipped).toBe(0);
    expect(report.errors).toHaveLength(0);
    // batchCreateFacts should NOT be called when no facts
    expect(mockBatchCreateFacts).not.toHaveBeenCalled();
  });

  it("handles corrupt ZIP — returns error report", async () => {
    mockFromBuffer.mockRejectedValue(new Error("End of central directory not found"));

    const report = await importLinkedInZip(
      Buffer.from("not-a-zip"),
      mockScope,
      "testuser",
      "en",
    );

    expect(report.factsWritten).toBe(0);
    expect(report.factsSkipped).toBe(0);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].reason).toContain("Invalid ZIP:");
    expect(report.errors[0].reason).toContain("End of central directory not found");
  });

  it("handles directory-prefixed filenames in ZIP", async () => {
    const zipReader = createMockZipReader([
      createMockEntry("Basic_LinkedInDataExport_09-15-2024/Skills.csv", "[]"),
      createMockEntry("Basic_LinkedInDataExport_09-15-2024/Education.csv", "[]"),
    ]);
    mockFromBuffer.mockResolvedValue(zipReader);

    await importLinkedInZip(
      Buffer.from("fake-zip"),
      mockScope,
      "testuser",
      "en",
    );

    // Both mappers should be called despite directory prefix
    expect(mockMapSkills).toHaveBeenCalledTimes(1);
    expect(mockMapEducation).toHaveBeenCalledTimes(1);
    expect(mockBatchCreateFacts).toHaveBeenCalledTimes(1);
  });

  it("closes ZIP reader even when an error occurs during extraction", async () => {
    const zipReader = createMockZipReader([]);
    // Override the iterator to throw
    zipReader[Symbol.asyncIterator] = async function* () {
      throw new Error("read error");
    };
    mockFromBuffer.mockResolvedValue(zipReader);

    await expect(
      importLinkedInZip(Buffer.from("fake-zip"), mockScope, "testuser", "en"),
    ).rejects.toThrow("read error");

    // close() must still be called (finally block)
    expect(zipReader.close).toHaveBeenCalledTimes(1);
  });

  it("processes all 7 supported file types", async () => {
    const zipReader = createMockZipReader([
      createMockEntry("Profile.csv", "[]"),
      createMockEntry("Profile Summary.csv", "[]"),
      createMockEntry("Positions.csv", "[]"),
      createMockEntry("Education.csv", "[]"),
      createMockEntry("Skills.csv", "[]"),
      createMockEntry("Languages.csv", "[]"),
      createMockEntry("Certifications.csv", "[]"),
    ]);
    mockFromBuffer.mockResolvedValue(zipReader);

    await importLinkedInZip(
      Buffer.from("fake-zip"),
      mockScope,
      "testuser",
      "en",
    );

    expect(mockMapProfile).toHaveBeenCalledTimes(1);
    expect(mockMapProfileSummary).toHaveBeenCalledTimes(1);
    expect(mockMapPositions).toHaveBeenCalledTimes(1);
    expect(mockMapEducation).toHaveBeenCalledTimes(1);
    expect(mockMapSkills).toHaveBeenCalledTimes(1);
    expect(mockMapLanguages).toHaveBeenCalledTimes(1);
    expect(mockMapCertifications).toHaveBeenCalledTimes(1);

    // 7 facts total (1 per mapper)
    const [facts] = mockBatchCreateFacts.mock.calls[0];
    expect(facts).toHaveLength(7);
  });

  it("excludes Courses.csv, Company Follows.csv, and Causes You Care About.csv", async () => {
    const zipReader = createMockZipReader([
      createMockEntry("Profile.csv", "[]"),
      createMockEntry("Courses.csv", "[]"),
      createMockEntry("Company Follows.csv", "[]"),
      createMockEntry("Causes You Care About.csv", "[]"),
    ]);
    mockFromBuffer.mockResolvedValue(zipReader);

    await importLinkedInZip(
      Buffer.from("fake-zip"),
      mockScope,
      "testuser",
      "en",
    );

    expect(mockMapProfile).toHaveBeenCalledTimes(1);
    // Only Profile.csv fact should be in the batch
    const [facts] = mockBatchCreateFacts.mock.calls[0];
    expect(facts).toHaveLength(1);
    expect(facts[0].category).toBe("identity");
  });

  it("passes language names to mapSkills for dedup filtering", async () => {
    const zipReader = createMockZipReader([
      createMockEntry("Languages.csv", "[]"),
      createMockEntry("Skills.csv", "[]"),
    ]);
    mockFromBuffer.mockResolvedValue(zipReader);

    await importLinkedInZip(
      Buffer.from("fake-zip"),
      mockScope,
      "testuser",
      "en",
    );

    // mapSkills should receive a Set of language names as second arg
    expect(mockMapSkills).toHaveBeenCalledTimes(1);
    const [, languageNames] = mockMapSkills.mock.calls[0];
    expect(languageNames).toBeInstanceOf(Set);
    expect(languageNames.has("english")).toBe(true);
  });

  it("handles non-Error thrown by fromBuffer", async () => {
    mockFromBuffer.mockRejectedValue("string error");

    const report = await importLinkedInZip(
      Buffer.from("not-a-zip"),
      mockScope,
      "testuser",
      "en",
    );

    expect(report.errors[0].reason).toBe("Invalid ZIP: string error");
  });

  it("handles mapper returning empty array (no facts from file)", async () => {
    mockMapProfile.mockReturnValue([]);
    mockMapSkills.mockReturnValue([]);

    const zipReader = createMockZipReader([
      createMockEntry("Profile.csv", "[]"),
      createMockEntry("Skills.csv", "[]"),
    ]);
    mockFromBuffer.mockResolvedValue(zipReader);

    const report = await importLinkedInZip(
      Buffer.from("fake-zip"),
      mockScope,
      "testuser",
      "en",
    );

    // No facts gathered → early return, batchCreateFacts not called
    expect(report.factsWritten).toBe(0);
    expect(report.factsSkipped).toBe(0);
    expect(mockBatchCreateFacts).not.toHaveBeenCalled();
  });
});
