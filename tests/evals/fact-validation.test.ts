import { describe, it, expect } from "vitest";
import {
  validateFactValue,
  isValidFactValue,
  FactValidationError,
} from "@/lib/services/fact-validation";

describe("fact-validation", () => {
  describe("validateFactValue — rejects invalid values", () => {
    it("throws on empty object", () => {
      expect(() => validateFactValue("identity", "name", {})).toThrow(
        FactValidationError,
      );
    });

    it("throws on null/undefined fields only", () => {
      expect(() =>
        validateFactValue("identity", "name", { full: null } as any),
      ).toThrow(FactValidationError);
    });

    it("throws on non-object value", () => {
      expect(() =>
        validateFactValue("identity", "name", "string" as any),
      ).toThrow(FactValidationError);
    });

    it("throws on array value", () => {
      expect(() =>
        validateFactValue("identity", "name", ["a"] as any),
      ).toThrow(FactValidationError);
    });
  });

  describe("placeholder detection", () => {
    const placeholders = ["N/A", "n/a", "none", "null", "undefined", "unknown", "TBD", "todo", "placeholder", "xxx", "???", "--", "—", "...", "test", "default", "anonymous"];

    for (const placeholder of placeholders) {
      it(`rejects placeholder "${placeholder}" in primary field`, () => {
        expect(() =>
          validateFactValue("identity", "name", { full: placeholder }),
        ).toThrow(FactValidationError);
      });
    }

    it("rejects empty string", () => {
      expect(() =>
        validateFactValue("identity", "name", { full: "" }),
      ).toThrow(FactValidationError);
    });

    it("rejects whitespace-only string", () => {
      expect(() =>
        validateFactValue("identity", "name", { full: "   " }),
      ).toThrow(FactValidationError);
    });
  });

  describe("per-category required fields", () => {
    it("identity: requires at least name/full/value", () => {
      // Missing all required
      expect(() =>
        validateFactValue("identity", "name", { random: "x" }),
      ).toThrow("identity fact requires at least one of");

      // Valid
      expect(() =>
        validateFactValue("identity", "name", { full: "Alice Smith" }),
      ).not.toThrow();
    });

    it("experience: requires role/title/company/organization", () => {
      expect(() =>
        validateFactValue("experience", "acme", { start: "2020" }),
      ).toThrow("experience fact requires at least one of");

      expect(() =>
        validateFactValue("experience", "acme", { role: "Engineer" }),
      ).not.toThrow();

      expect(() =>
        validateFactValue("experience", "acme", { company: "Acme Corp" }),
      ).not.toThrow();
    });

    it("education: requires institution/school/name/degree", () => {
      expect(() =>
        validateFactValue("education", "mit", { field: "CS" }),
      ).toThrow("education fact requires at least one of");

      expect(() =>
        validateFactValue("education", "mit", { institution: "MIT" }),
      ).not.toThrow();
    });

    it("skill: requires name/value", () => {
      expect(() =>
        validateFactValue("skill", "ts", { level: "advanced" }),
      ).toThrow("skill fact requires at least one of");

      expect(() =>
        validateFactValue("skill", "ts", { name: "TypeScript" }),
      ).not.toThrow();
    });

    it("project: requires title/name", () => {
      expect(() =>
        validateFactValue("project", "app", { description: "A cool app" }),
      ).toThrow("project fact requires at least one of");

      expect(() =>
        validateFactValue("project", "app", { title: "My App" }),
      ).not.toThrow();
    });

    it("interest: requires name/value", () => {
      expect(() =>
        validateFactValue("interest", "music", { detail: "classical" }),
      ).toThrow("interest fact requires at least one of");

      expect(() =>
        validateFactValue("interest", "music", { name: "Music" }),
      ).not.toThrow();
    });

    it("stat: requires label", () => {
      expect(() =>
        validateFactValue("stat", "years", { value: "10+" }),
      ).toThrow("stat fact requires at least one of");

      expect(() =>
        validateFactValue("stat", "years", { label: "Years Experience", value: "10+" }),
      ).not.toThrow();
    });

    it("social: requires url/value/username", () => {
      expect(() =>
        validateFactValue("social", "github", { platform: "GitHub" }),
      ).toThrow("social fact requires at least one of");

      expect(() =>
        validateFactValue("social", "github", {
          platform: "GitHub",
          url: "https://github.com/alice",
        }),
      ).not.toThrow();
    });

    it("language: requires language/name", () => {
      expect(() =>
        validateFactValue("language", "spanish", { proficiency: "fluent" }),
      ).toThrow("language fact requires at least one of");

      expect(() =>
        validateFactValue("language", "spanish", { language: "Spanish" }),
      ).not.toThrow();
    });

    it("contact: requires value/email/phone/address", () => {
      expect(() =>
        validateFactValue("contact", "email", { type: "email" }),
      ).toThrow("contact fact requires at least one of");

      expect(() =>
        validateFactValue("contact", "email", {
          type: "email",
          value: "alice@example.com",
        }),
      ).not.toThrow();
    });

    it("activity: requires name/value", () => {
      expect(() =>
        validateFactValue("activity", "tennis", { frequency: "weekly" }),
      ).toThrow("activity fact requires at least one of");

      expect(() =>
        validateFactValue("activity", "tennis", { name: "Tennis" }),
      ).not.toThrow();
    });

    it("achievement: requires title/name", () => {
      expect(() =>
        validateFactValue("achievement", "award", { issuer: "IEEE" }),
      ).toThrow("achievement fact requires at least one of");

      expect(() =>
        validateFactValue("achievement", "award", { title: "Best Paper" }),
      ).not.toThrow();
    });

    it("reading: requires title/name", () => {
      expect(() =>
        validateFactValue("reading", "book", { author: "Martin" }),
      ).toThrow("reading fact requires at least one of");

      expect(() =>
        validateFactValue("reading", "book", { title: "Clean Code" }),
      ).not.toThrow();
    });

    it("music: requires title/name", () => {
      expect(() =>
        validateFactValue("music", "song", { artist: "Queen" }),
      ).toThrow("music fact requires at least one of");

      expect(() =>
        validateFactValue("music", "song", { title: "Bohemian Rhapsody" }),
      ).not.toThrow();
    });
  });

  describe("URL validation", () => {
    it("rejects invalid URL in project.url", () => {
      expect(() =>
        validateFactValue("project", "app", {
          title: "My App",
          url: "not-a-url",
        }),
      ).toThrow('must be a valid URL');
    });

    it("accepts valid URL in project.url", () => {
      expect(() =>
        validateFactValue("project", "app", {
          title: "My App",
          url: "https://example.com",
        }),
      ).not.toThrow();
    });

    it("rejects invalid URL in social.url", () => {
      expect(() =>
        validateFactValue("social", "github", {
          platform: "GitHub",
          url: "github.com/alice",
        }),
      ).toThrow('must be a valid URL');
    });

    it("accepts valid URL in social.url", () => {
      expect(() =>
        validateFactValue("social", "github", {
          platform: "GitHub",
          url: "https://github.com/alice",
        }),
      ).not.toThrow();
    });

    it("allows empty/missing URL field", () => {
      expect(() =>
        validateFactValue("project", "app", { title: "My App" }),
      ).not.toThrow();
    });
  });

  describe("email validation", () => {
    it("rejects invalid email in contact with type=email", () => {
      expect(() =>
        validateFactValue("contact", "email", {
          type: "email",
          value: "not-an-email",
        }),
      ).toThrow('must be a valid email');
    });

    it("accepts valid email in contact with type=email", () => {
      expect(() =>
        validateFactValue("contact", "email", {
          type: "email",
          value: "alice@example.com",
        }),
      ).not.toThrow();
    });

    it("does not validate email for contact type=phone", () => {
      expect(() =>
        validateFactValue("contact", "phone", {
          type: "phone",
          value: "+1234567890",
        }),
      ).not.toThrow();
    });
  });

  describe("unknown categories — generic fallback", () => {
    it("accepts unknown category with valid fields", () => {
      expect(() =>
        validateFactValue("custom-thing", "x", { foo: "bar" }),
      ).not.toThrow();
    });

    it("rejects unknown category with placeholder values in primary fields", () => {
      expect(() =>
        validateFactValue("custom-thing", "x", { name: "N/A" }),
      ).toThrow("placeholder");
    });

    it("allows non-primary fields with any value", () => {
      expect(() =>
        validateFactValue("custom-thing", "x", { foo: "bar", status: "N/A" }),
      ).not.toThrow();
    });
  });

  describe("numeric and boolean values accepted", () => {
    it("accepts numeric required field", () => {
      // stat.label is required — but a numeric value elsewhere should be fine
      expect(() =>
        validateFactValue("stat", "exp", { label: "Years", value: "10" }),
      ).not.toThrow();
    });

    it("accepts boolean values", () => {
      expect(() =>
        validateFactValue("experience", "acme", {
          role: "Engineer",
          current: true,
        }),
      ).not.toThrow();
    });
  });

  describe("isValidFactValue — boolean helper", () => {
    it("returns valid: true for good values", () => {
      const result = isValidFactValue("identity", "name", {
        full: "Alice",
      });
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("returns valid: false with error message for bad values", () => {
      const result = isValidFactValue("identity", "name", {});
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("date placeholder detection (Bug #2)", () => {
    it("rejects YYYY-YYYY in period", () => {
      expect(() =>
        validateFactValue("experience", "acme", { role: "Engineer", period: "YYYY-YYYY" }),
      ).toThrow(FactValidationError);
    });

    it("rejects YYYY-MM in start field", () => {
      expect(() =>
        validateFactValue("experience", "acme", { role: "Engineer", start: "YYYY-MM" }),
      ).toThrow(FactValidationError);
    });

    it("rejects YYYY in start field", () => {
      expect(() =>
        validateFactValue("experience", "acme", { role: "Engineer", start: "YYYY" }),
      ).toThrow(FactValidationError);
    });

    it("rejects YYYY-MM-DD in end field", () => {
      expect(() =>
        validateFactValue("experience", "acme", { role: "Engineer", end: "YYYY-MM-DD" }),
      ).toThrow(FactValidationError);
    });

    it("rejects XX-XX in period", () => {
      expect(() =>
        validateFactValue("education", "mit", { institution: "MIT", period: "XX-XX" }),
      ).toThrow(FactValidationError);
    });

    it("accepts real dates in period", () => {
      expect(() =>
        validateFactValue("experience", "acme", { role: "Engineer", period: "2018-2022" }),
      ).not.toThrow();
    });

    it("accepts real dates in start/end", () => {
      expect(() =>
        validateFactValue("experience", "acme", { role: "Engineer", start: "2020-03", end: "2023-06" }),
      ).not.toThrow();
    });

    it("accepts year-only in start", () => {
      expect(() =>
        validateFactValue("experience", "acme", { role: "Engineer", start: "2020" }),
      ).not.toThrow();
    });
  });

  describe("identity name length validation (Bug #1)", () => {
    it("rejects name with > 5 words in full field", () => {
      expect(() =>
        validateFactValue("identity", "name", { full: "Marco Rossi è un designer di talento straordinario" }),
      ).toThrow(FactValidationError);
    });

    it("rejects name with > 80 chars in full field", () => {
      expect(() =>
        validateFactValue("identity", "name", { full: "A".repeat(81) }),
      ).toThrow(FactValidationError);
    });

    it("accepts normal name in full field", () => {
      expect(() =>
        validateFactValue("identity", "name", { full: "Marco Rossi" }),
      ).not.toThrow();
    });

    it("accepts up to 5 words in full field", () => {
      expect(() =>
        validateFactValue("identity", "name", { full: "Maria de la Cruz Hernandez" }),
      ).not.toThrow();
    });

    it("validates full_name on any identity key", () => {
      expect(() =>
        validateFactValue("identity", "location", { full_name: "This is way too long for a name field" }),
      ).toThrow(FactValidationError);
    });

    it("validates name field only when key is 'name'", () => {
      // key='name' → name field is checked
      expect(() =>
        validateFactValue("identity", "name", { name: "This is way too long for a name field" }),
      ).toThrow(FactValidationError);
    });

    it("does NOT validate name field when key is 'role'", () => {
      // key='role' → name field is NOT checked (it could hold role text)
      expect(() =>
        validateFactValue("identity", "role", { name: "Senior Software Engineer at Large Corporation" }),
      ).not.toThrow();
    });

    it("does NOT validate value field when key is 'tagline'", () => {
      expect(() =>
        validateFactValue("identity", "tagline", { value: "I am a passionate designer specializing in user experience and interaction" }),
      ).not.toThrow();
    });
  });

  describe("BUG-4: email validation for contact facts", () => {
    it("rejects malformed email like 'boh@' for contact with type=email", () => {
      expect(() =>
        validateFactValue("contact", "email-1", { type: "email", value: "boh@" }),
      ).toThrow(FactValidationError);
    });

    it("rejects email without domain for contact with type=email", () => {
      expect(() =>
        validateFactValue("contact", "email-1", { type: "email", value: "user@" }),
      ).toThrow(FactValidationError);
    });

    it("accepts valid email for contact with type=email", () => {
      expect(() =>
        validateFactValue("contact", "email-1", { type: "email", value: "marco@design.it" }),
      ).not.toThrow();
    });

    it("does not validate email format for contact with type=phone", () => {
      expect(() =>
        validateFactValue("contact", "phone-1", { type: "phone", value: "+39123456789" }),
      ).not.toThrow();
    });
  });

  describe("FactValidationError properties", () => {
    it("has correct code, category, and key", () => {
      try {
        validateFactValue("identity", "name", {});
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(FactValidationError);
        const e = err as FactValidationError;
        expect(e.code).toBe("FACT_VALIDATION_FAILED");
        expect(e.category).toBe("identity");
        expect(e.key).toBe("name");
      }
    });
  });
});
