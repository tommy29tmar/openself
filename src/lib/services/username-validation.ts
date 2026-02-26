import { validateUsernameFormat } from "@/lib/page-config/usernames";
import { isUsernameTaken } from "@/lib/services/session-service";

type ValidationResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

/** Full validation: format + reserved + DB taken check. */
export function validateUsernameAvailability(username: string): ValidationResult {
  const formatResult = validateUsernameFormat(username);
  if (!formatResult.ok) return formatResult;

  if (isUsernameTaken(username)) {
    return { ok: false, code: "USERNAME_TAKEN", message: "Username already taken." };
  }

  return { ok: true };
}
