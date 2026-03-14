import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import {
  createSectionCopyStateService,
  type UpsertStateInput,
} from "@/lib/services/section-copy-state-service";

const testSqlite = new Database(":memory:");
testSqlite.pragma("journal_mode = WAL");

testSqlite.exec(`
  CREATE TABLE section_copy_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_key TEXT NOT NULL,
    section_type TEXT NOT NULL,
    language TEXT NOT NULL,
    personalized_content TEXT NOT NULL,
    facts_hash TEXT NOT NULL,
    soul_hash TEXT NOT NULL,
    approved_at TEXT NOT NULL DEFAULT (datetime('now')),
    source TEXT NOT NULL DEFAULT 'live',
    UNIQUE(owner_key, section_type, language)
  );
  CREATE INDEX idx_section_state_lookup
    ON section_copy_state(owner_key, section_type, language);
`);

const testDb = drizzle(testSqlite, { schema });
const svc = createSectionCopyStateService(testDb as typeof import("@/lib/db").db);

beforeEach(() => {
  testSqlite.exec("DELETE FROM section_copy_state");
});

function makeInput(overrides: Partial<UpsertStateInput> = {}): UpsertStateInput {
  return {
    ownerKey: "owner1",
    sectionType: "bio",
    language: "en",
    personalizedContent: "A creative developer who loves open source.",
    factsHash: "fh-abc",
    soulHash: "sh-def",
    source: "live",
    ...overrides,
  };
}

describe("getActiveCopy", () => {
  it("returns null when no state exists", () => {
    const result = svc.getActiveCopy("owner1", "bio", "en");
    expect(result).toBeNull();
  });
});

describe("upsertState + getActiveCopy", () => {
  it("writes and reads active copy", () => {
    svc.upsertState(makeInput());
    const result = svc.getActiveCopy("owner1", "bio", "en");

    expect(result).not.toBeNull();
    expect(result!.personalizedContent).toBe(
      "A creative developer who loves open source.",
    );
    expect(result!.factsHash).toBe("fh-abc");
    expect(result!.soulHash).toBe("sh-def");
    expect(result!.source).toBe("live");
    expect(result!.approvedAt).toBeTruthy();
  });

  it("upsert overwrites on conflict (same owner+section+language)", () => {
    svc.upsertState(makeInput({ personalizedContent: "version 1" }));
    svc.upsertState(
      makeInput({
        personalizedContent: "version 2",
        factsHash: "fh-new",
        source: "proposal",
      }),
    );

    const result = svc.getActiveCopy("owner1", "bio", "en");
    expect(result!.personalizedContent).toBe("version 2");
    expect(result!.factsHash).toBe("fh-new");
    expect(result!.source).toBe("proposal");

    // Verify only one row exists
    const count = testSqlite
      .prepare("SELECT COUNT(*) as cnt FROM section_copy_state")
      .get() as { cnt: number };
    expect(count.cnt).toBe(1);
  });
});

describe("getAllActiveCopies", () => {
  it("returns multiple entries for the same owner and language", () => {
    svc.upsertState(makeInput({ sectionType: "bio" }));
    svc.upsertState(makeInput({ sectionType: "hero", personalizedContent: "Tagline here" }));
    svc.upsertState(makeInput({ sectionType: "skills", personalizedContent: "Expert coder" }));

    const copies = svc.getAllActiveCopies("owner1", "en");
    expect(copies).toHaveLength(3);

    const types = copies.map((c) => c.sectionType).sort();
    expect(types).toEqual(["bio", "hero", "skills"]);
  });

  it("returns empty array when no copies exist", () => {
    const copies = svc.getAllActiveCopies("nonexistent", "en");
    expect(copies).toEqual([]);
  });

  it("filters by language", () => {
    svc.upsertState(makeInput({ language: "en" }));
    svc.upsertState(makeInput({ language: "it", personalizedContent: "Uno sviluppatore creativo." }));

    const en = svc.getAllActiveCopies("owner1", "en");
    const it = svc.getAllActiveCopies("owner1", "it");
    expect(en).toHaveLength(1);
    expect(it).toHaveLength(1);
    expect(en[0].personalizedContent).not.toBe(it[0].personalizedContent);
  });
});

describe("getAllActiveCopies with readKeys", () => {
  it("returns copies from readKeys sessions", () => {
    const oldSessionId = "old-session-123";
    const newProfileId = "profile-456";

    svc.upsertState(makeInput({
      ownerKey: oldSessionId,
      sectionType: "bio",
      language: "it",
      personalizedContent: JSON.stringify({ headline: "Custom bio" }),
      factsHash: "hash-a",
      soulHash: "hash-b",
      source: "agent",
    }));

    // Without readKeys: only finds under primary ownerKey
    const withoutReadKeys = svc.getAllActiveCopies(newProfileId, "it");
    expect(withoutReadKeys).toHaveLength(0);

    // With readKeys including old session: finds the curation
    const withReadKeys = svc.getAllActiveCopies(newProfileId, "it", [oldSessionId]);
    expect(withReadKeys).toHaveLength(1);
    expect(withReadKeys[0].ownerKey).toBe(oldSessionId);
    expect(withReadKeys[0].sectionType).toBe("bio");
  });

  it("empty readKeys array behaves like omitting readKeys", () => {
    svc.upsertState(makeInput({
      ownerKey: "other-session",
      language: "en",
      personalizedContent: "{}",
      source: "agent",
    }));
    const result = svc.getAllActiveCopies("primary", "en", []);
    expect(result).toHaveLength(0);
  });

  it("deduplicates ownerKey appearing in readKeys", () => {
    svc.upsertState(makeInput({
      ownerKey: "primary",
      language: "en",
      personalizedContent: "{}",
      source: "agent",
    }));
    // readKeys includes ownerKey itself — should not duplicate results
    const result = svc.getAllActiveCopies("primary", "en", ["primary", "other"]);
    expect(result).toHaveLength(1);
  });

  it("primary ownerKey copy wins over readKeys copy for same sectionType", () => {
    // Old session has bio curation
    svc.upsertState(makeInput({
      ownerKey: "old-session",
      language: "en",
      personalizedContent: JSON.stringify({ headline: "Old" }),
      factsHash: "h1",
      soulHash: "s1",
      source: "agent",
    }));
    // New profile also has bio curation
    svc.upsertState(makeInput({
      ownerKey: "new-profile",
      language: "en",
      personalizedContent: JSON.stringify({ headline: "New" }),
      factsHash: "h2",
      soulHash: "s2",
      source: "agent",
    }));
    const result = svc.getAllActiveCopies("new-profile", "en", ["old-session"]);
    // Both returned, but primary should come last so Map() in mergeActiveSectionCopy keeps it
    const bioRows = result.filter(r => r.sectionType === "bio");
    expect(bioRows).toHaveLength(2);
    expect(bioRows[bioRows.length - 1].ownerKey).toBe("new-profile");
  });
});

describe("getActiveCopyWithHashGuard", () => {
  it("returns copy when hashes match", () => {
    svc.upsertState(makeInput());
    const result = svc.getActiveCopyWithHashGuard(
      "owner1", "bio", "en", "fh-abc", "sh-def",
    );
    expect(result).not.toBeNull();
    expect(result!.personalizedContent).toBe(
      "A creative developer who loves open source.",
    );
  });

  it("returns null when facts hash does not match (stale)", () => {
    svc.upsertState(makeInput());
    const result = svc.getActiveCopyWithHashGuard(
      "owner1", "bio", "en", "fh-DIFFERENT", "sh-def",
    );
    expect(result).toBeNull();
  });

  it("returns null when soul hash does not match (stale)", () => {
    svc.upsertState(makeInput());
    const result = svc.getActiveCopyWithHashGuard(
      "owner1", "bio", "en", "fh-abc", "sh-DIFFERENT",
    );
    expect(result).toBeNull();
  });

  it("returns null when no state exists", () => {
    const result = svc.getActiveCopyWithHashGuard(
      "nonexistent", "bio", "en", "fh1", "sh1",
    );
    expect(result).toBeNull();
  });
});
