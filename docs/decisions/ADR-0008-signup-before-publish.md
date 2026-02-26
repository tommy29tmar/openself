# ADR-0008: Signup Before Publish

Status: Accepted
Date: 2026-02-27
Deciders: OpenSelf engineering

## Context

In multi-user mode, anonymous users could chat, build a page, and publish — without
ever creating an account. After publishing, they stayed on the builder with a green
"Published!" banner. There was no way to log back in and edit later, and the publish
endpoint (`POST /api/publish`) had no authentication check. This was identified as a
known gap in ADR-0004 (negative #2) and listed as a prerequisite for public deployment.

The existing `/api/register` endpoint already implemented signup+publish atomically
when `AUTH_V2=true`: validate credentials → create user → link profile → publish page
→ rotate session → set cookie. The missing piece was the UI flow to trigger it and
the server-side enforcement to block anonymous publish.

## Decision

1. **Server-side auth gate on `/api/publish`.** In multi-user mode, require
   `authCtx.userId`. Anonymous sessions get 403 `AUTH_REQUIRED`. This ensures even
   direct API calls cannot bypass the UI.

2. **Username enforcement.** If `authCtx.username` exists (user already claimed one),
   `POST /api/publish` ignores `body.username` and uses the authenticated username.
   Prevents crafted requests from publishing under a different identity.

3. **Signup modal in builder.** When the agent requests publish and the user is
   anonymous, the PublishBar shows "Sign up to publish" → opens a `SignupModal` that
   POSTs to `/api/register` → redirect to published page on success.

4. **Atomic claim+publish for OAuth edge case.** Authenticated users without a username
   (OAuth login, never published) provide a username at publish time. The pipeline runs
   `setProfileUsername` inside the same SQLite transaction as publish. If the UNIQUE
   constraint fails, the entire transaction rolls back.

5. **Three-mode PublishBar.** The component adapts based on auth state:
   - Single-user mode: username input + publish (original behavior, unchanged)
   - Multi-user, anonymous: "Sign up to publish" → signup modal
   - Multi-user, authenticated: "Publish as {username}" → direct publish

6. **Auth indicator + logout.** Builder preview shows `{username} · Log out` when
   authenticated. Published page OwnerBanner includes a logout button.

7. **`getAuthContext` username resolution.** Resolves username via `profiles.username`
   when `session.username` is null (auth v2 sessions don't write username to the
   sessions table due to UNIQUE constraint).

8. **Shared `PublishError` class.** Extracted to `src/lib/services/errors.ts` to avoid
   circular dependencies between `page-service` and `publish-pipeline`.

## Consequences

Positive:
1. Anonymous publish is blocked server-side — the auth gate cannot be bypassed.
2. The existing `/api/register` endpoint handles the complexity; the new SignupModal
   is a thin client that calls it.
3. Username mismatch is impossible for authenticated users.
4. The atomic claim+publish transaction prevents orphaned state (username claimed
   without published page, or vice versa).
5. Single-user mode is completely unaffected.
6. Users can now log back in and edit their published page.

Negative:
1. Anonymous users must create an account before seeing their page published. This adds
   friction to the onboarding flow. Mitigated by the modal appearing at the natural
   publish checkpoint (user already decided to publish).
2. OAuth users without a username get a slightly different publish flow (username input
   instead of one-click publish). This is rare and resolves after first publish.

## Alternatives Considered

1. **Publish anonymously, require signup later to edit.**
   Rejected: creates an orphaned page with no owner. Recovery flow would be complex
   (claim by email? magic link?). The publish gate was already identified as a known
   gap requiring authentication.

2. **Signup page redirect instead of modal.**
   Rejected: navigating away from the builder would lose the preview context and feel
   disruptive. The modal keeps the user in the builder flow.

3. **Separate signup and publish steps.**
   Rejected: adds an extra step. The existing `/api/register` already does
   signup+publish atomically, so the modal leverages it directly.
