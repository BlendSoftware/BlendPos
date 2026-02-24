// ─────────────────────────────────────────────────────────────────────────────
// Auth Store — Zustand con persistencia en localStorage.
// Conecta con POST /v1/auth/login (backend Go).
// Fallback a usuarios demo si VITE_API_URL no está configurada (dev/offline mode).
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { IUser, Rol } from '../types';
import { loginApi, refreshApi } from '../services/api/auth';

// ── Usuarios demo (solo sin VITE_API_URL) ─────────────────────────────────────

const DEMO_USERS: (IUser & { password: string; username: string })[] = [
    { id: 'u1', nombre: 'Carlos Administrador', email: 'admin@blendpos.com', rol: 'admin', activo: true, creadoEn: '2025-01-10T10:00:00Z', username: 'admin', password: '12345678' },
    { id: 'u2', nombre: 'María Supervisora', email: 'super@blendpos.com', rol: 'supervisor', activo: true, creadoEn: '2025-02-01T10:00:00Z', username: 'supervisor', password: '12345678' },
    { id: 'u3', nombre: 'Juan Cajero', email: 'caja@blendpos.com', rol: 'cajero', activo: true, creadoEn: '2025-03-15T10:00:00Z', username: 'cajero', password: '12345678' },
];

// El backend usa 'administrador', el frontend usa 'admin'
function mapRol(backendRol: string): Rol {
    if (backendRol === 'administrador') return 'admin';
    if (backendRol === 'supervisor') return 'supervisor';
    return 'cajero';
}

interface AuthState {
    user: IUser | null;
    token: string | null;
    refreshToken: string | null;
    isAuthenticated: boolean;

    login: (usernameOrEmail: string, password: string) => Promise<boolean>;
    logout: () => void;
    refresh: () => Promise<boolean>;
    hasRole: (roles: Rol[]) => boolean;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            token: null,
            refreshToken: null,
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
                        set({ user, token: resp.access_token, refreshToken: resp.refresh_token, isAuthenticated: true });
                        return true;
                    } catch {
                        return false;
                    }
                }

                // Fallback demo (sin backend)
                await new Promise((r) => setTimeout(r, 400));
                const found = DEMO_USERS.find(
                    (u) => (u.email === usernameOrEmail || u.username === usernameOrEmail) &&
                        u.password === password && u.activo,
                );
                if (!found) return false;
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { password: _pw, username: _un, ...user } = found;
                const fakeToken = btoa(JSON.stringify({ sub: user.id, rol: user.rol, exp: Date.now() + 28800_000 }));
                set({ user, token: fakeToken, refreshToken: null, isAuthenticated: true });
                return true;
            },

            logout: () => set({ user: null, token: null, refreshToken: null, isAuthenticated: false }),

            refresh: async () => {
                const { refreshToken } = get();
                if (!refreshToken) return false;
                try {
                    const resp = await refreshApi(refreshToken);
                    const u = resp.user;
                    const user: IUser = {
                        id: u.id, nombre: u.nombre, email: '',
                        rol: mapRol(u.rol), activo: true, creadoEn: new Date().toISOString(),
                    };
                    set({ user, token: resp.access_token, refreshToken: resp.refresh_token, isAuthenticated: true });
                    return true;
                } catch {
                    set({ user: null, token: null, refreshToken: null, isAuthenticated: false });
                    return false;
                }
            },

            hasRole: (roles) => {
                const { user } = get();
                return user !== null && roles.includes(user.rol);
            },
        }),
        { name: 'blendpos-auth' }
    )
);
