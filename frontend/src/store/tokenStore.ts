/**
 * tokenStore — JWT storage (P1-003)
 *
 * Access token: kept in memory only (lost on F5, short-lived — fine).
 * Refresh token: persisted in sessionStorage so a hard page refresh (F5)
 *   doesn't force the user to log in again. sessionStorage is scoped to the
 *   tab and cleared when the tab is closed, which is an acceptable trade-off
 *   between security and UX. It is NOT accessible cross-origin.
 *
 * If you need persistence across tabs, consider an HttpOnly cookie instead.
 */

const REFRESH_TOKEN_KEY = 'blendpos:rt';

let _accessToken: string | null = null;

export const tokenStore = {
  /** Returns the current in-memory access token (null if not authenticated). */
  getAccessToken(): string | null {
    return _accessToken;
  },

  /** Returns the refresh token from sessionStorage (survives F5 in same tab). */
  getRefreshToken(): string | null {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY);
  },

  /**
   * Stores the access token in memory and the refresh token in sessionStorage.
   * Called after a successful login or silent refresh.
   */
  setTokens(accessToken: string, refreshToken: string): void {
    _accessToken = accessToken;
    if (refreshToken) {
      sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }
  },

  /**
   * Wipes both tokens.
   * Called on explicit logout or when refresh fails.
   */
  clearTokens(): void {
    _accessToken = null;
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  },
} as const;
