# Monolith Layout — Fix Plan

**Riferimento visivo:** `docs/reference/monolith-prototype.png`
**Riferimento HTML:** `public/prototype.html` → `http://localhost:3000/prototype.html`

---

## HERO

### FIX-01 · Avatar troppo piccolo
**Problema:** l'avatar mostra le iniziali in un cerchio di circa 36-40px.
**Atteso:** `width: 80px; height: 80px; font-size: 22px; font-weight: 600`
**File:** `src/components/page/HeroSection.tsx`
**Specifiche CSS prototipo:**
```css
.os-avatar {
  width: 80px; height: 80px;
  border-radius: 50%;
  background: var(--page-accent);
  color: var(--page-accent-fg);
  font-family: var(--h-font);
  font-size: 22px; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
```

---

### FIX-02 · Hero senza respiro superiore
**Problema:** il contenuto dell'hero inizia subito in alto, nessuno spazio vuoto sopra.
**Atteso:** grande area bianca sopra (~200px), contenuto allineato in basso.
**File:** `src/components/page/HeroSection.tsx`
**Specifiche CSS prototipo:**
```css
.os-hero {
  min-height: 480px;
  display: flex;
  align-items: flex-end;          /* contenuto ancorato in basso */
  padding: 0 48px 56px;
  background: var(--page-bg);
  border-bottom: 1px solid var(--page-border);
  position: relative; z-index: 1;
}
.os-hero-inner { max-width: var(--reading-max); /* 660px */ }
```

---

### FIX-03 · Chip pills + riga contatti (mail + icone social)
**Struttura attesa sotto il nome/tagline:**
```
[Milano, IT]  [Available]  [8 yrs exp.]  [IT · EN]     ← chip pills

hello@example.com   [gh]  [in]  [tw]  [↗]              ← riga contatti
```

**Riga 1 — chip pills:** `location` · `availability` · `N yrs exp.` · lingue native/fluenti (max 2). Stile pill discreto.

**Riga 2 — contatti:** email come testo linkabile + icone social solo-simbolo. Le icone sono SVG o caratteri Unicode (~18px), `color: var(--page-fg2)`, `opacity: 0.6`, `hover: opacity: 1; color: var(--page-fg)`. `target="_blank"`. Nessuna label testuale.

- Piattaforme supportate: GitHub (`gh`), LinkedIn (`in`), Twitter/X (`𝕏`), website (`↗`), email come `<a href="mailto:...">`.
- Se solo email e nessun social → mostrare solo email.
- Se nessuna mail ma social → mostrare solo icone.
- Se nessuno dei due → riga contatti non appare.

**Sezione `social` e `contact` nel corpo pagina → rimosse completamente.** Tutto il contatto è nell'hero.

**Specifiche CSS:**
```css
.os-hero-chip {
  font-family: var(--b-font);
  font-size: 12px;
  color: var(--page-fg2);
  background: var(--page-muted);
  padding: 5px 12px;
  border-radius: 20px;
  border: 1px solid var(--page-border);
}
.os-hero-meta {
  display: flex; gap: 16px;
  margin-top: 20px; flex-wrap: wrap;
}
.os-hero-contact {
  display: flex; align-items: center; gap: 14px;
  margin-top: 12px;
}
.os-hero-email {
  font-size: 12px;
  color: var(--page-fg2);
  opacity: 0.7;
  text-decoration: none;
}
.os-hero-email:hover { opacity: 1; }
.os-hero-social-icon {
  font-size: 16px;
  color: var(--page-fg2);
  opacity: 0.6;
  text-decoration: none;
  line-height: 1;
  transition: opacity 0.15s;
}
.os-hero-social-icon:hover { opacity: 1; color: var(--page-fg); }
```
**File:** `src/components/page/HeroSection.tsx`

---

### FIX-04 · Nome hero — dimensione e peso
**Problema:** il nome potrebbe essere leggermente più piccolo del prototipo.
**Atteso:**
```css
.os-hero-name {
  font-family: var(--h-font);
  font-weight: 600;
  font-size: clamp(32px, 5vw, 52px);
  line-height: 1.05;
  color: var(--page-fg);
}
```
**File:** `src/components/page/HeroSection.tsx`

---

## SEZIONI — STRUTTURA GENERALE

### FIX-05 · Padding sezioni uniforme
**Problema:** alcune sezioni hanno indentazione irregolare, sembrano in una colonna centrale invece che full-width con padding.
**Atteso:** ogni sezione ha `padding: 48px 48px` (top/bottom 48px, left/right 48px), `border-bottom: 1px solid var(--page-border)`.
**File:** `src/components/layout-templates/MonolithLayout.tsx` e componenti sezione singola
```css
.os-section { padding: 48px 48px; border-bottom: 1px solid var(--page-border); }
.os-section.reading { max-width: calc(var(--reading-max) + 96px); /* 660+96=756px */ }
.os-section.bleed  { max-width: calc(var(--reading-max) * 1.35 + 96px); }
```

---

### FIX-06 · Section label — stile preciso
**Atteso:**
```css
.os-section-label {
  display: flex; align-items: center; gap: 10px;
  font-family: var(--b-font);
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--page-fg);
  opacity: var(--section-label-opacity); /* 0.6 su Canvas */
  margin-bottom: 24px;
}
.os-section-label::before {
  content: '';
  display: block; flex-shrink: 0;
  width: 3px; height: 16px;
  background: var(--page-accent);
  border-radius: 2px;
}
```
**File:** `src/components/layout-templates/MonolithLayout.tsx` (o CSS globale page)

---

## AT A GLANCE

### FIX-07 · Rimuovere la sezione "At a Glance"
**Problema:** la sezione con le statistiche numeriche (es. "37 Services Supported", "41% P1 Incidents Reduced") e i gruppi skill (Backend/Infra/Languages/Other) non esiste nel prototipo.
**Atteso:** rimuovere completamente questa sezione dal MonolithLayout.
Le skill vanno nella sezione `| SKILLS` dedicata (FIX-12).
**File:** `src/components/layout-templates/MonolithLayout.tsx`, `src/components/page/sections/AtAGlanceSection.tsx` (o equivalente)
> ⚠️ Eventuale alternativa: se si vuole mantenere le statistiche, condensarle in piccolo dentro la sezione Skills (sotto le pill) come riga di meta, non come sezione standalone.

---

## EXPERIENCE & EDUCATION

### FIX-08 · Dot bullet su ogni entry
**Problema:** nessun marcatore visivo prima del titolo job/education.
**Atteso:** cerchio `8×8px`, `background: var(--page-accent)`, `opacity: 0.5`, `margin-top: 7px`, `flex-shrink: 0`.
```css
.os-entry-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--page-accent);
  opacity: 0.5;
  margin-top: 7px;
  flex-shrink: 0;
}
.os-entry-header {
  display: flex; align-items: flex-start;
  gap: 16px; margin-bottom: 8px;
}
```
**File:** componenti ExperienceSection, EducationSection

---

### FIX-09 · Formato titolo entry: "Ruolo — Azienda"
**Problema:** il titolo mostra solo il ruolo, l'azienda è su una riga separata come sotto-voce.
**Atteso:** `"Senior Product Designer — Figma"` — ruolo + em-dash + azienda su **una riga**, `font-size: 17px`, `font-weight: 600`, `color: var(--page-fg)`.
La riga successiva è il meta: `"2021 – Present · Berlin, DE"` — `font-size: 13px`, `color: var(--page-fg2)`.
**File:** componenti ExperienceSection, EducationSection

---

### FIX-10 · Rimuovere badge "CURRENT" / "Attuale"
**Problema:** c'è un badge colorato "CURRENT" / "Attuale" accanto alla data.
**Atteso:** la data è solo testo semplice: `"2023 – Present"` senza badge. Se si vuole indicare il job corrente, usare `"Present"` nella stringa della data.
**File:** componenti ExperienceSection

---

### FIX-11 · Accordion — mostra max 2 entry, redesign dello stile
**Decisione:** mantenere l'accordion, ma:
- Mostrare sempre le **2 entry più recenti** (non solo la prima).
- Le entry nascoste sono collassate in un accordion sotto.
- **Nuovo stile accordion:** non più il testo grigio inline `▼ "Senior SRE @ Cloudyard, Software Engineer @ Waypoint Labs"`. Invece un bottone discreto tipo:
  ```
  ▾  2 more roles
  ```
  Stile: `font-size: 12px`, `color: var(--page-fg2)`, `opacity: 0.6`, nessun bordo, sfondo trasparente, cursore pointer, `letter-spacing: 0.05em`, allineato a sinistra con `padding-left: 24px` (sotto il dot).
- Le entry espanse usano lo stesso stile delle entry visibili (dot + titolo + meta + body).
- **Stessa logica per Education:** mostrare max 2 entry recenti, accordion per le altre.
**File:** componenti ExperienceSection, EducationSection

---

## PROJECTS

### FIX-12 · Grid 2 colonne con card
**Problema:** i progetti sono in una lista verticale lineare senza card.
**Atteso:** grid 2 colonne, ogni progetto è una card.
```css
.os-projects {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.os-project-card {
  background: var(--page-card-bg);
  border: 1px solid var(--page-border);
  border-radius: 10px;
  padding: 20px;
}
.os-project-title {
  font-family: var(--h-font);
  font-size: 16px; font-weight: 600;
  color: var(--page-fg);
  margin-bottom: 8px;
}
.os-project-desc {
  font-size: 13px; color: var(--page-fg2); line-height: 1.6;
}
.os-project-tags { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
.os-project-tag {
  font-family: var(--b-font); font-size: 11px;
  color: var(--page-accent);
  background: var(--page-muted);
  padding: 3px 9px; border-radius: 10px;
  border: 1px solid var(--page-border);
}
```
**File:** `src/components/page/sections/ProjectsSection.tsx`

---

### FIX-13 · Accordion progetti — mostra 4, poi accordion
**Decisione:** mostrare i **4 progetti più rilevanti** (preferibilmente quelli collegati alle 2 experience/education visibili). I progetti aggiuntivi collassati in accordion con lo stesso stile discreto definito in FIX-11:
```
▾  3 more projects
```
**File:** `src/components/page/sections/ProjectsSection.tsx`

---

## SKILLS

### FIX-14 · Sezione Skills come sezione standalone
**Problema:** le skill sono dentro "At a Glance", non hanno una sezione dedicata.
**Atteso:** sezione `| SKILLS` propria, con le skill come pills in `flex-wrap`.
```css
.os-skills { display: flex; flex-wrap: wrap; gap: 8px; }
.os-skill {
  font-family: var(--b-font); font-size: 12px; font-weight: 500;
  padding: 6px 14px; border-radius: 20px;
  border: 1px solid var(--page-border);
  background: var(--page-muted); color: var(--page-fg);
}
.os-skill.accent {
  background: var(--page-accent);
  color: var(--page-accent-fg);
  border-color: var(--page-accent);
}
```
**Logica accent:** le prime 2 skill (o quelle più rilevanti / core della persona) usano la classe `.accent`.
**File:** `src/components/page/sections/SkillsSection.tsx`, `src/components/layout-templates/MonolithLayout.tsx`

---

## READING / MUSIC

### FIX-15 · Lista verticale uniforme + accordion
**Decisione:** formato **sempre lista verticale** — titolo + autore/artista + nota opzionale. Nessun formato dinamico per voce: la struttura è identica per tutti gli item della sezione.

```
Accelerate
Gene Kim, Jez Humble, Nicole Forsgren
Still the best book on delivery performance.   ← solo se c'è la nota

Team Topologies
Matthew Skelton, Manuel Pais
                                               ← nessuna nota → niente terza riga
In Rainbows
Radiohead
```

**CSS:**
```css
.os-reading-item { margin-bottom: 24px; }
.os-reading-title {
  font-size: 15px; font-weight: 600;
  color: var(--page-fg); line-height: 1.3;
}
.os-reading-author {
  font-size: 13px; color: var(--page-fg2);
  margin-top: 2px;
}
.os-reading-note {
  font-size: 13px; color: var(--page-fg2);
  margin-top: 6px; line-height: 1.5;
  opacity: 0.8;
}
```
Nessun dot bullet, nessuna card border. Separazione visiva solo tramite `margin-bottom: 24px`.

**Accordion:** mostrare max **3 item** visibili. Se ce ne sono di più:
```
▾  4 more books      (o "more tracks" per Music)
```
Stile accordion identico a FIX-11: `font-size: 12px`, `opacity: 0.6`, no bordo, no sfondo.

**File:** `src/themes/editorial-360/components/Reading.tsx`, `src/themes/editorial-360/components/Music.tsx`

---

### FIX-16 · Spaziatura reading/music — eliminare gli spazi enormi
**Problema:** ogni voce ha uno spazio enorme. Il `padding: 48px` del wrapper viene applicato alle voci interne.
**Atteso:** `margin-bottom: 24px` tra le voci. `padding: 48px` solo sul wrapper sezione.
**File:** `src/themes/editorial-360/components/Reading.tsx`, `src/themes/editorial-360/components/Music.tsx`

---

## ACTIVITIES / ACHIEVEMENTS / INTERESTS

### FIX-17 · Activities — pills uniforme + accordion
**Decisione:** Activities usa **sempre pills** — formato uniforme per tutti gli item della sezione, indipendentemente da quante info ci sono.

```
[Rock climbing]  [Running]  [Open source]  [Photography]  [Hiking]  [Jazz]
```

Se un'activity ha descrizione/frequenza, queste **non cambiano il layout** — rimane pill. La descrizione può essere esposta come `title` attribute (tooltip) sulla pill.

Ogni pill: `font-size: 12px`, `padding: 6px 14px`, `border-radius: 20px`, `border: 1px solid var(--page-border)`, `background: var(--page-muted)`.

**Accordion:** mostrare max **6 pills** visibili. Se ce ne sono di più:
```
▾  3 more
```

**File:** `src/themes/editorial-360/components/Activities.tsx`

---

### FIX-17b · Achievements — dot bullet + stile entry (come Experience, senza azienda)
**Atteso:** ogni achievement ha dot bullet `8×8px accent opacity 0.5` + titolo `17px bold` + meta riga (anno/contesto) `13px var(--page-fg2)` + descrizione opzionale. Nessun badge. `margin-bottom: 32px` tra entry. Max 3 visibili, accordion per il resto.
**File:** `src/themes/editorial-360/components/Achievements.tsx`

---

### FIX-18 · Interests — pills uniforme + accordion (identico ad Activities)
**Decisione:** Interests usa **sempre pills**, stesso formato di Activities. Max **6 pills** visibili, accordion per il resto.

```
[Philosophy]  [Cinema]  [Urbanism]  [Cooking]  [Chess]
```

**File:** `src/themes/editorial-360/components/Interests.tsx`

---

## LANGUAGES

### FIX-19 · Languages — pill coppie con livello
**Atteso:** ogni lingua come pill orizzontale, formato `"Italian · Native"` o `"English · Fluent"`. Stesso stile delle skill pills (no accent).
```
[Italian · Native]  [English · Fluent]  [French · Intermediate]
```
`flex-wrap: wrap; gap: 8px`. Pill: `font-size: 12px`, `padding: 6px 14px`, `border-radius: 20px`, `border: 1px solid var(--page-border)`, `background: var(--page-muted)`.
**File:** `src/themes/editorial-360/components/Languages.tsx`

---

## STATS

### FIX-20 · Stats standalone — da valutare
**Problema:** `Stats` è una sezione che mostra numeri grandi tipo "37 Services Supported" — appare raramente ma può arrivare dalle memories.
**Decisione:** Se il monolith genera una sezione `stats`, renderla come riga compatta in cima alla sezione Skills (non come sezione standalone propria). Se non c'è una sezione Skills, mostrarla come riga di pillole numeriche discrete.
**Alternativa pragmatica:** la sezione `at-a-glance` viene rimossa (FIX-07) e il composer smette di generare `stats` standalone — verificare nel composer che non venga generata.
**File:** `src/themes/editorial-360/components/Stats.tsx`, `src/lib/services/page-composer.ts`

---

## SOCIAL / CONTACT

### FIX-21 · Social — rimuovere come sezione (contenuto migrato nell'hero)
**Decisione:** la sezione `social` nel corpo pagina viene **rimossa completamente**. I link social sono mostrati come icone nell'hero accanto all'email (FIX-03). Il composer non deve generare sezioni di tipo `social` per Monolith.
**Azione:** il componente `Social.tsx` resta per altri layout ma MonolithLayout non lo monta. Verificare che `page-composer.ts` non generi `social` sections per template `monolith`.
**File:** `src/components/layout-templates/MonolithLayout.tsx` (non montare), `src/lib/services/page-composer.ts` (non generare)

---

### FIX-22 · Contact — rimuovere come sezione (contenuto migrato nell'hero)
**Decisione:** stessa logica di FIX-21. La sezione `contact` viene **rimossa** dal corpo pagina Monolith. Email e contatti sono già nell'hero (FIX-03). Il composer non deve generare sezioni `contact` per Monolith.
**File:** `src/components/layout-templates/MonolithLayout.tsx` (non montare), `src/lib/services/page-composer.ts` (non generare)

---

## TIMELINE

### FIX-23 · Timeline — stessa struttura di Experience
**La sezione `timeline` è un contenitore generico.** Va trattata esattamente come Experience: dot bullet + `"Titolo — Sottotitolo"` + meta data + descrizione + accordion se più di 2 item.
**File:** `src/themes/editorial-360/components/Timeline.tsx`

---

## CUSTOM

### FIX-24 · Custom — nessuna modifica strutturale
La sezione `custom` è per contenuti one-off. Struttura attuale (titolo section-label + corpo testo) va bene. Verificare solo che `padding: 48px` e `border-bottom` siano applicati dal wrapper MonolithLayout.
**File:** nessun cambio al componente, solo ereditato da FIX-05.

---

## FOOTER

### FIX-25 · Footer: testo minuscolo
**Problema:** "OPENSELF.DEV" è tutto maiuscolo.
**Atteso:** "openself.dev" — lowercase, `font-size: 12px`, `opacity: 0.4`, centrato.
```css
.os-footer {
  padding: 32px 48px;
  display: flex; align-items: center; justify-content: center;
  border-top: 1px solid var(--page-border);
}
.os-signature {
  font-family: var(--b-font); font-size: 12px;
  color: var(--page-fg); opacity: 0.4;
  text-decoration: none; letter-spacing: 0.05em;
}
```
**File:** `src/components/page/MonolithLayout.tsx` o footer component

---

## Ordine di implementazione consigliato

| Priorità | Fix | Impatto visivo |
|---|---|---|
| 1 | FIX-07 | Rimuovi At a Glance — libera tanto spazio |
| 2 | FIX-12 + FIX-13 | Projects grid 2col + card + accordion |
| 3 | FIX-11 | Experience accordion — nuova logica e stile |
| 4 | FIX-08 + FIX-09 + FIX-10 | Experience: dot + titolo + rimuovi badge |
| 5 | FIX-15 + FIX-16 | Reading/Music: layout dinamico + spaziatura |
| 6 | FIX-14 | Skills sezione standalone |
| 7 | FIX-01 + FIX-02 + FIX-03 + FIX-04 | Hero: avatar + spazio + chip pills |
| 8 | FIX-05 + FIX-06 | Padding sezioni + section label |
| 9 | FIX-17 + FIX-17b + FIX-18 | Activities/Achievements/Interests — layout dinamico |
| 10 | FIX-19 | Languages — pill coppie |
| 11 | FIX-20 + FIX-21 + FIX-22 | Stats/Social/Contact — semplificazione |
| 12 | FIX-23 | Timeline — stessa struttura Experience |
| 13 | FIX-25 | Footer testo minuscolo |

---

## File da modificare

| File | Fix |
|---|---|
| `src/components/page/HeroSection.tsx` | FIX-01, 02, 03, 04 |
| `src/components/layout-templates/MonolithLayout.tsx` | FIX-05, 06, 07, 14 |
| `src/themes/editorial-360/components/Experience.tsx` | FIX-08, 09, 10, 11 |
| `src/themes/editorial-360/components/Education.tsx` | FIX-08, 09, 11 |
| `src/themes/editorial-360/components/Projects.tsx` | FIX-12, 13 |
| `src/themes/editorial-360/components/Skills.tsx` | FIX-14 |
| `src/themes/editorial-360/components/Reading.tsx` | FIX-15, 16 |
| `src/themes/editorial-360/components/Music.tsx` | FIX-15, 16 |
| `src/themes/editorial-360/components/Activities.tsx` | FIX-17 |
| `src/themes/editorial-360/components/Achievements.tsx` | FIX-17b |
| `src/themes/editorial-360/components/Interests.tsx` | FIX-18 |
| `src/themes/editorial-360/components/Languages.tsx` | FIX-19 |
| `src/themes/editorial-360/components/Stats.tsx` | FIX-20 |
| `src/themes/editorial-360/components/Social.tsx` | FIX-21 |
| `src/themes/editorial-360/components/Footer.tsx` | FIX-21, 25 |
| `src/themes/editorial-360/components/Contact.tsx` | FIX-22 |
| `src/themes/editorial-360/components/Timeline.tsx` | FIX-23 |
