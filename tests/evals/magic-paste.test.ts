import { describe, it, expect } from "vitest";
import { detectConnectorUrls } from "@/lib/connectors/magic-paste";

describe("detectConnectorUrls", () => {
  it("detects GitHub profile URL", () => {
    const result = detectConnectorUrls("Check out my work at https://github.com/elena");
    expect(result).toEqual([{ connectorId: "github", url: "https://github.com/elena" }]);
  });

  it("detects LinkedIn profile URL", () => {
    const result = detectConnectorUrls("Here is my profile: https://linkedin.com/in/elena-vasquez");
    expect(result).toEqual([{ connectorId: "linkedin_zip", url: "https://linkedin.com/in/elena-vasquez" }]);
  });

  it("returns empty for non-connector URLs", () => {
    expect(detectConnectorUrls("Check https://figma.com")).toEqual([]);
  });

  it("returns empty for no URLs", () => {
    expect(detectConnectorUrls("I work at Figma")).toEqual([]);
  });
});
