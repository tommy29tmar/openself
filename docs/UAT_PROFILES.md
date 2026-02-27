# UAT Profiles Seeding

Last updated: 2026-02-27

This document defines the standard process to generate varied test profiles for UAT.

## Goal

Create a batch of realistic, diverse profiles (with published pages) to stress:
- section composition
- layout templates
- style/theme combinations
- long/short content density

Each run also exports credentials and captures screenshots automatically.

## Standard command

From repo root:

```bash
npm run db:seed:uat
```

Equivalent explicit command:

```bash
EXTENDED_SECTIONS=true INVITE_CODES=code1 npx tsx scripts/seed-uat-profiles.ts
```

## Optional parameters

You can customize how many profiles to generate and add a run tag:

```bash
EXTENDED_SECTIONS=true INVITE_CODES=code1 npx tsx scripts/seed-uat-profiles.ts --count=10 --tag=round2
```

Available flags:
- `--count=<n>`: number of profiles (max = number of blueprints in script)
- `--tag=<name>`: appended to username/email generation and output filenames
- `--skip-screenshots`: create profiles but skip screenshot capture

## Output files

Credentials and URLs are written to:

- `docs/uat/profiles/latest.md`
- `docs/uat/profiles/latest.json`
- `docs/uat/profiles/<timestamp>-<tag>.md`
- `docs/uat/profiles/<timestamp>-<tag>.json`
- `screenshot/uat-profiles-<timestamp>-<tag>/` (one PNG per profile + `index.txt`)

Each record contains:
- display name
- username
- email
- password
- layout template
- theme
- public URL

## URL base

Public/login/builder links in output files use:

1. `UAT_BASE_URL` (if set)
2. `NEXT_PUBLIC_BASE_URL` (if set)
3. auto-detect local app (`http://localhost:3000` then `http://localhost:3001`)
4. fallback: first candidate (`http://localhost:3000`)

Example:

```bash
UAT_BASE_URL=http://localhost:3001 npm run db:seed:uat
```

## Notes

- The script is additive: it creates new users/profiles and publishes pages.
- Username/email collisions are handled automatically.
- Screenshot capture requires a running local app on the selected base URL.
- Generated credentials are test-only and should not be reused outside local/dev QA.
