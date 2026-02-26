/** Username format: lowercase letters, numbers, hyphens, 1-39 chars. */
export const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;

/** Reserved usernames that cannot be used for public pages. */
export const RESERVED_USERNAMES = new Set([
  "draft",
  "api",
  "builder",
  "admin",
  "invite",
  "_next",
  "login",
  "signup",
]);

/** Check if a username is displayable (not reserved, not empty, not "draft"). */
export function isDisplayableUsername(username: string): boolean {
  if (!username || username.trim().length === 0) return false;
  return !RESERVED_USERNAMES.has(username.toLowerCase());
}

type ValidationResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

/** Pure validation — checks format + reserved list only, no DB. */
export function validateUsernameFormat(username: string): ValidationResult {
  if (!username || typeof username !== "string") {
    return { ok: false, code: "USERNAME_INVALID", message: "Username is required." };
  }
  if (!USERNAME_RE.test(username)) {
    return {
      ok: false,
      code: "USERNAME_INVALID",
      message: "Invalid username. Use lowercase letters, numbers, and hyphens (1-39 chars).",
    };
  }
  if (RESERVED_USERNAMES.has(username)) {
    return {
      ok: false,
      code: "USERNAME_RESERVED",
      message: `"${username}" is reserved.`,
    };
  }
  return { ok: true };
}
