import {
  getConnectorWithCredentials,
  updateConnectorCredentials,
} from "./connector-service";

export class TokenExpiredError extends Error {
  constructor() {
    super("Token expired");
    this.name = "TokenExpiredError";
  }
}

type TokenSet = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
};

/**
 * Shared token refresh wrapper for OAuth connectors (Spotify, Strava).
 * On 401 (TokenExpiredError): refreshes token, updates encrypted credentials, retries once.
 * SQLite single-writer serializes concurrent refreshes (implicit lock).
 */
export async function withTokenRefresh<T>(
  connectorId: string,
  refreshFn: (refreshToken: string) => Promise<TokenSet>,
  apiFn: (accessToken: string) => Promise<T>,
): Promise<T> {
  const connector = getConnectorWithCredentials(connectorId);
  if (!connector?.decryptedCredentials) {
    throw new Error("No credentials for connector");
  }

  const creds =
    typeof connector.decryptedCredentials === "string"
      ? JSON.parse(connector.decryptedCredentials)
      : connector.decryptedCredentials;

  try {
    return await apiFn(creds.access_token);
  } catch (error) {
    if (!(error instanceof TokenExpiredError)) throw error;

    // Refresh token
    const newTokens = await refreshFn(creds.refresh_token);
    updateConnectorCredentials(connectorId, {
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token ?? creds.refresh_token,
      expires_in: newTokens.expires_in,
    });

    // Retry with new token — let errors propagate
    return await apiFn(newTokens.access_token);
  }
}
