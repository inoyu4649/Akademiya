import { createContext, useContext } from 'react'
import type { PydeUser } from '../api/auth.api'

export interface AuthState {
  /** null = 비로그인(게스트), undefined = 아직 확인 전 */
  user: PydeUser | null | undefined
  signIn: (returnTo?: string) => void
  signOut: () => Promise<void>
  /** 세션 만료를 감지했을 때 UI를 게스트 상태로 되돌린다 */
  markSignedOut: () => void
  refresh: () => Promise<void>
}

// 컴포넌트를 내보내지 않는 파일로 분리해 두었다 — react-refresh는 한 파일이
// 컴포넌트와 그 외 값을 함께 내보내면 갱신을 포기한다.
export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
