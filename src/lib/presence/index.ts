// src/lib/presence/index.ts
// Side-effect imports ensure surfaces/voices are registered before consumers call list/get functions.
import "./surfaces";
import "./voices";

export { registerSurface, registerVoice, getSurface, getVoice, listSurfaces, listVoices, isValidSurface, isValidVoice, isValidLight } from "./registry";
export type { SurfaceDefinition, VoiceDefinition } from "./registry";
export { SIGNATURE_COMBOS } from "./combos";
