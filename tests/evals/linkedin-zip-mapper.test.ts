import { describe, it, expect } from "vitest";
import {
  mapProfile,
  mapProfileSummary,
  mapPositions,
  mapEducation,
  mapSkills,
  mapLanguages,
  mapCertifications,
  mapEmailAddresses,
  mapPhoneNumbers,
} from "@/lib/connectors/linkedin-zip/mapper";

describe("mapProfile", () => {
  it("maps name, headline, location, websites, twitter", () => {
    const rows = [
      {
        "First Name": "Alice",
        "Last Name": "Smith",
        Headline: "Software Engineer at Acme",
        "Geo Location": "San Francisco, CA",
        Websites: "https://alice.dev",
        "Twitter Handles": "@alicedev",
      },
    ];
    const facts = mapProfile(rows);

    expect(facts).toContainEqual({
      category: "identity",
      key: "li-name",
      value: { name: "Alice Smith" },
    });
    expect(facts).toContainEqual({
      category: "identity",
      key: "li-headline",
      value: { role: "Software Engineer at Acme" },
    });
    expect(facts).toContainEqual({
      category: "identity",
      key: "li-location",
      value: { city: "San Francisco, CA" },
    });
    expect(facts).toContainEqual({
      category: "social",
      key: "li-website-0",
      value: { url: "https://alice.dev" },
    });
    expect(facts).toContainEqual({
      category: "social",
      key: "li-twitter",
      value: { platform: "twitter", username: "alicedev" },
    });
  });

  it("returns no facts for empty row", () => {
    expect(mapProfile([])).toEqual([]);
  });

  it("prepends https:// to website without scheme", () => {
    const rows = [{ Websites: "alice.dev" }];
    const facts = mapProfile(rows);
    const website = facts.find((f) => f.key === "li-website-0");
    expect(website?.value.url).toBe("https://alice.dev");
  });

  it("strips @ from twitter handle", () => {
    const rows = [{ "Twitter Handles": "@alicedev" }];
    const facts = mapProfile(rows);
    const twitter = facts.find((f) => f.key === "li-twitter");
    expect(twitter?.value.username).toBe("alicedev");
  });

  it("uses Location fallback when Geo Location is missing", () => {
    const rows = [{ Location: "Berlin, Germany" }];
    const facts = mapProfile(rows);
    const loc = facts.find((f) => f.key === "li-location");
    expect(loc?.value.city).toBe("Berlin, Germany");
  });

  it("maps multiple comma-separated websites", () => {
    const rows = [{ Websites: "https://one.com, https://two.com" }];
    const facts = mapProfile(rows);
    expect(facts).toContainEqual({
      category: "social",
      key: "li-website-0",
      value: { url: "https://one.com" },
    });
    expect(facts).toContainEqual({
      category: "social",
      key: "li-website-1",
      value: { url: "https://two.com" },
    });
  });
});

describe("mapProfileSummary", () => {
  it("maps summary text", () => {
    const rows = [{ Summary: "I am an experienced developer." }];
    const facts = mapProfileSummary(rows);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toEqual({
      category: "identity",
      key: "li-summary",
      value: { text: "I am an experienced developer." },
    });
  });

  it("returns no facts for empty summary", () => {
    expect(mapProfileSummary([{ Summary: "   " }])).toEqual([]);
  });

  it("returns no facts for empty rows", () => {
    expect(mapProfileSummary([])).toEqual([]);
  });

  it("uses About column as fallback", () => {
    const rows = [{ About: "My about text." }];
    const facts = mapProfileSummary(rows);
    expect(facts).toHaveLength(1);
    expect(facts[0].value.text).toBe("My about text.");
  });
});

describe("mapPositions", () => {
  const positions = [
    {
      "Company Name": "Acme Corp",
      Title: "Senior Dev",
      "Started On": "Jan 2022",
      "Finished On": "",
      Description: "Led team",
      Location: "NYC",
    },
    {
      "Company Name": "StartupX",
      Title: "Junior Dev",
      "Started On": "Mar 2019",
      "Finished On": "Dec 2021",
      Description: "",
      Location: "",
    },
  ];

  it("maps multiple positions with correct dates in descending order", () => {
    const facts = mapPositions(positions);
    expect(facts).toHaveLength(2);

    // Sorted by start date descending, Acme Corp first (most recent)
    expect(facts[0].value.company).toBe("Acme Corp");
    expect(facts[1].value.company).toBe("StartupX");

    const startupFact = facts.find((f) => f.value.company === "StartupX");
    expect(startupFact?.value.role).toBe("Junior Dev");
    expect(startupFact?.value.startDate).toBe("2019-03");
    expect(startupFact?.value.endDate).toBe("2021-12");

    const acmeFact = facts.find((f) => f.value.company === "Acme Corp");
    expect(acmeFact?.value.role).toBe("Senior Dev");
    expect(acmeFact?.value.startDate).toBe("2022-01");
    expect(acmeFact?.value.description).toBe("Led team");
    expect(acmeFact?.value.location).toBe("NYC");
  });

  it("returns no facts for empty input", () => {
    expect(mapPositions([])).toEqual([]);
  });

  it("marks the latest open position as current", () => {
    const facts = mapPositions(positions);
    const acmeFact = facts.find((f) => f.value.company === "Acme Corp");
    const startupFact = facts.find((f) => f.value.company === "StartupX");
    expect(acmeFact?.value.status).toBe("current");
    expect(startupFact?.value.status).toBe("past");
  });

  it("marks all as past when all positions are closed", () => {
    const closedPositions = [
      {
        "Company Name": "A",
        Title: "Dev",
        "Started On": "Jan 2018",
        "Finished On": "Dec 2019",
        Description: "",
        Location: "",
      },
      {
        "Company Name": "B",
        Title: "Lead",
        "Started On": "Jan 2020",
        "Finished On": "Dec 2022",
        Description: "",
        Location: "",
      },
    ];
    const facts = mapPositions(closedPositions);
    expect(facts.every((f) => f.value.status === "past")).toBe(true);
  });

  it("generates unique keys for different companies in different years", () => {
    const facts = mapPositions(positions);
    const keys = facts.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    // StartupX 2019, Acme Corp 2022
    expect(keys).toContain("li-startupx-2019");
    expect(keys).toContain("li-acme-corp-2022");
  });

  it("handles key collision (same company, same year) with index suffix", () => {
    const sameCompanyPositions = [
      {
        "Company Name": "Acme Corp",
        Title: "Developer",
        "Started On": "Jan 2020",
        "Finished On": "Dec 2020",
        Description: "",
        Location: "",
      },
      {
        "Company Name": "Acme Corp",
        Title: "Senior Dev",
        "Started On": "Mar 2020",
        "Finished On": "Dec 2021",
        Description: "",
        Location: "",
      },
    ];
    const facts = mapPositions(sameCompanyPositions);
    const keys = facts.map((f) => f.key);
    expect(keys).toContain("li-acme-corp-2020");
    expect(keys).toContain("li-acme-corp-2020-1");
  });

  it("does not include optional fields when empty", () => {
    const facts = mapPositions(positions);
    const startupFact = facts.find((f) => f.value.company === "StartupX");
    expect(startupFact?.value).not.toHaveProperty("description");
    expect(startupFact?.value).not.toHaveProperty("location");
  });
});

describe("mapEducation", () => {
  it("maps institution, degree, field, dates", () => {
    const rows = [
      {
        "School Name": "MIT",
        "Degree Name": "BSc",
        "Fields of Study": "Computer Science",
        "Start Date": "2014",
        "End Date": "2018",
      },
    ];
    const facts = mapEducation(rows);
    expect(facts).toHaveLength(1);
    expect(facts[0].category).toBe("education");
    expect(facts[0].value).toEqual({
      institution: "MIT",
      degree: "BSc",
      field: "Computer Science",
      startDate: "2014",
      endDate: "2018",
    });
  });

  it("filters rows with no institution and no degree", () => {
    const rows = [
      { "School Name": "", "Degree Name": "", "Fields of Study": "" },
    ];
    expect(mapEducation(rows)).toEqual([]);
  });

  it("uses Notes as fallback for field", () => {
    const rows = [
      {
        "School Name": "Oxford",
        "Degree Name": "MA",
        Notes: "Philosophy",
      },
    ];
    const facts = mapEducation(rows);
    expect(facts[0].value.field).toBe("Philosophy");
  });
});

describe("mapSkills", () => {
  it("maps skill names with li- prefix slug", () => {
    const rows = [{ Name: "TypeScript" }, { Name: "Machine Learning" }];
    const facts = mapSkills(rows);
    expect(facts).toHaveLength(2);
    expect(facts[0]).toEqual({
      category: "skill",
      key: "li-typescript",
      value: { name: "TypeScript" },
    });
    expect(facts[1]).toEqual({
      category: "skill",
      key: "li-machine-learning",
      value: { name: "Machine Learning" },
    });
  });

  it("skips empty skill names", () => {
    const rows = [{ Name: "" }, { Name: "Python" }, { Name: "  " }];
    const facts = mapSkills(rows);
    expect(facts).toHaveLength(1);
    expect(facts[0].value.name).toBe("Python");
  });

  it("uses Skill column as fallback", () => {
    const rows = [{ Skill: "React" }];
    const facts = mapSkills(rows);
    expect(facts[0].value.name).toBe("React");
  });

  it("filters out skills starting with 'Lingua '", () => {
    const rows = [
      { Name: "Python" },
      { Name: "Lingua inglese" },
      { Name: "Lingua tedesca" },
      { Name: "Data Analysis" },
    ];
    const facts = mapSkills(rows);
    expect(facts).toHaveLength(2);
    expect(facts.map((f) => f.value.name)).toEqual(["Python", "Data Analysis"]);
  });

  it("filters out well-known language names", () => {
    const rows = [
      { Name: "English" },
      { Name: "French" },
      { Name: "TypeScript" },
    ];
    const facts = mapSkills(rows);
    expect(facts).toHaveLength(1);
    expect(facts[0].value.name).toBe("TypeScript");
  });

  it("filters out language names from Languages.csv via languageNames param", () => {
    const rows = [
      { Name: "Lingua cinese mandarino" },
      { Name: "Tedesco" },
      { Name: "Forecasting" },
    ];
    const languageNames = new Set(["tedesco", "italiano"]);
    const facts = mapSkills(rows, languageNames);
    // "Lingua cinese mandarino" filtered by prefix, "Tedesco" by languageNames set
    expect(facts).toHaveLength(1);
    expect(facts[0].value.name).toBe("Forecasting");
  });
});

describe("mapLanguages", () => {
  it("maps with proficiency NATIVE_OR_BILINGUAL -> native", () => {
    const rows = [{ Name: "English", Proficiency: "NATIVE_OR_BILINGUAL" }];
    const facts = mapLanguages(rows);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toEqual({
      category: "language",
      key: "li-lang-english",
      value: { language: "English", proficiency: "native" },
    });
  });

  it("maps FULL_PROFESSIONAL -> fluent", () => {
    const rows = [{ Name: "French", Proficiency: "FULL_PROFESSIONAL" }];
    const facts = mapLanguages(rows);
    expect(facts[0].value.proficiency).toBe("fluent");
  });

  it("maps PROFESSIONAL_WORKING -> advanced", () => {
    const rows = [{ Name: "German", Proficiency: "PROFESSIONAL_WORKING" }];
    const facts = mapLanguages(rows);
    expect(facts[0].value.proficiency).toBe("advanced");
  });

  it("maps LIMITED_WORKING -> intermediate", () => {
    const rows = [{ Name: "Spanish", Proficiency: "LIMITED_WORKING" }];
    const facts = mapLanguages(rows);
    expect(facts[0].value.proficiency).toBe("intermediate");
  });

  it("maps ELEMENTARY -> beginner", () => {
    const rows = [{ Name: "Japanese", Proficiency: "ELEMENTARY" }];
    const facts = mapLanguages(rows);
    expect(facts[0].value.proficiency).toBe("beginner");
  });

  // Basic LinkedIn export descriptive strings
  it("maps 'Native or bilingual proficiency' -> native", () => {
    const rows = [{ Name: "Italiano", Proficiency: "Native or bilingual proficiency" }];
    const facts = mapLanguages(rows);
    expect(facts[0].value.proficiency).toBe("native");
  });

  it("maps 'Full professional proficiency' -> fluent", () => {
    const rows = [{ Name: "Tedesco", Proficiency: "Full professional proficiency" }];
    const facts = mapLanguages(rows);
    expect(facts[0].value.proficiency).toBe("fluent");
  });

  it("maps 'Limited working proficiency' -> intermediate", () => {
    const rows = [{ Name: "Francese", Proficiency: "Limited working proficiency" }];
    const facts = mapLanguages(rows);
    expect(facts[0].value.proficiency).toBe("intermediate");
  });

  it("maps 'Elementary proficiency' -> beginner", () => {
    const rows = [{ Name: "Chinese", Proficiency: "Elementary proficiency" }];
    const facts = mapLanguages(rows);
    expect(facts[0].value.proficiency).toBe("beginner");
  });

  it("passes through unknown proficiency as lowercase", () => {
    const rows = [{ Name: "Italian", Proficiency: "Conversational" }];
    const facts = mapLanguages(rows);
    expect(facts[0].value.proficiency).toBe("conversational");
  });

  it("omits proficiency when empty", () => {
    const rows = [{ Name: "Portuguese", Proficiency: "" }];
    const facts = mapLanguages(rows);
    expect(facts[0].value).not.toHaveProperty("proficiency");
  });

  it("uses Language column as fallback", () => {
    const rows = [{ Language: "Chinese" }];
    const facts = mapLanguages(rows);
    expect(facts[0].value.language).toBe("Chinese");
  });
});

describe("mapCertifications", () => {
  it("maps title, authority, dates, url", () => {
    const rows = [
      {
        Name: "AWS Solutions Architect",
        Authority: "Amazon",
        "Started On": "Jun 2023",
        "Finished On": "Jun 2026",
        Url: "https://cert.example.com/aws",
      },
    ];
    const facts = mapCertifications(rows);
    expect(facts).toHaveLength(1);
    expect(facts[0].category).toBe("achievement");
    expect(facts[0].value).toEqual({
      title: "AWS Solutions Architect",
      type: "certification",
      issuer: "Amazon",
      date: "2023-06",
      expiryDate: "2026-06",
      url: "https://cert.example.com/aws",
    });
  });

  it("skips empty certification names", () => {
    const rows = [{ Name: "", Authority: "Some Org" }];
    expect(mapCertifications(rows)).toEqual([]);
  });

  it("uses URL column as fallback for Url", () => {
    const rows = [{ Name: "PMP", URL: "https://pmi.org/cert" }];
    const facts = mapCertifications(rows);
    expect(facts[0].value.url).toBe("https://pmi.org/cert");
  });
});

describe("mapEmailAddresses", () => {
  it("maps to private-contact with type email", () => {
    const rows = [
      { "Email Address": "alice@example.com" },
      { "Email Address": "alice@work.com" },
    ];
    const facts = mapEmailAddresses(rows);
    expect(facts).toHaveLength(2);
    expect(facts[0]).toEqual({
      category: "private-contact",
      key: "li-email-0",
      value: { email: "alice@example.com", type: "email" },
    });
    expect(facts[1]).toEqual({
      category: "private-contact",
      key: "li-email-1",
      value: { email: "alice@work.com", type: "email" },
    });
  });

  it("skips empty emails", () => {
    const rows = [{ "Email Address": "" }];
    expect(mapEmailAddresses(rows)).toEqual([]);
  });
});

describe("mapPhoneNumbers", () => {
  it("maps to private-contact with type phone", () => {
    const rows = [{ Number: "+1-555-0100" }];
    const facts = mapPhoneNumbers(rows);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toEqual({
      category: "private-contact",
      key: "li-phone-0",
      value: { phone: "+1-555-0100", type: "phone" },
    });
  });

  it("uses Phone column as fallback", () => {
    const rows = [{ Phone: "+44-20-7946-0958" }];
    const facts = mapPhoneNumbers(rows);
    expect(facts[0].value.phone).toBe("+44-20-7946-0958");
  });

  it("skips empty phone numbers", () => {
    const rows = [{ Number: "" }];
    expect(mapPhoneNumbers(rows)).toEqual([]);
  });
});
