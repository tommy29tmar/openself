# Design DNA Full Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the legacy theme system (minimal/warm/editorial-360) with the new Presence System (Surface × Voice × Light), implement the Monolith DNA layout, redesign the Builder UX, and create a generic Sources/Connectors layer — all in a single big-bang sprint.

**Architecture:** Registry-based Presence System (follows the same pattern as connector registry and layout registry already in codebase). Section components move from `src/themes/editorial-360/components/` to `src/components/sections/`. `PageRenderer` applies presence CSS classes directly on `.os-page` instead of delegating to a theme registry. `SettingsPanel` replaced by `PresencePanel`. `ConnectorSection` replaced by generic `SourcesPanel` + `ConnectorCard`.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS + CSS custom properties (`var(--page-*)`), Drizzle ORM, SQLite, Vercel AI SDK, `next/font`.

**Design doc:** `docs/plans/2026-03-03-design-dna-full-redesign.md`

---

## Task 1: Presence Registry

**Files:**
- Create: `src/lib/presence/registry.ts`
- Create: `src/lib/presence/surfaces.ts`
- Create: `src/lib/presence/voices.ts`
- Create: `src/lib/presence/combos.ts`
- Create: `src/lib/presence/index.ts`
- Create: `tests/evals/presence-registry.test.ts`

**Step 1: Write failing tests**

```ts
// tests/evals/presence-registry.test.ts
import { describe, it, expect } from "vitest";
import {
  registerSurface, getSurface, listSurfaces,
  registerVoice, getVoice, listVoices,
  isValidSurface, isValidVoice, isValidLight,
  SIGNATURE_COMBOS,
} from "@/lib/presence";

describe("Presence Registry", () => {
  it("lists all registered surfaces", () => {
    const surfaces = listSurfaces();
    expect(surfaces.map(s => s.id)).toEqual(["canvas", "clay", "archive"]);
  });

  it("gets a surface by id", () => {
    const canvas = getSurface("canvas");
    expect(canvas?.displayName).toBe("Canvas");
    expect(canvas?.cssClass).toBe("surface-canvas");
    expect(canvas?.readingMax).toBe(660);
  });

  it("validates surface ids", () => {
    expect(isValidSurface("canvas")).toBe(true);
    expect(isValidSurface("archive")).toBe(true);
    expect(isValidSurface("minimal")).toBe(false);
    expect(isValidSurface("")).toBe(false);
  });

  it("lists all registered voices", () => {
    const voices = listVoices();
    expect(voices.map(v => v.id)).toEqual(["signal", "narrative", "terminal"]);
  });

  it("validates voice ids", () => {
    expect(isValidVoice("signal")).toBe(true);
    expect(isValidVoice("narrative")).toBe(true);
    expect(isValidVoice("inter")).toBe(false);
  });

  it("validates light values", () => {
    expect(isValidLight("day")).toBe(true);
    expect(isValidLight("night")).toBe(true);
    expect(isValidLight("dark")).toBe(false);
    expect(isValidLight("light")).toBe(false);
  });

  it("exports 6 signature combinations", () => {
    expect(SIGNATURE_COMBOS).toHaveLength(6);
    SIGNATURE_COMBOS.forEach(combo => {
      expect(isValidSurface(combo.surface)).toBe(true);
      expect(isValidVoice(combo.voice)).toBe(true);
      expect(isValidLight(combo.light)).toBe(true);
      expect(combo.name).toBeTruthy();
    });
  });
});
```

**Step 2: Run to verify it fails**

```bash
npx vitest run tests/evals/presence-registry.test.ts
```
Expected: FAIL — module not found.

**Step 3: Implement**

```ts
// src/lib/presence/registry.ts
export type SurfaceDefinition = {
  id: string;
  displayName: string;
  description: string;
  cssClass: string;
  readingMax: number;
  sectionLabelOpacity: number;
};

export type VoiceDefinition = {
  id: string;
  displayName: string;
  headingFont: string;
  bodyFont: string;
  cssClass: string;
  description: string;
};

const surfaceRegistry = new Map<string, SurfaceDefinition>();
const voiceRegistry = new Map<string, VoiceDefinition>();

export function registerSurface(def: SurfaceDefinition): void {
  surfaceRegistry.set(def.id, def);
}
export function getSurface(id: string): SurfaceDefinition | undefined {
  return surfaceRegistry.get(id);
}
export function listSurfaces(): SurfaceDefinition[] {
  return [...surfaceRegistry.values()];
}
export function isValidSurface(id: string): boolean {
  return surfaceRegistry.has(id);
}

export function registerVoice(def: VoiceDefinition): void {
  voiceRegistry.set(def.id, def);
}
export function getVoice(id: string): VoiceDefinition | undefined {
  return voiceRegistry.get(id);
}
export function listVoices(): VoiceDefinition[] {
  return [...voiceRegistry.values()];
}
export function isValidVoice(id: string): boolean {
  return voiceRegistry.has(id);
}

export function isValidLight(value: string): boolean {
  return value === "day" || value === "night";
}
```

```ts
// src/lib/presence/surfaces.ts
import { registerSurface } from "./registry";

registerSurface({
  id: "canvas",
  displayName: "Canvas",
  description: "Swiss precision. The design disappears so the person stands alone.",
  cssClass: "surface-canvas",
  readingMax: 660,
  sectionLabelOpacity: 0.6,
});
registerSurface({
  id: "clay",
  displayName: "Clay",
  description: "Human and tactile. Monocle meets craft.",
  cssClass: "surface-clay",
  readingMax: 680,
  sectionLabelOpacity: 0.75,
});
registerSurface({
  id: "archive",
  displayName: "Archive",
  description: "Luxury digital magazine. Uncompromising typographic authority.",
  cssClass: "surface-archive",
  readingMax: 700,
  sectionLabelOpacity: 0.85,
});
```

```ts
// src/lib/presence/voices.ts
import { registerVoice } from "./registry";

registerVoice({
  id: "signal",
  displayName: "Signal",
  headingFont: "Plus Jakarta Sans",
  bodyFont: "Figtree",
  cssClass: "voice-signal",
  description: "Digital, contemporary, clean.",
});
registerVoice({
  id: "narrative",
  displayName: "Narrative",
  headingFont: "Cormorant Garamond",
  bodyFont: "Lato",
  cssClass: "voice-narrative",
  description: "Editorial, humanist, literary.",
});
registerVoice({
  id: "terminal",
  displayName: "Terminal",
  headingFont: "JetBrains Mono",
  bodyFont: "JetBrains Mono",
  cssClass: "voice-terminal",
  description: "Raw, transparent, a maker's badge.",
});
```

```ts
// src/lib/presence/combos.ts
export type SignatureCombo = {
  surface: string;
  voice: string;
  light: string;
  name: string;
  for: string;
};

export const SIGNATURE_COMBOS: SignatureCombo[] = [
  { surface: "canvas",  voice: "signal",    light: "day",   name: "Default Professional", for: "Most users. Maximum clarity." },
  { surface: "canvas",  voice: "terminal",  light: "night", name: "The Developer",        for: "Engineers, open-source contributors." },
  { surface: "clay",    voice: "narrative", light: "day",   name: "Artisan Editorial",    for: "Designers, writers, architects." },
  { surface: "clay",    voice: "signal",    light: "night", name: "Warm Modern",          for: "Startup designers, product managers." },
  { surface: "archive", voice: "narrative", light: "day",   name: "Luxury Magazine",      for: "The full OpenSelf statement." },
  { surface: "archive", voice: "narrative", light: "night", name: "Noir Editorial",       for: "Photographers, filmmakers, artists." },
];
```

```ts
// src/lib/presence/index.ts
import "./surfaces";
import "./voices";
export { registerSurface, getSurface, listSurfaces, isValidSurface } from "./registry";
export { registerVoice, getVoice, listVoices, isValidVoice } from "./registry";
export { isValidLight } from "./registry";
export type { SurfaceDefinition, VoiceDefinition } from "./registry";
export { SIGNATURE_COMBOS } from "./combos";
export type { SignatureCombo } from "./combos";
```

**Step 4: Run tests**

```bash
npx vitest run tests/evals/presence-registry.test.ts
```
Expected: PASS (6 tests).

**Step 5: Commit**

```bash
git add src/lib/presence/ tests/evals/presence-registry.test.ts
git commit -m "feat(presence): add registry — surfaces, voices, combos"
```

---

## Task 2: Presence Prompt Builder

**Files:**
- Create: `src/lib/presence/prompt-builder.ts`
- Create: `tests/evals/presence-prompt-builder.test.ts`

**Step 1: Write failing tests**

```ts
// tests/evals/presence-prompt-builder.test.ts
import { describe, it, expect } from "vitest";
import { buildPresenceReference } from "@/lib/presence/prompt-builder";

describe("buildPresenceReference", () => {
  it("includes all surfaces with descriptions", () => {
    const ref = buildPresenceReference();
    expect(ref).toContain("canvas");
    expect(ref).toContain("clay");
    expect(ref).toContain("archive");
    expect(ref).toContain("Swiss precision");
  });

  it("includes all voices", () => {
    const ref = buildPresenceReference();
    expect(ref).toContain("signal");
    expect(ref).toContain("narrative");
    expect(ref).toContain("terminal");
  });

  it("includes light options", () => {
    const ref = buildPresenceReference();
    expect(ref).toContain("day");
    expect(ref).toContain("night");
  });

  it("includes all 6 signature combinations", () => {
    const ref = buildPresenceReference();
    expect(ref).toContain("Default Professional");
    expect(ref).toContain("The Developer");
    expect(ref).toContain("Artisan Editorial");
    expect(ref).toContain("Warm Modern");
    expect(ref).toContain("Luxury Magazine");
    expect(ref).toContain("Noir Editorial");
  });

  it("does not mention legacy theme names", () => {
    const ref = buildPresenceReference();
    expect(ref).not.toContain("minimal");
    expect(ref).not.toContain("editorial-360");
    expect(ref).not.toContain("colorScheme");
    expect(ref).not.toContain("fontFamily");
  });
});
```

**Step 2: Run to verify failure**

```bash
npx vitest run tests/evals/presence-prompt-builder.test.ts
```

**Step 3: Implement**

```ts
// src/lib/presence/prompt-builder.ts
// Side-effect imports ensure surfaces/voices are registered before listSurfaces/listVoices is called
import "./surfaces";
import "./voices";
import { listSurfaces, listVoices } from "./registry";
import { SIGNATURE_COMBOS } from "./combos";

export function buildPresenceReference(): string {
  const surfaces = listSurfaces();
  const voices = listVoices();

  const surfaceLines = surfaces
    .map(s => `  - "${s.id}" (${s.displayName}): ${s.description}`)
    .join("\n");

  const voiceLines = voices
    .map(v => `  - "${v.id}" (${v.displayName}): ${v.headingFont} + ${v.bodyFont}. ${v.description}`)
    .join("\n");

  const comboLines = SIGNATURE_COMBOS
    .map(c => `  - ${c.name}: surface="${c.surface}" voice="${c.voice}" light="${c.light}" — ${c.for}`)
    .join("\n");

  return `PRESENCE SYSTEM
The page visual identity is set by three independent axes:
- surface: controls colors, texture, and reading lane width
${surfaceLines}
- voice: controls typography only (heading font + body font)
${voiceLines}
- light: "day" (default) or "night" (per-surface dark palette)

SIGNATURE COMBINATIONS (recommend these when user asks about style):
${comboLines}

Use update_page_style({ surface, voice, light }) to change any axis.
Never combine axes incorrectly — surface never sets fonts, voice never sets colors.`;
}
```

**Step 4: Run tests**

```bash
npx vitest run tests/evals/presence-prompt-builder.test.ts
```

**Step 5: Commit**

```bash
git add src/lib/presence/prompt-builder.ts tests/evals/presence-prompt-builder.test.ts
git commit -m "feat(presence): add buildPresenceReference() for agent prompts"
```

---

## Task 3: PageConfig Schema Update

**Files:**
- Modify: `src/lib/page-config/schema.ts`
- Modify: `tests/evals/page-config-schema.test.ts` (update existing tests)

**Step 1: Check existing tests**

```bash
npx vitest run tests/evals/page-config-schema.test.ts 2>&1 | head -30
```

**Step 1b: Check what test files exist**

Before running tests, verify what test files exist for schema and related services:

```bash
ls tests/evals/ | grep -E "schema|config|style|composer"
```

Use those filenames in subsequent `vitest run` commands. If none exist, run the full suite:

```bash
npx vitest run 2>&1 | grep -E "FAIL|ERROR" | head -40
```

**Step 2: Update schema**

In `src/lib/page-config/schema.ts`:

a) Remove the `StyleConfig` type fields `colorScheme` and `fontFamily`. Keep `StyleConfig` if it still has `layout` or other fields; otherwise remove it entirely. Check first:

```bash
grep -n "StyleConfig" src/lib/page-config/schema.ts
```

b) Remove `AVAILABLE_THEMES`, `AvailableTheme`, and theme validation.

c) Add `surface`, `voice`, `light` to `PageConfig`:

```ts
// Add these imports at the top
import { isValidSurface, isValidVoice, isValidLight, listSurfaces, listVoices } from "@/lib/presence";

// In PageConfig type definition, add:
surface?: string;  // "canvas" | "clay" | "archive" | future
voice?: string;    // "signal" | "narrative" | "terminal" | future
light?: string;    // "day" | "night"

// Remove: theme, style.colorScheme, style.fontFamily
```

d) Update `validatePageConfig()` to validate presence fields:

```ts
// Remove: theme validation, colorScheme validation, fontFamily validation
// Add:
if (input.surface !== undefined && !isValidSurface(input.surface)) {
  errors.push(`surface must be one of: ${listSurfaces().map(s => s.id).join(", ")}`);
}
if (input.voice !== undefined && !isValidVoice(input.voice)) {
  errors.push(`voice must be one of: ${listVoices().map(v => v.id).join(", ")}`);
}
if (input.light !== undefined && !isValidLight(input.light)) {
  errors.push('light must be "day" or "night"');
}
```

e) Update defaults in `normalizeConfigForWrite()` or equivalent:

```ts
// Remove: theme default, colorScheme default, fontFamily default
// Add defaults for new fields where needed (optional — presence has CSS defaults)
```

**Step 3: Run full test suite to see what breaks**

```bash
npx vitest run 2>&1 | grep -E "FAIL|ERROR" | head -40
```

Note all failing test files — they will be fixed in Task 19.

**Step 4: Commit the schema change**

```bash
git add src/lib/page-config/schema.ts
git commit -m "feat(schema): replace theme/colorScheme/fontFamily with surface/voice/light"
```

---

## Task 4: DB Migration + Data Cleanup

**Files:**
- Create: `db/migrations/0025_presence_system.sql`
- Create: `scripts/cleanup-presence-reset.ts` (one-off cleanup script — NOT auto-applied)

**Step 0: Run explicit cleanup script (before migration)**

The destructive DELETE is extracted to a standalone script — NOT embedded in the migration.
This prevents it from running automatically in staging/prod.

```ts
// scripts/cleanup-presence-reset.ts
// ONE-OFF: delete all existing pages + caches for the Presence System clean cut.
// Only run in local dev environments with no real user data.
// Requires explicit ENV confirmation to prevent accidental runs.

import Database from "better-sqlite3";

if (process.env.CONFIRM_RESET !== "yes") {
  console.error("Set CONFIRM_RESET=yes to run this script. Check row counts first.");
  console.error("  SELECT COUNT(*) FROM page;");
  process.exit(1);
}

const db = new Database(process.env.DATABASE_PATH ?? "db/data.db");
const before = (db.prepare("SELECT COUNT(*) as n FROM page").get() as { n: number }).n;
console.log(`Deleting ${before} page rows...`);

db.exec(`
  DELETE FROM page;
  DELETE FROM section_copy_cache;
  DELETE FROM section_copy_state;
  DELETE FROM section_copy_proposals;
  DELETE FROM translation_cache;
`);

const after = (db.prepare("SELECT COUNT(*) as n FROM page").get() as { n: number }).n;
console.log(`Done. page rows remaining: ${after}`);
```

Run it:
```bash
CONFIRM_RESET=yes npx tsx scripts/cleanup-presence-reset.ts
```

**Step 1: Write migration (non-destructive — no DELETEs)**

```sql
-- db/migrations/0025_presence_system.sql
-- Presence System: schema registration only.
-- PageConfig is stored as JSON in the `config` column so no DDL changes needed
-- for surface/voice/light fields — they live inside the JSON blob.
-- Data cleanup is handled by scripts/cleanup-presence-reset.ts (run separately).

-- This migration intentionally contains no DDL changes.
-- It is a version marker for the migration system.
SELECT 1; -- no-op to satisfy migration runner
```

**Step 2: Apply migration**

Use the standalone migration runner only (do NOT run `npm run dev` here — the dev server
will fail to boot until the runtime field migration is complete in Task 5+):

```bash
npx tsx src/lib/db/migrate.ts
```

If the standalone runner filename differs, check `src/lib/db/` first:

```bash
ls src/lib/db/*.ts | grep -i migrat
```

**Step 3: Verify**

```bash
# Use the raw SQLite file directly (not Drizzle instance — Drizzle doesn't expose .prepare())
npx tsx -e "
import Database from 'better-sqlite3';
const db = new Database('db/data.db');
console.log(db.prepare('SELECT count(*) as n FROM page').get());
"
```
Expected: `{ n: 0 }`. Adjust the DB path to match `DATABASE_URL` in `.env`.

**Step 4: Bump EXPECTED_SCHEMA_VERSION**

Open `src/lib/db/migrate.ts` and update:

```ts
// Change:
const EXPECTED_SCHEMA_VERSION = 24; // (or whatever the current number is)
// To:
const EXPECTED_SCHEMA_VERSION = 25;
```

This constant gates the worker follower startup — without this bump the follower may treat schema as ready before 0025 runs.

**Step 5: Commit**

```bash
git add db/migrations/0025_presence_system.sql src/lib/db/migrate.ts
git commit -m "feat(db): migration 0025 — purge legacy pages, bump schema version to 25"
```

---

## Task 5: Style API Route + Page Composer Update

**Files:**
- Modify: `src/app/api/draft/style/route.ts`
- Modify: `src/lib/services/page-composer.ts`

**Step 1: Update style route**

In `src/app/api/draft/style/route.ts`, replace theme/colorScheme/fontFamily handling with surface/voice/light:

```ts
// Remove all references to: theme, colorScheme, fontFamily, AVAILABLE_THEMES
// Replace with:
const { surface, voice, light, layoutTemplate } = body;

if (surface !== undefined) {
  if (!isValidSurface(surface)) {
    return NextResponse.json({ error: "Invalid surface" }, { status: 400 });
  }
  config.surface = surface;
}
if (voice !== undefined) {
  if (!isValidVoice(voice)) {
    return NextResponse.json({ error: "Invalid voice" }, { status: 400 });
  }
  config.voice = voice;
}
if (light !== undefined) {
  if (!isValidLight(light)) {
    return NextResponse.json({ error: "Invalid light" }, { status: 400 });
  }
  config.light = light;
}
```

**Step 2: Update page composer defaults**

In `src/lib/services/page-composer.ts`:
- Remove `DEFAULT_STYLE`, `DEFAULT_THEME`, and any reference to `colorScheme`, `fontFamily`, `theme`
- Remove carry-forward logic for `theme` field
- Add carry-forward for `surface`, `voice`, `light` from existing draft/published page

**Step 3: Migrate all other runtime paths that read/write `theme`, `colorScheme`, `fontFamily`**

These files must also be updated — the schema change alone is not enough:

- **`src/lib/services/page-projection.ts`**: `projectCanonicalConfig()` and related functions may pass through or default the old fields — update to use `surface/voice/light`.
- **`src/app/api/preview/route.ts`** and **`src/app/api/preview/stream/route.ts`**: check for any theme/style serialization in the preview response.
- **`src/lib/services/publish-pipeline.ts`** (if it exists): verify it passes presence fields through to the published page config.
- **`src/app/api/preferences/route.ts`**: language switch triggers recomposition — ensure draftMeta carry-forward uses `surface/voice/light`.
- **`src/lib/agent/tools.ts`** → `inspect_page_state` tool: if it outputs page style fields, update to show `surface/voice/light`.

For each file, search for `theme`, `colorScheme`, `fontFamily` and replace accordingly. If a field is missing from the carry-forward chain, presence changes will silently reset on next compose.

```bash
grep -rn "colorScheme\|fontFamily\|\.theme\b" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".test."
```

Fix every occurrence in non-test source files.

**Step 4: Run style-related tests**

```bash
# First check what test files exist:
ls tests/evals/ | grep -E "style|composer|draft|schema"
# Then run matching files, or run the full suite and look for regressions:
npx vitest run 2>&1 | grep -E "FAIL|ERROR" | head -20
```

**Step 5: Commit**

```bash
git add src/app/api/draft/style/route.ts src/lib/services/page-composer.ts src/lib/services/page-projection.ts src/app/api/preview/ src/app/api/preferences/
git commit -m "feat(api): style route + all runtime paths use surface/voice/light"
```

---

## Task 6: Agent Tools + Prompts Update

**Files:**
- Modify: `src/lib/agent/tools.ts`
- Modify: `src/lib/agent/prompts.ts`
- Modify: `tests/evals/agent-tools.test.ts` (if exists)

**Step 1: Update `update_page_style` tool in `tools.ts`**

```ts
// Remove: theme param, colorScheme, fontFamily from update_page_style
// Remove: set_theme tool entirely
// Update update_page_style parameters:
update_page_style: tool({
  description: "Update the page visual presence (surface, voice, light) or layout template.",
  parameters: z.object({
    surface: z.string().optional().describe(
      `Surface controls colors + texture. Valid: ${listSurfaces().map(s => s.id).join(", ")}`
    ),
    voice: z.string().optional().describe(
      `Voice controls typography. Valid: ${listVoices().map(v => v.id).join(", ")}`
    ),
    light: z.enum(["day", "night"]).optional().describe("Light mode per surface"),
    layoutTemplate: z.string().optional().describe("Layout: monolith, curator, architect, cinematic"),
  }),
  execute: async ({ surface, voice, light, layoutTemplate }) => {
    // validate + call /api/draft/style
  }
}),
```

**Step 2: Update `prompts.ts`**

In `buildSystemPrompt()` or wherever `DATA_MODEL_REFERENCE` is assembled:

```ts
import { buildPresenceReference } from "@/lib/presence/prompt-builder";

// Replace the static theme/font block with:
const presenceBlock = buildPresenceReference();

// In the prompt string, replace:
// "Available themes: minimal, warm, editorial-360..."
// with:
// presenceBlock
```

Remove all references to:
- `"Available themes: minimal, warm, editorial-360"`
- `"fontFamily": "serif", "sans-serif", "mono", "inter"`
- `set_theme` tool description

**Step 2b: Policy sweep — remove `set_theme` from ALL policy files**

The agent has policy files in `src/lib/agent/policies/` that may reference `set_theme` in instructions, undo flows, or examples. Sweep all of them:

```bash
grep -rn "set_theme\|colorScheme\|fontFamily\|theme.*minimal\|theme.*warm\|editorial-360" \
  src/lib/agent/policies/ src/lib/agent/prompts.ts \
  --include="*.ts" | grep -v node_modules
```

For every match, replace with the `update_page_style` equivalent. The undo-awareness policy (if it references reversing `set_theme`) must be updated to reference `update_page_style({ surface, voice, light })`.

**Step 3: Run prompt contract tests**

```bash
npx vitest run tests/evals/prompt-contracts.test.ts 2>&1 | tail -20
```

Update any failing assertions that reference legacy theme names.

**Step 4: Commit**

```bash
git add src/lib/agent/tools.ts src/lib/agent/prompts.ts
git commit -m "feat(agent): update_page_style uses presence system, remove set_theme"
```

---

## Task 7: Font Loading (next/font)

**Files:**
- Modify: `src/app/layout.tsx` (or wherever fonts are loaded)

**Step 1: Check current font setup**

```bash
grep -n "font\|Font\|next/font" src/app/layout.tsx | head -20
```

**Step 2: Add missing fonts, remove unused ones**

```ts
import {
  Plus_Jakarta_Sans,  // Signal heading — keep
  Figtree,            // Signal body — keep
  Cormorant_Garamond, // Narrative heading — ADD
  Lato,               // Narrative body — ADD
  JetBrains_Mono,     // Terminal — ADD
} from "next/font/google";

// Remove: Inter, and any other fonts not in the three Voices

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const lato = Lato({
  subsets: ["latin"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
  variable: "--font-lato",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});
```

Apply all font variables to `<html>` className.

**Step 3: Map CSS variables to Voice classes in globals.css**

```css
/* Voice: Signal (default — no class needed) */
.os-page {
  --h-font: var(--font-plus-jakarta-sans), sans-serif;
  --b-font: var(--font-figtree), sans-serif;
}
/* Voice: Narrative */
.os-page.voice-narrative {
  --h-font: var(--font-cormorant), serif;
  --b-font: var(--font-lato), sans-serif;
}
/* Voice: Terminal */
.os-page.voice-terminal {
  --h-font: var(--font-jetbrains), monospace;
  --b-font: var(--font-jetbrains), monospace;
}
```

**Step 4: Verify fonts load in browser**

```bash
npm run dev
# Open http://localhost:3000, check network tab for font files
```

**Step 5: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(fonts): add Cormorant, Lato, JetBrains Mono for Narrative and Terminal voices"
```

---

## Task 8: globals.css Rewrite

**Files:**
- Modify: `src/app/globals.css` (full rewrite)

**Step 1: Rewrite globals.css**

**IMPORTANT:** This project uses Tailwind v4 and shadcn/ui. First, read the top of `globals.css` to understand the exact current structure. Preserve ALL of the following (do NOT replace them):

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";  /* or equivalent shadcn import */
@theme inline { /* ... shadcn theme tokens ... */ }
/* Any shadcn-specific :root vars that the UI components depend on */
```

Also preserve the **Layout Template Engine** CSS rules that are currently in `globals.css` (check around line 336+):

```css
/* --- Layout Template Engine — desktop order via CSS custom property --- */
@media (min-width: 768px) {
  .layout-architect > * { order: var(--md-order, 0); }
  .layout-curator > * { order: var(--md-order, 0); }
}

/* --- Slot spacing for compact layouts (non-monolith) --- */
.layout-architect .slot-third [data-section] h2,
.layout-curator .slot-third [data-section] h2 { /* ... */ }
/* etc. */
```

These rules are critical for Architect and Curator layouts — without them, desktop ordering regresses (sections render in mobile order on desktop). Read the full globals.css and copy all non-theme layout rules verbatim into the new file.

Then, **after** the preserved Tailwind/shadcn + layout-engine block, replace only the legacy theme CSS (`.minimal`, `.warm`, `.editorial-360`, `--theme-*` vars) with the new Presence token system below. Do NOT delete shadcn tokens or layout-engine rules.

Structure (new Presence block added after existing framework imports):
```css
/* ↑ KEEP: @import "tailwindcss", tw-animate-css, shadcn, @theme, shadcn :root vars ↑ */

/* 2. DNA constants on :root */
:root {
  --os-dna-ease: cubic-bezier(0.16, 1, 0.32, 1);
  --os-dna-reveal-distance: 12px;
  --os-dna-signature-opacity: 0.4;
}

/* 3. .os-page base (Canvas Day defaults — no class needed) */
.os-page {
  --page-bg: #fafaf9;
  --page-fg: #141412;
  --page-fg-secondary: #696966;
  --page-accent: #141412;
  --page-accent-fg: #fafaf9;
  --page-border: rgba(0,0,0,0.08);
  --page-muted: rgba(0,0,0,0.04);
  --page-card-bg: #f2f2f0;
  --page-card-border: rgba(0,0,0,0.08);
  --page-grain: 0;
  --page-edge: 0;
  --reading-max: 660px;
  --section-label-opacity: 0.6;
  /* Voice defaults (Signal) */
  --h-font: var(--font-plus-jakarta-sans, 'Plus Jakarta Sans'), sans-serif;
  --b-font: var(--font-figtree, 'Figtree'), sans-serif;
  /* Bridge: existing section components use --page-font-heading/--page-font-body.
     Map to the new voice vars so all components benefit from Voice switching. */
  --page-font-heading: var(--h-font);
  --page-font-body: var(--b-font);

  background: var(--page-bg);
  color: var(--page-fg);
  font-family: var(--b-font);
  font-size: 15px;
  line-height: 1.65;
  min-height: 100%;
  position: relative;
}

/* 4. Surface: Clay */
.os-page.surface-clay {
  --page-bg: #f5ede0;
  --page-fg: #2a1e12;
  --page-fg-secondary: #87705a;
  --page-accent: #b05a2f;
  --page-accent-fg: #fff;
  --page-border: rgba(0,0,0,0.1);
  --page-muted: rgba(0,0,0,0.05);
  --page-card-bg: #eee0cc;
  --page-grain: 0.025;
  --page-edge: 0.14;
  --reading-max: 680px;
  --section-label-opacity: 0.75;
}

/* 5. Surface: Archive */
.os-page.surface-archive {
  --page-bg: #ffffff;
  --page-fg: #080808;
  --page-fg-secondary: #505050;
  --page-accent: #1b2b6b;
  --page-accent-fg: #fff;
  --page-border: rgba(0,0,0,0.1);
  --page-muted: rgba(0,0,0,0.04);
  --page-card-bg: #f6f6f6;
  --page-grain: 0.028;
  --page-edge: 0.18;
  --reading-max: 700px;
  --section-label-opacity: 0.85;
}

/* 6. Light: Night (Canvas Night) */
.os-page.light-night {
  --page-bg: #0f0f0e;
  --page-fg: #e8e4de;
  --page-fg-secondary: rgba(232,228,222,0.5);
  --page-accent: #e8e4de;
  --page-accent-fg: #111;
  --page-border: rgba(255,255,255,0.08);
  --page-muted: rgba(255,255,255,0.05);
  --page-card-bg: #1a1a18;
}
/* Clay Night */
.os-page.surface-clay.light-night {
  --page-bg: #1a1009;
  --page-fg: #f5e8d5;
  --page-fg-secondary: rgba(245,232,213,0.5);
  --page-accent: #d4845a;
  --page-border: rgba(255,255,255,0.08);
  --page-card-bg: #231610;
}
/* Archive Night */
.os-page.surface-archive.light-night {
  --page-bg: #07080f;
  --page-fg: #eef0f8;
  --page-fg-secondary: rgba(238,240,248,0.5);
  --page-accent: #8b9fd4;
  --page-border: rgba(255,255,255,0.08);
  --page-card-bg: #0d0e18;
}

/* 7. Voice: Narrative */
.os-page.voice-narrative {
  --h-font: var(--font-cormorant, 'Cormorant Garamond'), serif;
  --b-font: var(--font-lato, 'Lato'), sans-serif;
}
/* Voice: Terminal */
.os-page.voice-terminal {
  --h-font: var(--font-jetbrains, 'JetBrains Mono'), monospace;
  --b-font: var(--font-jetbrains, 'JetBrains Mono'), monospace;
}

/* 8. Grain overlay (L2 texture — controlled by --page-grain) */
.os-page::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: var(--page-grain);
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 200px;
}

/* 9. Edge lines (L2 structure — controlled by --page-edge) */
.os-page::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  border-left: 1px solid rgba(0,0,0,var(--page-edge));
  border-right: 1px solid rgba(0,0,0,var(--page-edge));
  margin: 0 8px;
}
.os-page.light-night::after {
  border-left-color: rgba(255,255,255,calc(var(--page-edge) * 0.5));
  border-right-color: rgba(255,255,255,calc(var(--page-edge) * 0.5));
}

/* 10. DNA Laws */

/* L1 — The Accent Bar */
.section-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--b-font);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--page-fg);
  opacity: var(--section-label-opacity);
  margin-bottom: 24px;
}
.section-label::before {
  content: '';
  display: block;
  flex-shrink: 0;
  width: 3px;
  height: 16px;
  background: var(--page-accent);
  border-radius: 2px;
}

/* L3 — The Curve (all transitions use this easing) */
/* Applied per-property in individual component styles */

/* L4 — The Birth (scroll reveal) */
.theme-reveal {
  opacity: 0;
  transform: translateY(var(--os-dna-reveal-distance, 12px));
  transition: opacity 600ms var(--os-dna-ease), transform 600ms var(--os-dna-ease);
}
.theme-reveal.revealed {
  opacity: 1;
  transform: translateY(0);
}
@media (prefers-reduced-motion: reduce) {
  .theme-reveal { opacity: 1; transform: none; transition: none; }
}
/* Skip reveal in builder preview */
.preview-mode .theme-reveal {
  opacity: 1 !important;
  transform: none !important;
  transition: none !important;
}

/* L5 — The Thread (hover underline grow) */
.hover-underline-grow {
  position: relative;
  text-decoration: none;
}
.hover-underline-grow::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0;
  width: 100%; height: 1px;
  background: var(--page-accent);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 300ms var(--os-dna-ease);
}
.hover-underline-grow:hover::after { transform: scaleX(1); }

/* L6 — The Signature */
.os-signature {
  font-size: 12px;
  color: var(--page-fg);
  opacity: var(--os-dna-signature-opacity, 0.4);
  text-decoration: none;
  letter-spacing: 0.05em;
}

/* 11. Entry dot separator (shared utility) */
.entry-dot-separator {
  display: inline-block;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--page-fg-secondary);
  opacity: 0.4;
  vertical-align: middle;
  margin: 0 6px;
}
```

**Step 2: Audit existing section components for CSS token usage**

Before the build passes, grep for any CSS variables consumed by the existing section components
that are NOT in the new token set above:

```bash
grep -r "var(--page-" src/components/page/ src/components/layout-templates/ \
  src/themes/ | grep -v "node_modules" | sed 's/.*var(--/--/' | sed 's/).*//' \
  | sort -u
```

Compare against the token set defined in the new `.surface-*` / `.voice-*` / `.light-night` blocks.
Any token in the grep output that is missing from the new CSS definitions will render as an empty
value (silent visual regression). For each missing token, add a fallback alias in `.os-page`:

```css
.os-page {
  /* CSS variable bridge — backward compatibility for existing section components */
  --page-font-heading: var(--h-font);
  --page-font-body: var(--b-font);
  /* Add any additional tokens from the audit here, mapping to their nearest new equivalent */
  /* e.g. --page-badge-bg: var(--page-card-bg); */
}
```

**Step 3: Verify Tailwind still works**

```bash
npm run build 2>&1 | tail -20
```

**Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(css): rewrite globals.css with Presence System token architecture"
```

---

## Task 9: Section Components Migration + OsPageWrapper

**Files:**
- Create: `src/components/page/OsPageWrapper.tsx`
- Create: `src/components/sections/index.ts`
- Modify: `src/components/page/PageRenderer.tsx`
- Keep: `src/themes/editorial-360/components/` (components stay, path changes later)

**Step 1: Create OsPageWrapper**

This replaces `EditorialLayout` — handles scroll-reveal IntersectionObserver, applies `.os-page` CSS classes, renders grain/edge overlays via CSS (already in globals.css).

```tsx
// src/components/page/OsPageWrapper.tsx
"use client";

import React, { useEffect, useRef } from "react";
import type { PageConfig } from "@/lib/page-config/schema";

type OsPageWrapperProps = {
  config: PageConfig;
  previewMode?: boolean;
  children: React.ReactNode;
};

function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node && node !== document.documentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === "auto" || overflow === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

export function OsPageWrapper({ config, previewMode = false, children }: OsPageWrapperProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const surface = config.surface ?? "canvas";
  const voice = config.voice ?? "signal";
  const light = config.light ?? "day";

  const presenceClasses = [
    "os-page",
    surface !== "canvas" ? `surface-${surface}` : "",
    voice !== "signal" ? `voice-${voice}` : "",
    light === "night" ? "light-night" : "",
    previewMode ? "preview-mode" : "",
  ].filter(Boolean).join(" ");

  // Scroll reveal — skip entirely in preview mode
  useEffect(() => {
    if (previewMode) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const scrollParent = findScrollParent(wrapper);
    const reveals = wrapper.querySelectorAll(".theme-reveal");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, root: scrollParent },
    );
    reveals.forEach(el => observer.observe(el));
    requestAnimationFrame(() => {
      reveals.forEach(el => {
        const rect = el.getBoundingClientRect();
        const rootRect = scrollParent
          ? scrollParent.getBoundingClientRect()
          : { top: 0, bottom: window.innerHeight };
        if (rect.top < rootRect.bottom && rect.bottom > rootRect.top) {
          el.classList.add("revealed");
          observer.unobserve(el);
        }
      });
    });
    return () => observer.disconnect();
  }, [previewMode]);

  return (
    <div
      ref={wrapperRef}
      className={presenceClasses}
      style={{ minHeight: "100%", position: "relative", overflowX: "hidden" }}
      // NOTE: do NOT use overflow: "hidden" here — it breaks position:sticky descendants
      // (Curator sidebar, StickyNav, OwnerBanner). Use overflowX only for horizontal clip.
    >
      {/* Shared page shell — equivalent to what EditorialLayout provided.
          Wraps content in a min-height 100svh container with base vertical flow.
          Non-Monolith layout templates (Curator, Architect, Cinematic) rely on
          this outer shell for their page-level spacing and flow. */}
      <main style={{ minHeight: "100svh", display: "flex", flexDirection: "column" }}>
        {children}
      </main>
    </div>
  );
}
```

> **Note:** Before removing `EditorialLayout`, read `src/themes/editorial-360/Layout.tsx` and check if it contributes any global padding or spacing styles that are not already covered by layout template CSS or Tailwind. If yes, carry those styles into the `.os-page` base in `globals.css` (so all layout templates inherit them). The `<main>` wrapper above preserves page-level flex flow; check that this doesn't conflict with how `VerticalLayout`, `SidebarLayout`, and `BentoLayout` currently handle their outer containers.

**Step 2: Create sections index**

```ts
// src/components/sections/index.ts
// Use named imports (not re-exports) to create local bindings for SECTION_COMPONENTS.
import type React from "react";
import type { SectionProps } from "@/themes/types";
import { Hero } from "@/themes/editorial-360/components/Hero";
import { Bio } from "@/themes/editorial-360/components/Bio";
import { Projects } from "@/themes/editorial-360/components/Projects";
import { Skills } from "@/themes/editorial-360/components/Skills";
import { Interests } from "@/themes/editorial-360/components/Interests";
import { Social } from "@/themes/editorial-360/components/Social";
import { Footer } from "@/themes/editorial-360/components/Footer";
import { Experience } from "@/themes/editorial-360/components/Experience";
import { Education } from "@/themes/editorial-360/components/Education";
import { Achievements } from "@/themes/editorial-360/components/Achievements";
import { Stats } from "@/themes/editorial-360/components/Stats";
import { Reading } from "@/themes/editorial-360/components/Reading";
import { Music } from "@/themes/editorial-360/components/Music";
import { Languages } from "@/themes/editorial-360/components/Languages";
import { Activities } from "@/themes/editorial-360/components/Activities";
import { Contact } from "@/themes/editorial-360/components/Contact";
import { Custom } from "@/themes/editorial-360/components/Custom";
import { Timeline } from "@/themes/editorial-360/components/Timeline";
import { AtAGlance } from "@/themes/editorial-360/components/AtAGlance";

// Section type → component map (used by PageRenderer)
export const SECTION_COMPONENTS: Record<string, React.ComponentType<SectionProps<any>>> = {
  hero: Hero,
  bio: Bio,
  projects: Projects,
  skills: Skills,
  interests: Interests,
  social: Social,
  footer: Footer,
  experience: Experience,
  education: Education,
  achievements: Achievements,
  stats: Stats,
  reading: Reading,
  music: Music,
  languages: Languages,
  activities: Activities,
  contact: Contact,
  custom: Custom,
  timeline: Timeline,
  "at-a-glance": AtAGlance,
};

// Re-export components so consumers can import them directly
export {
  Hero, Bio, Projects, Skills, Interests, Social, Footer,
  Experience, Education, Achievements, Stats, Reading, Music,
  Languages, Activities, Contact, Custom, Timeline, AtAGlance,
};
```

**Step 3: Rewrite PageRenderer**

```tsx
// src/components/page/PageRenderer.tsx
"use client";
import React from "react";
import type { PageConfig, Section } from "@/lib/page-config/schema";
import { resolveLayoutTemplate } from "@/lib/layout/registry";
import { resolveVariant } from "@/lib/layout/widgets";
import { groupSectionsBySlot } from "@/lib/layout/group-slots";
import { getLayoutComponent } from "@/components/layout-templates";
import { OwnerBanner } from "@/components/page/OwnerBanner";
import { VisitorBanner } from "@/components/page/VisitorBanner";
import { filterCompleteSections } from "@/lib/page-config/section-completeness";
import { OsPageWrapper } from "@/components/page/OsPageWrapper";
import { SECTION_COMPONENTS } from "@/components/sections";

export type PageRendererProps = {
  config: PageConfig;
  previewMode?: boolean;
  isOwner?: boolean;
};

export function PageRenderer({ config, previewMode = false, isOwner = false }: PageRendererProps) {
  const template = resolveLayoutTemplate(config);
  const LayoutComponent = getLayoutComponent(template.id);
  const sections = previewMode ? config.sections : filterCompleteSections(config.sections);
  const slots = groupSectionsBySlot(sections, template);

  const renderSection = (section: Section) => {
    const SectionComponent = SECTION_COMPONENTS[section.type];
    if (!SectionComponent) {
      if (previewMode) {
        return (
          <div key={section.id} className="p-4 border border-dashed border-red-500 text-red-500 text-sm mb-4">
            Unsupported section type: {section.type}
          </div>
        );
      }
      return null;
    }
    const variant = resolveVariant(section);
    return (
      <div key={section.id} id={`section-${section.id}`} data-section={section.type}>
        <SectionComponent content={section.content} variant={variant} />
      </div>
    );
  };

  return (
    <>
      {isOwner && !previewMode && <OwnerBanner username={config.username} />}
      {!isOwner && !previewMode && <VisitorBanner />}
      {/* StickyNav is added in Task 12 — leave this placeholder comment */}
      {/* {showStickyNav && <StickyNav sections={sections} name={heroName} avatarUrl={heroAvatar} />} */}
      <OsPageWrapper config={config} previewMode={previewMode}>
        <LayoutComponent slots={slots} renderSection={renderSection} />
      </OsPageWrapper>
    </>
  );
}
```

**Step 4: Run dev server and visually verify a page renders**

```bash
npm run dev
# Visit http://localhost:3000/builder — check page renders without crashing
```

**Step 5: Commit**

```bash
git add src/components/page/OsPageWrapper.tsx src/components/sections/index.ts src/components/page/PageRenderer.tsx
git commit -m "feat(renderer): OsPageWrapper replaces theme system, SECTION_COMPONENTS registry"
```

---

## Task 10: MonolithLayout — Lane System + Variable Spacing

**Files:**
- Modify: `src/components/layout-templates/MonolithLayout.tsx`
- Create: `tests/evals/monolith-layout.test.ts`

**Step 1: Write failing tests**

```ts
// tests/evals/monolith-layout.test.ts
import { describe, it, expect } from "vitest";
import { getLane, getSpacingClass } from "@/components/layout-templates/MonolithLayout";

describe("MonolithLayout lanes", () => {
  it("assigns hero lane to hero section", () => {
    expect(getLane("hero")).toBe("hero");
  });
  it("assigns reading lane to bio", () => {
    expect(getLane("bio")).toBe("reading");
  });
  it("assigns bleed lane to projects", () => {
    expect(getLane("projects")).toBe("bleed");
  });
  it("assigns reading lane to skills (dense)", () => {
    expect(getLane("skills")).toBe("reading");
  });
  it("assigns hero lane to footer", () => {
    expect(getLane("footer")).toBe("hero");
  });
  it("defaults to reading for unknown types", () => {
    expect(getLane("unknown-type")).toBe("reading");
  });
});

describe("MonolithLayout spacing", () => {
  it("gives 80px (mb-20) after hero", () => {
    expect(getSpacingClass("hero", false)).toBe("mb-20");
  });
  it("gives 48px (mb-12) after bio", () => {
    expect(getSpacingClass("bio", false)).toBe("mb-12");
  });
  it("gives 32px (mb-8) after skills", () => {
    expect(getSpacingClass("skills", false)).toBe("mb-8");
  });
  it("gives 80px before footer (last section)", () => {
    expect(getSpacingClass("bio", true)).toBe("mb-20");
  });
});
```

**Step 2: Run to verify failure**

```bash
npx vitest run tests/evals/monolith-layout.test.ts
```

**Step 3: Rewrite MonolithLayout.tsx**

```tsx
// src/components/layout-templates/MonolithLayout.tsx
import React from "react";
import type { LayoutComponentProps } from "./types";
import { getLayoutTemplate } from "@/lib/layout/registry";

const BLEED_SECTIONS = new Set(["projects", "reading", "music"]);
const DENSE_SECTIONS = new Set(["stats", "skills", "interests", "languages", "activities", "social", "contact"]);
const HERO_SECTIONS = new Set(["hero", "footer"]);

export type Lane = "hero" | "reading" | "bleed";

export function getLane(sectionType: string): Lane {
  if (HERO_SECTIONS.has(sectionType)) return "hero";
  if (BLEED_SECTIONS.has(sectionType)) return "bleed";
  return "reading";
}

export function getSpacingClass(sectionType: string, isLastBeforeFooter: boolean): string {
  if (sectionType === "hero") return "mb-20";
  if (isLastBeforeFooter) return "mb-20";
  if (DENSE_SECTIONS.has(sectionType)) return "mb-8";
  return "mb-12";
}

const LANE_CLASSES: Record<Lane, string> = {
  hero: "w-full",
  reading: "w-full max-w-[var(--reading-max,660px)] mx-auto px-6 md:px-12",
  bleed: "w-full max-w-[calc(var(--reading-max,660px)*1.35)] mx-auto px-6 md:px-12",
};

export function MonolithLayout({ slots, renderSection, className }: LayoutComponentProps) {
  const template = getLayoutTemplate("monolith");
  const sortedSlots = [...template.slots].sort((a, b) => a.order - b.order);

  const allSections: { section: any; slotId: string }[] = [];
  for (const slot of sortedSlots) {
    const sections = slots[slot.id];
    if (!sections?.length) continue;
    for (const section of sections) {
      allSections.push({ section, slotId: slot.id });
    }
  }

  const lastNonFooterIdx = allSections.findLastIndex(s => s.section.type !== "footer");
  let globalIdx = 0;

  return (
    <div className={`layout-monolith flex flex-col ${className ?? ""}`}>
      {sortedSlots.map((slot) => {
        const sections = slots[slot.id];
        if (!sections?.length) return null;
        return (
          <div key={slot.id}>
            {sections.map((section) => {
              const currentIdx = globalIdx++;
              const isLastBeforeFooter = currentIdx === lastNonFooterIdx;
              const lane = getLane(section.type);
              const spacingClass = section.type === "footer" ? "" : getSpacingClass(section.type, isLastBeforeFooter);
              return (
                <div key={section.id} className={`${LANE_CLASSES[lane]} ${spacingClass}`}>
                  {renderSection(section)}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
```

**Step 4: Run tests**

```bash
npx vitest run tests/evals/monolith-layout.test.ts
```

**Step 5: Commit**

```bash
git add src/components/layout-templates/MonolithLayout.tsx tests/evals/monolith-layout.test.ts
git commit -m "feat(layout): monolith lane system — hero/reading/bleed zones + variable spacing"
```

---

## Task 11: Hero Section — Photo Variants + Avatar

**Files:**
- Modify: `src/themes/editorial-360/components/Hero.tsx`

**Step 1: Update Hero.tsx**

The Hero component already supports `variant="hero-split"` and `variant="hero-centered"`. Ensure:
1. `hero-split` (default): avatar 80px, left-aligned, same row as name
2. `hero-centered`: avatar 120px, centered, name below
3. Initials fallback uses `--page-accent` bg, `--h-font`, no border
4. Avatar element is tappable (wraps `<button onClick={onAvatarClick}>` if `onAvatarClick` prop provided)
5. Photo `<img>` uses `object-fit: cover` in a `border-radius: 50%` container

Check current implementation:
```bash
cat src/themes/editorial-360/components/Hero.tsx
```

Update `SectionProps<HeroContent>` to include optional `onAvatarClick?: () => void` and wire it to the avatar element.

Ensure initials fallback CSS uses `var(--page-accent)` and `var(--h-font)` — no hardcoded colors.

**Step 2: Verify in dev**

```bash
npm run dev
# Visit /builder, check hero renders with correct avatar styling
```

**Step 3: Commit**

```bash
git add src/themes/editorial-360/components/Hero.tsx
git commit -m "feat(hero): photo variants (split/centered), accent-colored initials fallback"
```

---

## Task 12: Sticky Nav for Published Pages

**Files:**
- Create: `src/components/page/StickyNav.tsx`
- Modify: `src/components/page/PageRenderer.tsx`
- Create: `tests/evals/sticky-nav.test.ts`

**Step 1: Write failing tests**

```ts
// tests/evals/sticky-nav.test.ts
import { describe, it, expect } from "vitest";
import { shouldShowStickyNav, extractNavSections } from "@/components/page/StickyNav";

describe("StickyNav", () => {
  it("shows nav for 8+ sections", () => {
    const sections = Array.from({ length: 8 }, (_, i) => ({ type: "bio", id: String(i) }));
    expect(shouldShowStickyNav(sections as any)).toBe(true);
  });

  it("does not show nav for fewer than 8 sections", () => {
    const sections = Array.from({ length: 7 }, (_, i) => ({ type: "bio", id: String(i) }));
    expect(shouldShowStickyNav(sections as any)).toBe(false);
  });

  it("excludes hero and footer from nav links", () => {
    const sections = [
      { type: "hero", id: "1" },
      { type: "bio", id: "2" },
      { type: "experience", id: "3" },
      { type: "footer", id: "4" },
    ];
    const navSections = extractNavSections(sections as any);
    expect(navSections.map(s => s.type)).toEqual(["bio", "experience"]);
  });
});
```

**Step 2: Run to verify failure**

```bash
npx vitest run tests/evals/sticky-nav.test.ts
```

**Step 3: Implement StickyNav**

```tsx
// src/components/page/StickyNav.tsx
"use client";
import React, { useEffect, useRef, useState } from "react";
import type { Section } from "@/lib/page-config/schema";

const EXCLUDED_TYPES = new Set(["hero", "footer"]);
const STICKY_NAV_THRESHOLD = 8;

export function shouldShowStickyNav(sections: Section[]): boolean {
  return sections.length >= STICKY_NAV_THRESHOLD;
}

export function extractNavSections(sections: Section[]): Section[] {
  return sections.filter(s => !EXCLUDED_TYPES.has(s.type));
}

const SECTION_LABELS: Record<string, string> = {
  bio: "About", experience: "Experience", education: "Education",
  projects: "Projects", skills: "Skills", achievements: "Achievements",
  reading: "Reading", music: "Music", languages: "Languages",
  interests: "Interests", contact: "Contact", stats: "Stats",
  activities: "Activities", social: "Social", custom: "More",
};

type StickyNavProps = {
  sections: Section[];
  name: string;
  avatarUrl?: string;
};

export function StickyNav({ sections, name, avatarUrl }: StickyNavProps) {
  const [visible, setVisible] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY > 200 && currentY < lastScrollY.current) {
        setVisible(true);
      } else if (currentY <= 200 || currentY > lastScrollY.current) {
        setVisible(false);
      }
      lastScrollY.current = currentY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navSections = extractNavSections(sections);
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <nav
      className="os-sticky-nav"
      style={{
        position: "fixed",
        top: 0,  // NOTE: OwnerBanner and VisitorBanner also render at top.
        // StickyNav only shows on published pages for non-owners (visitor mode),
        // and VisitorBanner is relatively positioned (not fixed). OwnerBanner is shown
        // when the user is the owner — in that case StickyNav is NOT shown (it renders
        // only on published pages for non-owners). Verify this exclusion logic holds.
        // If banners are fixed-positioned, add their height as a top offset (e.g. top: 40px).
        left: 0,
        right: 0,
        zIndex: 50,
        height: "48px",
        background: "var(--page-bg)",
        borderBottom: "1px solid var(--page-border)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        padding: "0 32px",
        gap: "16px",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-100%)",
        transition: "opacity 300ms var(--os-dna-ease), transform 300ms var(--os-dna-ease)",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {/* Avatar / initials */}
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        background: "var(--page-accent)", color: "var(--page-accent-fg)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontFamily: "var(--h-font)", fontWeight: 600,
        flexShrink: 0, overflow: "hidden",
      }}>
        {avatarUrl
          ? <img src={avatarUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : initials}
      </div>
      {/* Name */}
      <span style={{ fontFamily: "var(--h-font)", fontSize: 13, fontWeight: 600, color: "var(--page-fg)" }}>
        {name}
      </span>
      {/* Dot */}
      <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--page-fg-secondary)" }} />
      {/* Section links */}
      <div style={{ display: "flex", gap: 16, overflow: "hidden" }}>
        {navSections.slice(0, 5).map(section => (
          <a
            key={section.id}
            href={`#section-${section.id}`}
            className="hover-underline-grow"
            style={{ fontSize: 12, color: "var(--page-fg-secondary)", textDecoration: "none" }}
          >
            {SECTION_LABELS[section.type] ?? section.type}
          </a>
        ))}
      </div>
    </nav>
  );
}
```

**Step 4: Wire into PageRenderer**

In `PageRenderer.tsx`, after the banners and before `OsPageWrapper`:

```tsx
import { StickyNav, shouldShowStickyNav } from "@/components/page/StickyNav";

// Inside PageRenderer, use the already-filtered `sections` (not raw config.sections)
// so StickyNav only links to sections actually rendered on the page.
const heroSection = sections.find(s => s.type === "hero");
const heroName = (heroSection?.content as any)?.name ?? "";
const heroAvatar = (heroSection?.content as any)?.avatarUrl;

// StickyNav and VisitorBanner are mutually exclusive — both are sticky/fixed top-0 z-50.
// When StickyNav is active (8+ sections, visitor), VisitorBanner must be hidden.
// This is enforced in PageRenderer JSX (not just a comment — the condition must be there).
const showStickyNav = !previewMode && !isOwner && shouldShowStickyNav(sections);
const showVisitorBanner = !isOwner && !previewMode && !showStickyNav;
```

In the Task 9 PageRenderer JSX, replace the current banner block with:

```tsx
{isOwner && !previewMode && <OwnerBanner username={config.username} />}
{showVisitorBanner && <VisitorBanner />}
{showStickyNav && <StickyNav sections={sections} name={heroName} avatarUrl={heroAvatar} />}
```

Note: `sections` is the already-filtered list from PageRenderer (`filterCompleteSections` in non-preview mode).

**Add tests for mutual exclusion** (add to `tests/evals/sticky-nav.test.ts`):

```ts
it("hides VisitorBanner when StickyNav is shown (8+ sections, visitor)", () => {
  const sections = Array.from({ length: 8 }, (_, i) => ({ type: "bio", id: String(i) }));
  const isOwner = false; const previewMode = false;
  const showStickyNav = !previewMode && !isOwner && shouldShowStickyNav(sections as any);
  const showVisitorBanner = !isOwner && !previewMode && !showStickyNav;
  expect(showStickyNav).toBe(true);
  expect(showVisitorBanner).toBe(false);
});

it("shows VisitorBanner when StickyNav is hidden (<8 sections, visitor)", () => {
  const sections = Array.from({ length: 5 }, (_, i) => ({ type: "bio", id: String(i) }));
  const isOwner = false; const previewMode = false;
  const showStickyNav = !previewMode && !isOwner && shouldShowStickyNav(sections as any);
  const showVisitorBanner = !isOwner && !previewMode && !showStickyNav;
  expect(showStickyNav).toBe(false);
  expect(showVisitorBanner).toBe(true);
});
```

**Step 5: Run tests**

```bash
npx vitest run tests/evals/sticky-nav.test.ts
```

**Step 6: Commit**

```bash
git add src/components/page/StickyNav.tsx src/components/page/PageRenderer.tsx tests/evals/sticky-nav.test.ts
git commit -m "feat(page): StickyNav — auto-shows on scroll-up for 8+ section pages"
```

---

## Task 13: BuilderNavBar Rewrite

**Files:**
- Modify: `src/components/layout/BuilderNavBar.tsx`
- Modify: `src/components/layout/SplitView.tsx` (prop rename: `onSettingsOpen` → `onPresenceOpen`)

**Step 1: Rewrite BuilderNavBar**

```tsx
// src/components/layout/BuilderNavBar.tsx
"use client";
import { useState } from "react";
import type { AuthState } from "@/app/builder/page";

// NOTE: Logout is preserved — it moves inline to the nav right side for authenticated users.
// The existing BuilderNavBar has handleLogout (POST /api/auth/logout → redirect to "/").
// Port this exact logic into the rewrite.

type BuilderNavBarProps = {
  authState?: AuthState;
  hasUnpublishedChanges: boolean;
  publishing: boolean;
  publishError: string | null;
  onPublish: () => void;
  onSignup: () => void;
  onPresenceOpen?: () => void;
  publishedUsername?: string | null;
};

export function BuilderNavBar({
  authState,
  hasUnpublishedChanges,
  publishing,
  publishError,
  onPublish,
  onSignup,
  onPresenceOpen,
  publishedUsername,
}: BuilderNavBarProps) {
  const authenticated = authState?.authenticated ?? false;
  const username = authState?.username ?? null;
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/";
    } catch {
      setLoggingOut(false);
    }
  };

  return (
    <div
      style={{
        position: "sticky", top: 0, zIndex: 50,
        height: 48, display: "flex", alignItems: "center", gap: 16,
        padding: "0 20px",
        background: "rgba(7,7,9,0.92)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Logo */}
      <a
        href="/"
        style={{
          fontFamily: "var(--font-jetbrains, monospace)", fontSize: 13,
          fontWeight: 500, color: "#e8e4de", letterSpacing: "0.02em",
          textDecoration: "none", flexShrink: 0,
        }}
      >
        openself
      </a>

      {/* Status pill */}
      {(username || publishedUsername) && (
        <a
          href={publishedUsername ? `/${publishedUsername}` : undefined}
          style={{
            fontFamily: "var(--font-jetbrains, monospace)", fontSize: 11,
            padding: "3px 10px", borderRadius: 4,
            background: "rgba(201,169,110,0.15)", color: "#c9a96e",
            textDecoration: "none", flexShrink: 0,
          }}
        >
          {publishedUsername ? `Published · ${publishedUsername}` : `Draft · ${username}`}
        </a>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Publish error */}
      {publishError && (
        <span style={{ fontSize: 12, color: "#f87171" }}>{publishError}</span>
      )}

      {/* Presence button */}
      {onPresenceOpen && (
        <button
          onClick={onPresenceOpen}
          style={{
            fontFamily: "var(--font-figtree, sans-serif)", fontSize: 12,
            fontWeight: 500, padding: "6px 14px", borderRadius: 6,
            background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)",
            border: "none", cursor: "pointer",
          }}
        >
          Presence
        </button>
      )}

      {/* Logout — visible to authenticated users, preserved from existing BuilderNavBar */}
      {authenticated && (
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            fontFamily: "var(--font-figtree, sans-serif)", fontSize: 11,
            padding: "4px 10px", borderRadius: 5, cursor: "pointer",
            background: "none", color: "rgba(255,255,255,0.35)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {loggingOut ? "…" : "Log out"}
        </button>
      )}

      {/* Publish button */}
      {hasUnpublishedChanges && !publishing && authenticated && (
        <button
          onClick={onPublish}
          style={{
            fontFamily: "var(--font-figtree, sans-serif)", fontSize: 12,
            fontWeight: 500, padding: "6px 16px", borderRadius: 6,
            background: "#c9a96e", color: "#111", border: "none", cursor: "pointer",
          }}
        >
          Publish →
        </button>
      )}
      {hasUnpublishedChanges && !publishing && !authenticated && (
        <button
          onClick={onSignup}
          style={{
            fontFamily: "var(--font-figtree, sans-serif)", fontSize: 12,
            fontWeight: 500, padding: "6px 16px", borderRadius: 6,
            background: "#c9a96e", color: "#111", border: "none", cursor: "pointer",
          }}
        >
          Sign up to publish
        </button>
      )}
      {publishing && (
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Publishing…</span>
      )}
    </div>
  );
}
```

In `SplitView.tsx`, rename `onSettingsOpen` → `onPresenceOpen` in the `BuilderNavBar` prop call.
This must happen in the same commit to prevent a compilation error from the changed prop API.

**Step 2: Commit**

```bash
git add src/components/layout/BuilderNavBar.tsx src/components/layout/SplitView.tsx
git commit -m "feat(builder): rewrite BuilderNavBar — Presence button, dark editorial style"
```

---

## Task 14: PresencePanel + MiniPreview + SignatureCombos

> **Dependency:** Task 15 (SourcesPanel/ConnectorCard) must be completed first — PresencePanel imports `@/components/sources/SourcesPanel`.

**Files:**
- Create: `src/components/presence/PresencePanel.tsx`
- Create: `src/components/presence/MiniPreview.tsx`
- Create: `src/components/presence/SignatureCombos.tsx`
- Modify: `src/components/layout/SplitView.tsx`

**Step 1: Create SignatureCombos**

```tsx
// src/components/presence/SignatureCombos.tsx
import { SIGNATURE_COMBOS } from "@/lib/presence";

type SignatureCombosProps = {
  onSelect: (surface: string, voice: string, light: string) => void;
  activeSurface: string;
  activeVoice: string;
  activeLight: string;
};

export function SignatureCombos({ onSelect, activeSurface, activeVoice, activeLight }: SignatureCombosProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {SIGNATURE_COMBOS.map(combo => {
        const isActive = combo.surface === activeSurface && combo.voice === activeVoice && combo.light === activeLight;
        return (
          <button
            key={combo.name}
            onClick={() => onSelect(combo.surface, combo.voice, combo.light)}
            style={{
              textAlign: "left", padding: "10px 14px", borderRadius: 8,
              border: `1px solid ${isActive ? "rgba(201,169,110,0.5)" : "rgba(255,255,255,0.08)"}`,
              background: isActive ? "rgba(201,169,110,0.12)" : "rgba(255,255,255,0.03)",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 500, color: isActive ? "#c9a96e" : "#e8e4de" }}>
              {combo.name}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
              {combo.for}
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

**Step 2: Create MiniPreview**

```tsx
// src/components/presence/MiniPreview.tsx
import { OsPageWrapper } from "@/components/page/OsPageWrapper";
import type { PageConfig } from "@/lib/page-config/schema";

type MiniPreviewProps = {
  config: PageConfig;
};

// MINI_CONFIG: check PageConfig for all required fields before filling this in.
// Use the PageConfig type from schema.ts to identify required vs optional fields.
// If PageConfig has a `version` field or other required fields, include them here.
// Use `satisfies PageConfig` instead of `: PageConfig` to catch missing fields at compile time.
const MINI_CONFIG = {
  username: "preview",
  // Add any other required PageConfig fields here (check schema.ts)
  sections: [
    { id: "h", type: "hero", content: { name: "Elena Vasquez", tagline: "Senior Product Designer" } },
    { id: "b", type: "bio", content: { text: "I design products at the intersection of system thinking and human warmth." } },
    { id: "s", type: "skills", content: { skills: [{ name: "Product Design", level: "expert" }, { name: "Figma" }, { name: "Systems" }] } },
  ],
  layoutTemplate: "monolith",
} satisfies PageConfig;

export function MiniPreview({ config }: MiniPreviewProps) {
  const previewConfig = { ...MINI_CONFIG, surface: config.surface, voice: config.voice, light: config.light };
  return (
    <div style={{ height: 320, overflow: "hidden", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ transform: "scale(0.5)", transformOrigin: "top left", width: "200%", height: "200%", pointerEvents: "none" }}>
        <OsPageWrapper config={previewConfig} previewMode>
          <div style={{ padding: "24px 32px" }}>
            {/* Simplified static preview — not full PageRenderer to avoid complexity */}
            <div style={{ fontFamily: "var(--h-font)", fontSize: 36, fontWeight: 600, color: "var(--page-fg)", marginBottom: 8 }}>
              Elena Vasquez
            </div>
            <div style={{ fontSize: 14, color: "var(--page-fg-secondary)", marginBottom: 24 }}>
              Senior Product Designer
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <span style={{ width: 3, height: 16, background: "var(--page-accent)", borderRadius: 2, display: "inline-block" }} />
              <span style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--page-fg)", opacity: "var(--section-label-opacity)" }}>About</span>
            </div>
            <p style={{ fontFamily: "var(--b-font)", fontSize: 14, lineHeight: 1.8, color: "var(--page-fg)", maxWidth: "58ch" }}>
              I design products at the intersection of system thinking and human warmth.
            </p>
          </div>
        </OsPageWrapper>
      </div>
    </div>
  );
}
```

**Step 3: Create PresencePanel**

```tsx
// src/components/presence/PresencePanel.tsx
"use client";
import { listSurfaces, listVoices, SIGNATURE_COMBOS } from "@/lib/presence";
import type { SurfaceDefinition, VoiceDefinition } from "@/lib/presence";
import { SignatureCombos } from "./SignatureCombos";
import { MiniPreview } from "./MiniPreview";
import { ConnectorSection } from "@/components/sources/SourcesPanel";
import type { PageConfig } from "@/lib/page-config/schema";
import { LAYOUT_TEMPLATES, type LayoutTemplateId } from "@/lib/layout/contracts";
import { getLayoutTemplate } from "@/lib/layout/registry";
import { AvatarSection } from "@/components/settings/AvatarSection";

type PresencePanelProps = {
  open: boolean;
  onClose: () => void;
  config: PageConfig | null;
  surface: string;
  voice: string;
  light: string;
  layoutTemplate: LayoutTemplateId;
  onSurfaceChange: (s: string) => void;
  onVoiceChange: (v: string) => void;
  onLightChange: (l: string) => void;
  /** Atomic: sets surface+voice+light in one API call — avoids write races when applying a combo */
  onComboSelect: (s: string, v: string, l: string) => void;
  onLayoutChange: (l: LayoutTemplateId) => void;
  onAvatarChange: () => void;
  language: string;
  /** When true, renders as a full-screen sheet (no fixed right-drawer geometry, no backdrop) — used for mobile Style tab */
  inlineFullscreen?: boolean;
};

export function PresencePanel({
  open, onClose, config,
  surface, voice, light, layoutTemplate,
  onSurfaceChange, onVoiceChange, onLightChange, onComboSelect, onLayoutChange,
  onAvatarChange, language,
  inlineFullscreen = false,
}: PresencePanelProps) {
  if (!open) return null;

  const surfaces = listSurfaces();
  const voices = listVoices();

  // Build a valid PageConfig for the preview.
  // AFTER completing Task 3 (schema update), check PageConfig for all required fields
  // and fill them in here. Use the actual required fields from the updated schema.ts.
  // The pattern below will fail to compile if required fields are missing — fix them:
  const fallbackConfig: PageConfig = {
    username: "preview",
    sections: [],
    surface,
    voice,
    light,
    layoutTemplate,
    // Add all other required PageConfig fields from schema.ts here.
    // Common required fields in this codebase include things like `sections` (already above).
    // If the TS compiler flags missing fields, add them with sensible defaults.
  };
  const previewConfig: PageConfig = config
    ? { ...config, surface, voice, light }
    : fallbackConfig;

  // inlineFullscreen = mobile Style tab: no backdrop, no fixed drawer geometry
  // Normal = desktop: right drawer with backdrop
  if (inlineFullscreen) {
    return (
      <div style={{ width: "100%", height: "100%", background: "#0e0e10", overflowY: "auto", padding: "24px 20px" }}>
        {/* Controls only (no mini preview on mobile — too small) */}
        <PresencePanelControls
          surfaces={surfaces} voices={voices}
          surface={surface} voice={voice} light={light}
          layoutTemplate={layoutTemplate}
          onSurfaceChange={onSurfaceChange} onVoiceChange={onVoiceChange} onLightChange={onLightChange}
          onComboSelect={onComboSelect}
          onLayoutChange={onLayoutChange} onAvatarChange={onAvatarChange}
          onClose={onClose}
        />
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.4)" }}
      />
      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 70,
        width: 680, background: "#0e0e10",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        display: "flex", overflow: "hidden",
      }}>
        {/* Left column: controls — shared with mobile via PresencePanelControls */}
        <div style={{ width: 280, flexShrink: 0, overflowY: "auto", padding: "24px 20px" }}>
          <PresencePanelControls
            surfaces={surfaces} voices={voices}
            surface={surface} voice={voice} light={light}
            layoutTemplate={layoutTemplate}
            onSurfaceChange={onSurfaceChange} onVoiceChange={onVoiceChange} onLightChange={onLightChange}
            onComboSelect={onComboSelect}
            onLayoutChange={onLayoutChange} onAvatarChange={onAvatarChange}
            onClose={onClose}
          />
        </div>

        {/* Right column: live preview */}
        <div style={{ flex: 1, padding: "24px 20px", borderLeft: "1px solid rgba(255,255,255,0.06)", overflowY: "auto" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>Live Preview</div>
          <MiniPreview config={previewConfig} />
        </div>
      </div>
    </>
  );
}

// PresencePanelControls: concrete shared implementation used by BOTH desktop and mobile.
// Both the left desktop column and inlineFullscreen mobile sheet call this component.
// This prevents divergence between the two render paths.
//
// BEFORE IMPLEMENTING: read src/components/settings/SettingsPanel.tsx
// and port (not duplicate) its AvatarSection and layout selector into this component.

function PresencePanelControls({
  surfaces, voices, surface, voice, light, layoutTemplate,
  onSurfaceChange, onVoiceChange, onLightChange, onComboSelect, onLayoutChange, onAvatarChange, onClose,
}: {
  surfaces: SurfaceDefinition[];
  voices: VoiceDefinition[];
  surface: string; voice: string; light: string; layoutTemplate: LayoutTemplateId;
  onSurfaceChange: (s: string) => void;
  onVoiceChange: (v: string) => void;
  onLightChange: (l: string) => void;
  /** Atomic handler for combo selection — sends all three values in a single API call, preventing write races */
  onComboSelect: (s: string, v: string, l: string) => void;
  onLayoutChange: (l: LayoutTemplateId) => void;
  onAvatarChange: () => void;
  onClose: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "#c9a96e" }}>
          Presence
        </h2>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 18 }}>×</button>
      </div>

      {/* Surface */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>Surface</div>
        {surfaces.map(s => (
          <button key={s.id} onClick={() => onSurfaceChange(s.id)}
            style={{
              width: "100%", textAlign: "left", padding: "10px 14px", borderRadius: 8, marginBottom: 6,
              border: `1px solid ${surface === s.id ? "rgba(201,169,110,0.5)" : "rgba(255,255,255,0.08)"}`,
              background: surface === s.id ? "rgba(201,169,110,0.12)" : "rgba(255,255,255,0.03)",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 500, color: surface === s.id ? "#c9a96e" : "#e8e4de" }}>{s.displayName}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{s.description.split(".")[0]}</div>
          </button>
        ))}
      </div>

      {/* Voice */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>Voice</div>
        {voices.map(v => (
          <button key={v.id} onClick={() => onVoiceChange(v.id)}
            style={{
              width: "100%", textAlign: "left", padding: "10px 14px", borderRadius: 8, marginBottom: 6,
              border: `1px solid ${voice === v.id ? "rgba(201,169,110,0.5)" : "rgba(255,255,255,0.08)"}`,
              background: voice === v.id ? "rgba(201,169,110,0.12)" : "rgba(255,255,255,0.03)",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 500, color: voice === v.id ? "#c9a96e" : "#e8e4de" }}>{v.displayName}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{v.headingFont} + {v.bodyFont}</div>
          </button>
        ))}
      </div>

      {/* Light */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>Light</div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["day", "night"] as const).map(l => (
            <button key={l} onClick={() => onLightChange(l)}
              style={{
                flex: 1, padding: "8px", borderRadius: 8, textTransform: "capitalize",
                fontSize: 12, fontWeight: 500, cursor: "pointer",
                border: `1px solid ${light === l ? "rgba(201,169,110,0.5)" : "rgba(255,255,255,0.08)"}`,
                background: light === l ? "rgba(201,169,110,0.12)" : "rgba(255,255,255,0.03)",
                color: light === l ? "#c9a96e" : "#e8e4de",
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Signature Combinations */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>Signature Combinations</div>
        <SignatureCombos activeSurface={surface} activeVoice={voice} activeLight={light}
          onSelect={onComboSelect} />
      </div>

      {/* Layout selector — same cards as SettingsPanel.tsx */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>Layout</div>
        {LAYOUT_TEMPLATES.map(t => {
          const tmpl = getLayoutTemplate(t);
          return (
            <button key={t} onClick={() => onLayoutChange(t)}
              style={{
                width: "100%", textAlign: "left", padding: "10px 14px", borderRadius: 8, marginBottom: 6,
                border: `1px solid ${layoutTemplate === t ? "rgba(201,169,110,0.5)" : "rgba(255,255,255,0.08)"}`,
                background: layoutTemplate === t ? "rgba(201,169,110,0.12)" : "rgba(255,255,255,0.03)",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 500, color: layoutTemplate === t ? "#c9a96e" : "#e8e4de" }}>{tmpl?.name ?? t}</div>
            </button>
          );
        })}
      </div>

      {/* Avatar/Photo — port AvatarSection from SettingsPanel.tsx */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>Photo</div>
        <AvatarSection onAvatarChange={onAvatarChange} />
      </div>

      {/* Sources */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>Sources</div>
        <ConnectorSection />
      </div>
    </div>
  );
}
// PresencePanelControls is used by BOTH the desktop drawer left column and the mobile inlineFullscreen sheet.
// This is the single source of truth for Surface/Voice/Light selectors.
```

**Step 4: Wire PresencePanel into SplitView**

In `SplitView.tsx`:
- Replace `settingsOpen/setSettingsOpen` with `presenceOpen/setPresenceOpen`
- Add `surface`, `voice`, `light` state (replacing `theme`, `colorScheme`, `fontFamily`)
- Remove `SettingsPanel` import, add `PresencePanel`
- Pass `onPresenceOpen={() => setPresenceOpen(true)}` to `BuilderNavBar`
- Update `displayConfig` to use `surface`, `voice`, `light` instead of legacy fields
- Update `persistStyle` calls to use new field names
- Add `handleComboSelect` for atomic combo application (prevents write races when signature combo sets all 3 axes simultaneously):
  ```ts
  const handleComboSelect = useCallback(async (s: string, v: string, l: string) => {
    setSurface(s); setVoice(v); setLight(l);
    await persistStyle({ surface: s, voice: v, light: l });
  }, [persistStyle]);
  ```
  Pass `onComboSelect={handleComboSelect}` to `PresencePanelControls` (via `PresencePanel`).

**Step 5: Commit**

```bash
git add src/components/presence/ src/components/layout/SplitView.tsx
git commit -m "feat(builder): PresencePanel replaces SettingsPanel — Surface/Voice/Light + live preview"
```

---

## Task 15: Generic ConnectorCard + SourcesPanel

> **Execute this task BEFORE Task 14** — PresencePanel imports `@/components/sources/SourcesPanel`.

**Files:**
- Create: `src/components/sources/SourcesPanel.tsx`
- Create: `src/components/sources/ConnectorCard.tsx`
- Modify: `src/lib/connectors/types.ts`

**Step 1: Extend ConnectorDefinition with UI metadata**

In `src/lib/connectors/types.ts`, add:

```ts
export type ConnectorUIDefinition = {
  id: string;
  displayName: string;
  description: string;
  authType: "oauth" | "zip_upload";
  connectUrl?: string;   // for oauth
  importUrl?: string;    // for zip
  syncUrl?: string;      // for oauth with periodic sync
  disconnectUrl: string;
};
```

Also ensure `ConnectorStatusRow` (or its equivalent — check the existing type in `types.ts`) is exported. The `ConnectorCard` component imports it. If the existing type is named differently (e.g. `ConnectorRow`), use that name consistently throughout Task 15.

**Step 2: Add UI definitions to GitHub and LinkedIn**

```ts
// src/lib/connectors/github/ui.ts
import type { ConnectorUIDefinition } from "../types";
export const GitHubUIDefinition: ConnectorUIDefinition = {
  id: "github",
  displayName: "GitHub",
  description: "Import your repositories and open-source contributions.",
  authType: "oauth",
  connectUrl: "/api/connectors/github/connect",
  syncUrl: "/api/connectors/github/sync",
  disconnectUrl: "/api/connectors/{id}/disconnect",
};

// src/lib/connectors/linkedin-zip/ui.ts
import type { ConnectorUIDefinition } from "../types";
export const LinkedInUIDefinition: ConnectorUIDefinition = {
  id: "linkedin_zip",
  displayName: "LinkedIn",
  description: "Import your work experience and education from a LinkedIn data export.",
  authType: "zip_upload",
  importUrl: "/api/connectors/linkedin-zip/import",
  disconnectUrl: "/api/connectors/{id}/disconnect",
};
```

**Step 3: Create connector UI registry**

```ts
// src/lib/connectors/ui-registry.ts
import type { ConnectorUIDefinition } from "./types";
import { GitHubUIDefinition } from "./github/ui";
import { LinkedInUIDefinition } from "./linkedin-zip/ui";

const uiRegistry = new Map<string, ConnectorUIDefinition>();

export function registerConnectorUI(def: ConnectorUIDefinition): void {
  uiRegistry.set(def.id, def);
}
export function listConnectorUIs(): ConnectorUIDefinition[] {
  return [...uiRegistry.values()];
}

// Register built-in connectors
registerConnectorUI(GitHubUIDefinition);
registerConnectorUI(LinkedInUIDefinition);
```

**Step 4: Create generic ConnectorCard**

```tsx
// src/components/sources/ConnectorCard.tsx
"use client";
import { useState } from "react";
import type { CSSProperties } from "react";
import type { ConnectorUIDefinition, ConnectorStatusRow } from "@/lib/connectors/types";

type ConnectorCardProps = {
  definition: ConnectorUIDefinition;
  status: ConnectorStatusRow | null;
  onRefresh: () => void;
};

export function ConnectorCard({ definition, status, onRefresh }: ConnectorCardProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const isConnected = status?.status === "connected";
  const hasError = status?.status === "error";

  const handleConnect = () => {
    if (definition.connectUrl) window.location.href = definition.connectUrl;
  };

  const handleSync = async () => {
    if (!definition.syncUrl || loading) return;
    setLoading(true);
    try {
      const res = await fetch(definition.syncUrl, { method: "POST" });
      const data = await res.json();
      setMessage({ text: data.success ? "Synced" : (data.error ?? "Sync failed"), type: data.success ? "success" : "error" });
      if (data.success) onRefresh();
    } catch { setMessage({ text: "Network error", type: "error" }); }
    finally { setLoading(false); setTimeout(() => setMessage(null), 3000); }
  };

  const handleDisconnect = async () => {
    if (!status?.id) return;
    const url = definition.disconnectUrl.replace("{id}", status.id);
    const res = await fetch(url, { method: "POST" });
    if (res.ok) onRefresh();
  };

  const handleImport = async () => {
    if (!definition.importUrl) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setLoading(true);
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch(definition.importUrl!, { method: "POST", body: form });
        const data = await res.json();
        setMessage({
          text: data.success ? `${data.report?.factsWritten ?? 0} facts imported` : (data.error ?? "Import failed"),
          type: data.success ? "success" : "error",
        });
        if (data.success && data.report?.factsWritten > 0) {
          window.dispatchEvent(new CustomEvent("openself:import-complete", { detail: { factsWritten: data.report.factsWritten } }));
          onRefresh();
        }
      } catch { setMessage({ text: "Upload failed", type: "error" }); }
      finally { setLoading(false); setTimeout(() => setMessage(null), 4000); }
    };
    input.click();
  };

  return (
    <div style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "#e8e4de" }}>{definition.displayName}</span>
        {isConnected && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80" }} />}
        {hasError && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f87171" }} />}
      </div>
      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 10 }}>{definition.description}</p>

      {/* Not connected */}
      {!isConnected && !hasError && (
        definition.authType === "oauth"
          ? <button onClick={handleConnect} style={btnStyle("#c9a96e", "#111")}>Connect {definition.displayName}</button>
          : <button onClick={handleImport} disabled={loading} style={btnStyle("rgba(255,255,255,0.1)", "#e8e4de")}>
              {loading ? "Importing…" : `Import ${definition.displayName} ZIP`}
            </button>
      )}

      {/* Connected (OAuth) */}
      {isConnected && definition.authType === "oauth" && (
        <div style={{ display: "flex", gap: 8 }}>
          {definition.syncUrl && (
            <button onClick={handleSync} disabled={loading} style={{ ...btnStyle("rgba(255,255,255,0.08)", "#e8e4de"), flex: 1 }}>
              {loading ? "Syncing…" : "Sync Now"}
            </button>
          )}
          <button onClick={handleDisconnect} style={btnStyle("rgba(239,68,68,0.15)", "#f87171")}>Disconnect</button>
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div>
          <p style={{ fontSize: 11, color: "#f87171", marginBottom: 8 }}>{status?.lastError}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleConnect} style={{ ...btnStyle("rgba(255,255,255,0.08)", "#e8e4de"), flex: 1 }}>Reconnect</button>
            <button onClick={handleDisconnect} style={btnStyle("rgba(239,68,68,0.15)", "#f87171")}>Disconnect</button>
          </div>
        </div>
      )}

      {/* Re-import button for zip — only shown when already imported (isConnected) */}
      {definition.authType === "zip_upload" && isConnected && (
        <button onClick={handleImport} disabled={loading} style={{ ...btnStyle("rgba(255,255,255,0.06)", "#e8e4de"), marginTop: 8, width: "100%" }}>
          {loading ? "Importing…" : "Re-import ZIP"}
        </button>
      )}

      {message && (
        <p style={{ fontSize: 11, marginTop: 8, color: message.type === "success" ? "#4ade80" : "#f87171" }}>
          {message.text}
        </p>
      )}
    </div>
  );
}

function btnStyle(bg: string, color: string): CSSProperties {
  return {
    padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 500,
    background: bg, color, border: "none", cursor: "pointer",
  };
}
```

**Step 5: Create SourcesPanel**

```tsx
// src/components/sources/SourcesPanel.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { listConnectorUIs } from "@/lib/connectors/ui-registry";
import type { ConnectorStatusRow } from "@/lib/connectors/types";
import { ConnectorCard } from "./ConnectorCard";

async function fetchStatuses(): Promise<ConnectorStatusRow[]> {
  try {
    const res = await fetch("/api/connectors/status");
    if (!res.ok) return [];
    const data = await res.json();
    return data.success ? data.connectors : [];
  } catch { return []; }
}

export function ConnectorSection() {
  const [statuses, setStatuses] = useState<ConnectorStatusRow[]>([]);
  const definitions = listConnectorUIs();

  const refresh = useCallback(async () => {
    setStatuses(await fetchStatuses());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div>
      {definitions.map(def => {
        const status = statuses.find(s => s.connectorType === def.id && s.status !== "disconnected") ?? null;
        return <ConnectorCard key={def.id} definition={def} status={status} onRefresh={refresh} />;
      })}
    </div>
  );
}
```

**Step 6: Commit**

```bash
git add src/components/sources/ src/lib/connectors/ui-registry.ts src/lib/connectors/github/ui.ts src/lib/connectors/linkedin-zip/ui.ts src/lib/connectors/types.ts
git commit -m "feat(sources): generic ConnectorCard + SourcesPanel driven by UI registry"
```

---

## Task 16: SplitView — Mobile Bottom Tab Bar

**Files:**
- Modify: `src/components/layout/SplitView.tsx`

**Step 1: Replace mobile top tabs with bottom tab bar**

Ensure these imports are present in `SplitView.tsx` (carry over from existing file):
```tsx
import { VoiceOverlay } from "@/components/voice/VoiceOverlay";
import { isVoiceEnabled } from "@/lib/voice/feature-flags";
```
Ensure `const voiceEnabled = isVoiceEnabled();` is declared in the component body (already present in current SplitView.tsx — do not remove).

In `SplitView.tsx`, find the mobile section:

```tsx
{/* Mobile: tabs — REPLACE THIS ENTIRE BLOCK */}
```

Replace with:

```tsx
{/* Mobile: bottom tab bar */}
<div className="flex h-dvh flex-col overflow-hidden md:hidden">
  {/* Content area */}
  <div className="flex-1 overflow-hidden relative">
    {/* Chat — always mounted, hidden when not active */}
    <div className={`absolute inset-0 ${activeMobileTab === "chat" ? "block" : "hidden"}`}>
      {chatDataReady && (
        <ChatPanel
          language={language}
          authV2={authState?.authV2}
          authState={authState}
          onSignupRequest={() => { setPresenceOpen(false); setSignupOpen(true); }}
          initialBootstrap={bootstrapData}
          initialMessages={chatInitialMessages}
          disableInitialFetch={chatDataReady}
          isPrimaryVoiceConsumer={isMobile}
        />
      )}
      {/* Unpublished changes banner — inside chat tab */}
      {hasUnpublishedChanges && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
          background: "#c9a96e", color: "#111",
          padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Changes ready to publish</span>
          <button onClick={handlePublish} disabled={publishing} style={{
            background: "rgba(0,0,0,0.15)", border: "none", color: "#111",
            padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>
            {publishing ? "Publishing…" : "Publish →"}
          </button>
        </div>
      )}
    </div>

    {/* Preview */}
    <div className={`absolute inset-0 overflow-y-auto ${activeMobileTab === "preview" ? "block" : "hidden"}`}>
      {previewPane}
      {voiceEnabled && <VoiceOverlay onOpenChat={() => setActiveMobileTab("chat")} />}
    </div>

    {/* Style (Presence panel as full-height sheet — inlineFullscreen on mobile) */}
    {activeMobileTab === "style" && (
      <div className="absolute inset-0 overflow-y-auto" style={{ background: "#0e0e10" }}>
        <PresencePanel
          open={true}
          onClose={() => setActiveMobileTab("chat")}
          config={config}
          surface={surface} voice={voice} light={light}
          layoutTemplate={layoutTemplate}
          onSurfaceChange={handleSurfaceChange}
          onVoiceChange={handleVoiceChange}
          onLightChange={handleLightChange}
          onLayoutChange={handleLayoutTemplateChange}
          onAvatarChange={() => { void fetchPreview(); }}
          language={language}
          inlineFullscreen={true}
        />
      </div>
    )}
  </div>

  {/* Bottom tab bar — 56px */}
  <div style={{
    height: 56, flexShrink: 0,
    background: "#111113", borderTop: "1px solid rgba(255,255,255,0.07)",
    display: "flex",
  }}>
    {[
      { id: "chat", label: "Chat", icon: <ChatIcon /> },
      { id: "preview", label: "Preview", icon: <PreviewIcon /> },
      { id: "style", label: "Style", icon: <StyleIcon /> },
    ].map(tab => (
      <button
        key={tab.id}
        onClick={() => setActiveMobileTab(tab.id as any)}
        style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 4, border: "none", background: "none", cursor: "pointer",
          fontFamily: "var(--font-jetbrains, monospace)", fontSize: 9, letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: activeMobileTab === tab.id ? "#c9a96e" : "rgba(255,255,255,0.35)",
        }}
      >
        {tab.icon}
        {tab.label}
      </button>
    ))}
  </div>
</div>
```

Add `activeMobileTab` state: `const [activeMobileTab, setActiveMobileTab] = useState<"chat" | "preview" | "style">("chat");`

Add simple SVG icon components inline or in a separate `icons.ts` file.

Update state management: replace `theme/colorScheme/fontFamily` with `surface/voice/light`. Remove `SettingsPanel` entirely. Add `PresencePanel` with the three new state handlers.

**Step 2: Update persistStyle calls**

In `SplitView.tsx`, `persistStyle()` calls now send `{ surface, voice, light, layoutTemplate }` — remove old `theme`, `style.colorScheme`, `style.fontFamily`.

**Step 3: Commit**

```bash
git add src/components/layout/SplitView.tsx
git commit -m "feat(builder): mobile bottom tab bar — Chat/Preview/Style, publish banner in chat"
```

---

## Task 17: Clean Cut — Remove Legacy Files

**Files to delete:**
- `src/themes/editorial-360/Layout.tsx` — replaced by `OsPageWrapper`
- `src/themes/editorial-360/index.ts` — replaced by `SECTION_COMPONENTS` registry
- `src/themes/index.ts` — no longer needed
- `src/themes/types.ts` — `ThemeRegistryItem`, `ThemeLayoutProps` types no longer needed (or keep `SectionProps` if still used)
- `src/components/settings/SettingsPanel.tsx` — replaced by `PresencePanel`
- `src/components/settings/ConnectorSection.tsx` — replaced by `SourcesPanel`

**Note:** Keep `src/themes/editorial-360/components/` — these section components are still used via `src/components/sections/index.ts`. They will be cleaned up progressively.

**Step 1: Delete files**

```bash
rm src/themes/editorial-360/Layout.tsx
rm src/themes/editorial-360/index.ts
rm src/themes/index.ts
rm src/components/settings/SettingsPanel.tsx
rm src/components/settings/ConnectorSection.tsx
```

**Step 2: Check for remaining imports**

```bash
grep -rn "getTheme\|ThemeRegistryItem\|SettingsPanel\|ConnectorSection\|from.*themes/index\|from.*themes/editorial-360/index" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
```

Fix any remaining imports.

**Step 3: Build check**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove legacy theme system, SettingsPanel, ConnectorSection"
```

---

## Task 18: Magic Paste — Agent URL Detection

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/lib/agent/context.ts`
- Create: `tests/evals/magic-paste.test.ts`

**Step 1: Write failing tests**

```ts
// tests/evals/magic-paste.test.ts
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
```

**Step 2: Run to verify failure**

```bash
npx vitest run tests/evals/magic-paste.test.ts
```

**Step 3: Implement**

```ts
// src/lib/connectors/magic-paste.ts
const URL_PATTERN = /https?:\/\/[^\s,)>"]+/g;

const DOMAIN_TO_CONNECTOR: Record<string, string> = {
  "github.com": "github",
  "www.github.com": "github",
  "linkedin.com": "linkedin_zip",
  "www.linkedin.com": "linkedin_zip",
};

export type DetectedConnector = {
  connectorId: string;
  url: string;
};

export function detectConnectorUrls(text: string): DetectedConnector[] {
  const urls = text.match(URL_PATTERN) ?? [];
  const results: DetectedConnector[] = [];
  for (const url of urls) {
    try {
      const hostname = new URL(url).hostname;
      const connectorId = DOMAIN_TO_CONNECTOR[hostname];
      if (connectorId) results.push({ connectorId, url });
    } catch { /* invalid URL */ }
  }
  return results;
}
```

**Step 4: Wire into chat context**

In `src/lib/agent/context.ts`, in `buildContext()` (or `assembleContext()` — check the function signature
in the file), after extracting the latest user message, add:

```ts
import { detectConnectorUrls } from "@/lib/connectors/magic-paste";

// In buildContext() / assembleContext(), after reading the userMessage:
const detectedConnectors = detectConnectorUrls(userMessage);
const magicPasteHint = detectedConnectors.length > 0
  ? `\nDETECTED SOURCE URLS: ${detectedConnectors.map(d => `${d.connectorId} (${d.url})`).join(", ")}. If relevant, suggest the user connect it as a Source via the Sources panel.`
  : "";
// Append magicPasteHint to the system context string.
```

Also in `src/app/api/chat/route.ts`, ensure the user message text is passed to `buildContext()` /
`assembleContext()` before streaming — this is where the userMessage variable is in scope.
Read `src/app/api/chat/route.ts` and `src/lib/agent/context.ts` to find the exact insertion point.

**Step 5: Add integration test**

In `tests/evals/magic-paste.test.ts`, add a test that calls `detectConnectorUrls` with a GitHub URL
and asserts `[{ connectorId: "github", url: "https://github.com/elena" }]` is returned.

Also add a smoke test that the hint string appears in the assembled context when a GitHub URL is present.

**Step 6: Run tests**

```bash
npx vitest run tests/evals/magic-paste.test.ts
```

**Step 7: Commit**

```bash
git add src/lib/connectors/magic-paste.ts tests/evals/magic-paste.test.ts \
        src/lib/agent/context.ts src/app/api/chat/route.ts
git commit -m "feat(connectors): magic paste URL detection for agent context"
```

---

## Task 19: Fix Broken Tests

**Step 1: Run full test suite and collect failures**

```bash
npx vitest run 2>&1 | grep -E "^tests|FAIL" | head -50
```

**Step 2: Fix test files referencing legacy fields**

For each failing test file, replace:
- `theme: "minimal"` → `surface: "canvas", voice: "signal", light: "day"`
- `theme: "warm"` → `surface: "clay", voice: "signal", light: "day"`
- `theme: "editorial-360"` → `surface: "archive", voice: "narrative", light: "day"`
- `colorScheme: "light"` → remove (no equivalent — light is per-surface)
- `colorScheme: "dark"` → `light: "night"`
- `fontFamily: "inter"` → remove
- `AVAILABLE_THEMES` references → `listSurfaces().map(s => s.id)`

**Step 3: Run test suite again**

```bash
npx vitest run 2>&1 | tail -10
```

Target: all tests pass.

**Step 4: Commit**

```bash
git add -A
git commit -m "test: update all tests for Presence System — remove legacy theme references"
```

---

## Task 20: Final Verification

**Step 1: Full test suite**

```bash
npx vitest run
```
Expected: all tests pass.

**Step 2: Build check**

```bash
npm run build
```
Expected: no TypeScript errors, no build failures.

**Step 3: Dev server smoke test**

```bash
npm run dev
```

Manually verify:
- [ ] `/builder` loads — dark top bar with "openself" logo, "Presence" button, "Publish →"
- [ ] Presence button opens the panel — surface/voice/light selectors + mini preview + signature combos + sources
- [ ] Selecting a Signature Combo updates the mini preview in real time
- [ ] GitHub Connect button redirects to OAuth
- [ ] LinkedIn shows "Import ZIP" button
- [ ] Mobile layout has bottom tab bar (Chat / Preview / Style)
- [ ] A published page with 8+ sections shows sticky nav on scroll-up
- [ ] Canvas surface: white bg, black accent, no grain, no edge lines
- [ ] Clay surface: cream bg, terracotta accent, grain visible
- [ ] Archive surface: white bg, navy accent, grain + edge lines
- [ ] Narrative voice: Cormorant Garamond headings, Lato body
- [ ] Terminal voice: JetBrains Mono everywhere
- [ ] Night mode: surface-specific dark palette (Clay Night ≠ Canvas Night)

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: Design DNA full redesign complete — Presence System, Monolith DNA, Builder UX, Sources"
```
