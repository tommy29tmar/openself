// src/lib/presence/registry.ts
export type SurfaceDefinition = {
  id: string;
  displayName: string;
  description: string;
  cssClass: string;        // e.g. "surface-canvas"
  readingMax: number;      // e.g. 660
  sectionLabelOpacity: number;
};

export type VoiceDefinition = {
  id: string;
  displayName: string;
  headingFont: string;
  bodyFont: string;
  cssClass: string;        // e.g. "voice-signal"
  description: string;
};

const surfaceRegistry = new Map<string, SurfaceDefinition>();
const voiceRegistry = new Map<string, VoiceDefinition>();

export function registerSurface(def: SurfaceDefinition): void {
  surfaceRegistry.set(def.id, def);
}

export function registerVoice(def: VoiceDefinition): void {
  voiceRegistry.set(def.id, def);
}

export function getSurface(id: string): SurfaceDefinition | undefined {
  return surfaceRegistry.get(id);
}

export function getVoice(id: string): VoiceDefinition | undefined {
  return voiceRegistry.get(id);
}

export function listSurfaces(): SurfaceDefinition[] {
  return Array.from(surfaceRegistry.values());
}

export function listVoices(): VoiceDefinition[] {
  return Array.from(voiceRegistry.values());
}

export function isValidSurface(id: string): boolean {
  return surfaceRegistry.has(id);
}

export function isValidVoice(id: string): boolean {
  return voiceRegistry.has(id);
}

export function isValidLight(value: string): boolean {
  return value === "day" || value === "night";
}
