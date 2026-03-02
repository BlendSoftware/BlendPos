// ─────────────────────────────────────────────────────────────────────────────
// Auth Store — Zustand con persistencia parcial en localStorage.
//
// Los tokens JWT se guardan ÚNICAMENTE en memoria (tokenStore) para reducir
// la superficie de ataque XSS (P1-003).  Solo el perfil del usuario y el
// flag isAuthenticated se persisten en localStorage para restaurar la UI
// tras un hard-refresh (el token se obtiene de nuevo con silent-refresh).
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { IUser, Rol } from '../types';
import { loginApi, refreshApi } from '../services/api/auth';
import { apiClient, scheduleProactiveRefresh, cancelProactiveRefresh } from '../api/client';
import { tokenStore } from './tokenStore';

// ── Usuarios demo — SOLO desarrollo (P1-004) ──────────────────────────────────
// La constante es accesible únicamente cuando el bundler incluye el bloque
// import.meta.env.DEV === true.  En producción se genera un módulo vacío.
// Las credenciales se leen de .env (VITE_DEMO_PASS) — nunca hardcodeadas.

const DEMO_PASS = (import.meta.env.DEV && import.meta.env.VITE_DEMO_PASS as string) || '';

const DEMO_USERS: (IUser & { password: string; username: string })[] = import.meta.env.DEV && DEMO_PASS
    ? [
          { id: 'u1', nombre: 'Carlos Administrador', email: 'admin@blendpos.com', rol: 'admin', activo: true, creadoEn: '2025-01-10T10:00:00Z', username: 'admin', password: DEMO_PASS },
          { id: 'u2', nombre: 'María Supervisora', email: 'super@blendpos.com', rol: 'supervisor', activo: true, creadoEn: '2025-02-01T10:00:00Z', username: 'supervisor', password: DEMO_PASS },
          { id: 'u3', nombre: 'Juan Cajero', email: 'caja@blendpos.com', rol: 'cajero', activo: true, creadoEn: '2025-03-15T10:00:00Z', username: 'cajero', password: DEMO_PASS },
      ]
    : [];

// El backend usa 'administrador', el frontend usa 'admin'
function mapRol(backendRol: string): Rol {
    if (backendRol === 'administrador') return 'admin';
    if (backendRol === 'supervisor') return 'supervisor';
    return 'cajero';
}

interface AuthState {
    user: IUser | null;
    isAuthenticated: boolean;

    login: (usernameOrEmail: string, password: string) => Promise<boolean>;
    logout: () => Promise<void>;
    refresh: () => Promise<boolean>;
    /** Called on app mount to silently restore the session via refresh token. */
    initAuth: () => Promise<void>;
    hasRole: (roles: Rol[]) => boolean;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            isAuthenticated: false,

            login: async (usernameOrEmail, password) => {
                const backendAvailable = !!(import.meta.env.VITE_API_BASE as string | undefined);

                if (backendAvailable) {
                    try {
                        const resp = await loginApi(usernameOrEmail, password);
                        const u = resp.user;
                        const user: IUser = {
                            id: u.id,
                            nombre: u.nombre,
                            email: usernameOrEmail.includes('@') ? usernameOrEmail : '',
                            rol: mapRol(u.rol),
                            activo: true,
                            creadoEn: new Date().toISOString(),
                            puntoDeVenta: u.punto_de_venta ?? undefined,
                        };
                        // Store tokens in memory only — never in localStorage
                        tokenStore.setTokens(resp.access_token, resp.refresh_token);
                        scheduleProactiveRefresh(resp.access_token);
                        set({ user, isAuthenticated: true });
                        return true;
                    } catch {
                        return false;
                    }
                }

                // Fallback demo (sin backend) — dev only
                if (!import.meta.env.DEV) return false;
                await new Promise((r) => setTimeout(r, 400));
                const found = DEMO_USERS.find(
                    (u) => (u.email === usernameOrEmail || u.username === usernameOrEmail) &&
                        u.password === password && u.activo,
                );
                if (!found) return false;
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { password: _pw, username: _un, ...user } = found;
                const fakeToken = btoa(JSON.stringify({ sub: user.id, rol: user.rol, exp: Date.now() + 28800_000 }));
                tokenStore.setTokens(fakeToken, '');
                set({ user, isAuthenticated: true });
                return true;
            },

            logout: async () => {
                // Attempt server-side revocation (best-effort, don't block UI)
                try {
                    const accessToken = tokenStore.getAccessToken();
                    if (accessToken) {
                        await apiClient.post('/v1/auth/logout', {});
                    }
                } catch {
                    // Logout is best-effort — clear local state regardless
                }
                cancelProactiveRefresh();
                tokenStore.clearTokens();
                set({ user: null, isAuthenticated: false });
            },

            refresh: async () => {
                const refreshToken = tokenStore.getRefreshToken();
                if (!refreshToken) return false;
                try {
                    const resp = await refreshApi(refreshToken);
                    const u = resp.user;
                    const user: IUser = {
                        id: u.id, nombre: u.nombre, email: '',
                        rol: mapRol(u.rol), activo: true, creadoEn: new Date().toISOString(),
                    };
                    tokenStore.setTokens(resp.access_token, resp.refresh_token);
                    scheduleProactiveRefresh(resp.access_token);
                    set({ user, isAuthenticated: true });
                    return true;
                } catch {
                    cancelProactiveRefresh();
                    tokenStore.clearTokens();
                    set({ user: null, isAuthenticated: false });
                    return false;
                }
            },

            /**
             * Called once on app mount (App.tsx useEffect).
             * If the store says the user was authenticated, try a silent token
             * refresh so they don't have to log in again after a page reload.
             */
            initAuth: async () => {
                if (!get().isAuthenticated) return;
                // Token is gone (page reload) — try refresh
                if (!tokenStore.getAccessToken()) {
                    const ok = await get().refresh();
                    if (!ok) {
                        // Couldn't restore token (no refresh token in memory or API error).
                        // Clear local auth state so ProtectedRoute redirects to login.
                        tokenStore.clearTokens();
                        set({ user: null, isAuthenticated: false });
                    }
                }
            },

            hasRole: (roles) => {
                const { user } = get();
                return user !== null && roles.includes(user.rol);
            },
        }),
        {
            name: 'blendpos-auth',
            // Only persist non-sensitive state — tokens stay in memory (P1-003)
            partialize: (state) => ({
                user: state.user,
                isAuthenticated: state.isAuthenticated,
            }),
        }
    )
);
