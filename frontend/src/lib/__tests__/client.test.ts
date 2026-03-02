import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock fetch globally
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// Import the real modules — tokenStore is a singleton in the same module graph
import { tokenStore } from '../../store/tokenStore';
import { apiClient } from '../../api/client';

beforeEach(() => {
  tokenStore.clearTokens();
  fetchMock.mockReset();
});

afterEach(() => {
  tokenStore.clearTokens();
});

describe('apiClient', () => {
  it('adds Authorization header when token is present', async () => {
    tokenStore.setTokens('my-access-token', 'my-refresh-token');

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'test' }),
    });

    await apiClient.get('/v1/productos');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['Authorization']).toBe('Bearer my-access-token');
  });

  it('does not add Authorization header when no token', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'test' }),
    });

    await apiClient.get('/v1/productos');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['Authorization']).toBeUndefined();
  });

  it('throws on 500 status with descriptive error', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve('{"error":"DB connection lost"}'),
    });

    await expect(apiClient.get('/v1/productos')).rejects.toThrow(
      /500 Internal Server Error/,
    );
  });

  it('returns undefined for 204 No Content', async () => {
    tokenStore.setTokens('tok', 'ref');
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });

    const result = await apiClient.delete('/v1/productos/123');
    expect(result).toBeUndefined();
  });

  it('sends JSON body on POST', async () => {
    tokenStore.setTokens('tok', 'ref');
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: '1' }),
    });

    await apiClient.post('/v1/productos', { nombre: 'Test' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ nombre: 'Test' });
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('appends query params on GET', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });

    await apiClient.get('/v1/productos', { page: 1, limit: 50 });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('page=1');
    expect(url).toContain('limit=50');
  });
});
