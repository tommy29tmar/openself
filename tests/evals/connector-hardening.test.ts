import { describe, it, expect } from "vitest";
import { validateFactValue, FactValidationError } from "@/lib/services/fact-validation";

describe("private-contact validation", () => {
  it("accepts valid email in private-contact", () => {
    expect(() =>
      validateFactValue("private-contact", "li-email-0", { email: "user@example.com", type: "email" })
    ).not.toThrow();
  });

  it("rejects invalid email in private-contact", () => {
    expect(() =>
      validateFactValue("private-contact", "li-email-0", { email: "not-an-email", type: "email" })
    ).toThrow(FactValidationError);
  });

  it("accepts phone in private-contact", () => {
    expect(() =>
      validateFactValue("private-contact", "li-phone-0", { phone: "+1234567890", type: "phone" })
    ).not.toThrow();
  });

  it("rejects private-contact without required field", () => {
    expect(() =>
      validateFactValue("private-contact", "li-empty", { type: "email" })
    ).toThrow(FactValidationError);
  });

  it("private-contact validates email even without type field", () => {
    // This is the key difference: private-contact always checks emailFields
    expect(() =>
      validateFactValue("private-contact", "li-email-0", { email: "not-valid" })
    ).toThrow(FactValidationError);
  });

  it("private-contact passes email validation without type field when email is valid", () => {
    expect(() =>
      validateFactValue("private-contact", "li-email-0", { email: "valid@example.com" })
    ).not.toThrow();
  });

  // Backward compatibility with regular contact
  it("contact with type=email still validates email field", () => {
    expect(() =>
      validateFactValue("contact", "email-1", { email: "bad", type: "email", value: "bad" })
    ).toThrow(FactValidationError);
  });

  it("contact with type=phone skips email validation", () => {
    expect(() =>
      validateFactValue("contact", "phone-1", { phone: "+1234", type: "phone", value: "+1234" })
    ).not.toThrow();
  });
});
