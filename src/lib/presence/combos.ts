// src/lib/presence/combos.ts
export const SIGNATURE_COMBOS = [
  { surface: "canvas",  voice: "signal",    light: "day",   name: "Default Professional", for: "Most users. Maximum clarity." },
  { surface: "canvas",  voice: "terminal",  light: "night", name: "The Developer",        for: "Engineers, open-source contributors." },
  { surface: "clay",    voice: "narrative", light: "day",   name: "Artisan Editorial",    for: "Designers, writers, architects." },
  { surface: "clay",    voice: "signal",    light: "night", name: "Warm Modern",          for: "Startup designers, product managers." },
  { surface: "archive", voice: "narrative", light: "day",   name: "Luxury Magazine",      for: "The full OpenSelf statement." },
  { surface: "archive", voice: "narrative", light: "night", name: "Noir Editorial",       for: "Photographers, filmmakers, artists." },
] as const;
