import { api } from './api'

export interface LoginRequest { username: string; password: string }
export interface AuthUser { id: string; username: string; nombre: string; rol: string; punto_de_venta?: number }
export interface LoginResponse { access_token: string; refresh_token: string; user: AuthUser }

export const authService = {
  login: async (req: LoginRequest): Promise<LoginResponse> => {
    const { data } = await api.post<LoginResponse>('/v1/auth/login', req)
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    localStorage.setItem('user', JSON.stringify(data.user))
    return data
  },
  logout: () => {
    localStorage.clear()
    window.location.href = '/login'
  },
  getUser: (): AuthUser | null => {
    const u = localStorage.getItem('user')
    return u ? JSON.parse(u) : null
  }
}
