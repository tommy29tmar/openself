import { getAuthContext, resolveOwnerScope, type OwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";

export function resolveAuthenticatedConnectorScope(req: Request): OwnerScope | null {
  const scope = resolveOwnerScope(req);
  if (!scope) return null;
  if (!isMultiUserEnabled()) return scope;

  const authCtx = getAuthContext(req);
  if (!authCtx?.userId && !authCtx?.username) return null;

  return scope;
}
