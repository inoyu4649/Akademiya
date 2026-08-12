// 로그인 상태는 앱 전체가 공유하지만 상태 자체는 아주 단순하다
// (세션은 서버 쿠키에 있고 프론트는 "누구인지"만 알면 된다).
// Zustand 같은 스토어를 새로 들이지 않고 Context 하나로 처리한다.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchMe, logout as apiLogout, startLogin, type PydeUser } from '../api/auth.api'
import { AuthContext, type AuthState } from './authContext'

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PydeUser | null | undefined>(undefined)

  const refresh = useCallback(async () => {
    try {
      const me = await fetchMe()
      setUser(me.authenticated ? me.user : null)
    } catch {
      // 서버에 못 닿아도 게스트로는 계속 쓸 수 있어야 한다(로그인은 선택 사항)
      setUser(null)
    }
  }, [])

  useEffect(() => {
    // queueMicrotask로 감싸는 건 이 저장소의 관례 — 이펙트 본문에서 곧바로
    // setState로 이어지는 호출을 하면 react-hooks/set-state-in-effect가 걸린다.
    queueMicrotask(() => void refresh())
  }, [refresh])

  const signOut = useCallback(async () => {
    try {
      await apiLogout()
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      signIn: (returnTo?: string) => startLogin(returnTo),
      signOut,
      markSignedOut: () => setUser(null),
      refresh,
    }),
    [user, signOut, refresh]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
