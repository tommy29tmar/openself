// src/lib/presence/prompt-builder.ts
import "./surfaces";
import "./voices";
import { listSurfaces, listVoices } from "./registry";
import { SIGNATURE_COMBOS } from "./combos";

/**
 * Generates the Presence System reference block for agent system prompts.
 * Called by buildSystemPrompt() in prompts.ts — replaces the static theme block.
 * Always reflects the current registry — no stale data possible.
 */
export function buildPresenceReference(): string {
  const surfaces = listSurfaces();
  const voices = listVoices();

  const surfaceList = surfaces
    .map(s => `  - ${s.id} (${s.displayName}): ${s.description}`)
    .join("\n");

  const voiceList = voices
    .map(v => `  - ${v.id} (${v.displayName}): ${v.headingFont} + ${v.bodyFont}. ${v.description}`)
    .join("\n");

  const comboList = SIGNATURE_COMBOS
    .map(c => `  - ${c.name}: surface=${c.surface}, voice=${c.voice}, light=${c.light} — ${c.for}`)
    .join("\n");

  return `## PRESENCE SYSTEM

The page visual identity is controlled by three orthogonal axes:

**surface** — controls background color, texture, and accent color:
${surfaceList}

**voice** — controls typography:
${voiceList}

**light** — controls day/night palette per surface:
  - day: the surface's standard palette
  - night: the surface's dark variant (each surface has its own night palette)

**Signature Combinations** (recommended presets — apply with update_page_style):
${comboList}

When the user asks to change style, appearance, or "vibe", use update_page_style with surface, voice, and/or light.
Suggest a Signature Combination when appropriate. Never invent surface/voice values not listed above.`;
}
