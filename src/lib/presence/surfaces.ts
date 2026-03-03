// src/lib/presence/surfaces.ts
import { registerSurface } from "./registry";

registerSurface({
  id: "canvas",
  displayName: "Canvas",
  description: "Clean white ground. Maximum signal. No texture, no grain — thought and work speak unmediated.",
  cssClass: "surface-canvas",
  readingMax: 660,
  sectionLabelOpacity: 0.45,
});

registerSurface({
  id: "clay",
  displayName: "Clay",
  description: "Warm parchment ground. Subtle grain and edge lines add presence without loudness.",
  cssClass: "surface-clay",
  readingMax: 680,
  sectionLabelOpacity: 0.5,
});

registerSurface({
  id: "archive",
  displayName: "Archive",
  description: "Pure white luxury ground. Stronger grain and ink-black type. The full editorial statement.",
  cssClass: "surface-archive",
  readingMax: 700,
  sectionLabelOpacity: 0.55,
});
