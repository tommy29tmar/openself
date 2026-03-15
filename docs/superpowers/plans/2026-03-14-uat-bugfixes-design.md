# UAT Bug Fixes — Design Document

> Challenger-validated design for 5 bugs found during 2026-03-14 UAT.
> See `uat/UAT-REPORT.md` for full test report.

## Bugs

| # | Severity | Title | Root Cause |
|---|----------|-------|-----------|
| 1 | HIGH | Action bar click interception | `.theme-reveal` CSS: `opacity:0` without `pointer-events:none` |
| 2 | HIGH | Re-publish 403 | Asymmetric email verification between `/api/register` and `/api/publish` |
| 3 | MEDIUM | Phantom profile | Facts written with `profileId=sessionId` before profile row exists |
| 4 | LOW | Agent reasoning leak | No prompt rule + raw tool names in error messages |
| 5 | LOW | Connector dedup gap | Pre-existing unclustered facts not retroactively matched (handler exists but old data predates it) |

## Fixes

1. **CSS**: Add `pointer-events: none/auto` to `.theme-reveal` states
2. **Auth**: Set `emailVerified=1` in `/api/register` transaction + keep publish gate + backfill
3. **Data**: `INSERT OR IGNORE` profile before fact writes + backfill migration
4. **Prompt**: Anti-reasoning rule in OUTPUT_CONTRACT + sanitize tool error messages
5. **Deferred**: One-time backfill script for unclustered facts (no async worker)
