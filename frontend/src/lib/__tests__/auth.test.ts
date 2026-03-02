import { describe, it, expect, beforeEach } from 'vitest';
import { tokenStore } from '../../store/tokenStore';

describe('tokenStore', () => {
  beforeEach(() => {
    tokenStore.clearTokens();
    sessionStorage.clear();
  });

  it('returns null when no tokens are set', () => {
    expect(tokenStore.getAccessToken()).toBeNull();
    expect(tokenStore.getRefreshToken()).toBeNull();
  });

  it('stores and retrieves access token', () => {
    tokenStore.setTokens('access-123', 'refresh-456');
    expect(tokenStore.getAccessToken()).toBe('access-123');
  });

  it('stores refresh token in sessionStorage', () => {
    tokenStore.setTokens('access-123', 'refresh-456');
    expect(tokenStore.getRefreshToken()).toBe('refresh-456');
    expect(sessionStorage.getItem('blendpos:rt')).toBe('refresh-456');
  });

  it('clearTokens removes both tokens', () => {
    tokenStore.setTokens('access-123', 'refresh-456');
    tokenStore.clearTokens();

    expect(tokenStore.getAccessToken()).toBeNull();
    expect(tokenStore.getRefreshToken()).toBeNull();
  });

  it('setTokens overwrites previous tokens', () => {
    tokenStore.setTokens('old-access', 'old-refresh');
    tokenStore.setTokens('new-access', 'new-refresh');

    expect(tokenStore.getAccessToken()).toBe('new-access');
    expect(tokenStore.getRefreshToken()).toBe('new-refresh');
  });
});
