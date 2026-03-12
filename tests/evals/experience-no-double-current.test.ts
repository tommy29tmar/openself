import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { Experience } from "@/themes/editorial-360/components/Experience";

const withPeriodAndCurrent = {
  items: [
    { title: "fotografo", company: "Condé Nast", period: "gennaio 2026 – Attuale", current: true },
  ],
  title: "Esperienza",
  currentLabel: "Attuale",
};

const currentNoPeriod = {
  items: [
    { title: "Designer", company: "Acme", current: true },
  ],
  title: "Experience",
  currentLabel: "Current",
};

const spanishSubstringTrap = {
  items: [
    { title: "Diseñador", company: "Acme", period: "Enero 2026 – Actualizado", current: true },
  ],
  title: "Experiencia",
  currentLabel: "Actual",
};

describe("Experience — current label deduplication", () => {
  it("should render 'Attuale' exactly once when period already contains it (default)", () => {
    const html = renderToStaticMarkup(
      React.createElement(Experience, { content: withPeriodAndCurrent, variant: "default" }),
    );
    const matches = html.match(/Attuale/g) || [];
    expect(matches.length).toBe(1);
  });

  it("should render 'Attuale' exactly once when period already contains it (monolith)", () => {
    const html = renderToStaticMarkup(
      React.createElement(Experience, { content: withPeriodAndCurrent, variant: "monolith" }),
    );
    const matches = html.match(/Attuale/g) || [];
    expect(matches.length).toBe(1);
  });

  it("should render 'Current' badge when current:true but no period (default)", () => {
    const html = renderToStaticMarkup(
      React.createElement(Experience, { content: currentNoPeriod, variant: "default" }),
    );
    expect(html).toContain("Current");
  });

  it("should render 'Current' badge when current:true but no period (monolith)", () => {
    const html = renderToStaticMarkup(
      React.createElement(Experience, { content: currentNoPeriod, variant: "monolith" }),
    );
    expect(html).toContain("Current");
  });

  it("should NOT suppress badge when period contains label as substring but not at end (locale regression)", () => {
    const html = renderToStaticMarkup(
      React.createElement(Experience, { content: spanishSubstringTrap, variant: "default" }),
    );
    // "Actualizado" contains "Actual" as prefix substring, but period does NOT end with "Actual"
    // Badge should still render because endsWith("Actual") is false
    // With includes() this would be a false positive (badge suppressed incorrectly)
    expect(html).toContain("Actual");
    const matches = html.match(/Actual/g) || [];
    // "Actualizado" contributes 1 match, badge "Actual" contributes 1 match = 2 total
    expect(matches.length).toBe(2);
  });
});
