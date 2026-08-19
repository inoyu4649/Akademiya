// PWA 설치 배너를 헤더 버튼으로 직접 다룬다.
// 브라우저 기본 배너를 그냥 두면 아무 때나 떠서 IDE 화면을 가리므로, 이벤트를 잡아
// 보관해 두었다가 사용자가 버튼을 눌렀을 때만 띄운다(설치 조건을 만족할 때만 나타난다).
import { useCallback, useEffect, useState } from 'react'

/** 아직 표준이 아니라 lib.dom에 타입이 없다 — 쓰는 부분만 최소로 선언한다 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // 기본 배너를 막고 우리가 시점을 고른다
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    // 설치가 끝나면 버튼을 치운다(이미 설치된 앱에 설치 버튼이 남아 있으면 혼란스럽다)
    const onInstalled = () => setDeferred(null)

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    // prompt()는 이벤트당 한 번만 쓸 수 있다 — 결과와 무관하게 버린다
    setDeferred(null)
  }, [deferred])

  // ⚠️ iOS Safari는 beforeinstallprompt를 지원하지 않는다(공유 → 홈 화면에 추가로만
  //    설치된다). 그래서 애플 기기에서는 이 버튼이 뜨지 않는 게 정상이다.
  return { canInstall: deferred !== null, promptInstall }
}
