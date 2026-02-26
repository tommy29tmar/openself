/** Reserved usernames that cannot be used for public pages. */
export const RESERVED_USERNAMES = new Set([
  "draft",
  "api",
  "builder",
  "admin",
  "invite",
  "_next",
]);

/** Check if a username is displayable (not reserved, not empty, not "draft"). */
export function isDisplayableUsername(username: string): boolean {
  if (!username || username.trim().length === 0) return false;
  return !RESERVED_USERNAMES.has(username.toLowerCase());
}
