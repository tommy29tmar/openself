# LinkedIn Import Quality Fix — Design

## Problem

The LinkedIn ZIP import produces low-quality pages:

1. **Company Follows → Interests**: "Tango, a puzzle by LinkedIn", "Credem Banca" etc. show up as personal interests
2. **Causes → Interests**: Generic causes ("Economic Empowerment") add noise
3. **Courses → Achievements**: 43 university exams imported as achievements
4. **Proficiency mapping broken**: LinkedIn Basic export uses descriptive strings ("Native or bilingual proficiency"), not enum keys ("NATIVE_OR_BILINGUAL"). Mapping fails silently.
5. **Skills duplicate languages**: "Lingua inglese", "Lingua tedesca" etc. appear as both skills and languages
6. **Experience order**: Ascending sort (oldest first) instead of descending (most recent first)

## Changes

### 1. Remove Company Follows import
- Delete `mapCompanyFollows` from mapper.ts
- Remove from FILE_MAPPERS in import.ts
- Remove tests

### 2. Remove Causes import
- Delete `mapCauses` from mapper.ts
- Remove from FILE_MAPPERS in import.ts
- Remove tests

### 3. Remove Courses import
- Delete `mapCourses` from mapper.ts
- Remove from FILE_MAPPERS in import.ts
- Remove tests
- University exams are not achievements. They're curriculum detail.

### 4. Fix proficiency mapping
- Normalize input: strip, lowercase, replace spaces/underscores with `_`, then uppercase
- Add descriptive string variants to PROFICIENCY_MAP:
  - "native or bilingual proficiency" → "native"
  - "full professional proficiency" → "fluent"
  - "professional working proficiency" → "advanced"
  - "limited working proficiency" → "intermediate"
  - "elementary proficiency" → "beginner"
- Keep existing enum keys for backward compat

### 5. Filter language-skills from Skills
- `mapSkills` accepts optional `languageNames: Set<string>` parameter
- Filters out skills whose lowercased name matches a known language or starts with "lingua "
- `importLinkedInZip` processes Languages.csv first, passes language names to mapSkills

### 6. Experience descending order
- Reverse sort in mapPositions: most recent first (descending by startDate)

## Files Modified
- `src/lib/connectors/linkedin-zip/mapper.ts`
- `src/lib/connectors/linkedin-zip/import.ts`
- `tests/evals/linkedin-zip-mapper.test.ts`
- `tests/evals/linkedin-zip-import.test.ts` (if it references removed mappers)

## No New Files
