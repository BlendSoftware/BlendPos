import { useState } from 'react'
import { authService, AuthUser } from '@/services/auth'

export function useAuth() {
  const [user] = useState<AuthUser | null>(() => authService.getUser())
  const isLoading = false
  return { user, isLoading, logout: authService.logout }
}
