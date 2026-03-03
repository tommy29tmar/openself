// src/lib/presence/voices.ts
import { registerVoice } from "./registry";

registerVoice({
  id: "signal",
  displayName: "Signal",
  headingFont: "Plus Jakarta Sans",
  bodyFont: "Figtree",
  cssClass: "voice-signal",
  description: "Geometric sans throughout. Maximum clarity and contemporary authority.",
});

registerVoice({
  id: "narrative",
  displayName: "Narrative",
  headingFont: "Cormorant Garamond",
  bodyFont: "Lato",
  cssClass: "voice-narrative",
  description: "Serif headings meet humanist body text. Warmth, craft, and editorial depth.",
});

registerVoice({
  id: "terminal",
  displayName: "Terminal",
  headingFont: "JetBrains Mono",
  bodyFont: "JetBrains Mono",
  cssClass: "voice-terminal",
  description: "Monospace throughout. For engineers who let their work be the aesthetic.",
});
