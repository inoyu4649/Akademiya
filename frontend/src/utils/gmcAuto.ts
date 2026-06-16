import client from "../api/client";

// GMCAuto가 보낼 수 있는 redirect_uri 화이트리스트
// (backend/src/routes/auth.ts의 ALLOWED_GMC_ORIGINS와 동일하게 유지)
const ALLOWED_GMC_ORIGINS = ["https://gmc.akademiya.kr", "http://localhost:5174", "http://localhost:3001"];

/** GMCAuto가 넘겨준 redirect_uri가 허용된 origin + 경로(/auth/callback)인지 검증 */
export function isSafeGmcRedirect(uri: string | null | undefined): uri is string {
  if (!uri) return false;
  try {
    const url = new URL(uri);
    return ALLOWED_GMC_ORIGINS.some((o) => uri.startsWith(o)) && url.pathname === "/auth/callback";
  } catch {
    return false;
  }
}

/** GMCAuto 단기 코드를 발급받아 해당 redirect_uri로 즉시 이동 (PWA 설치 시 capture_links로 GMCAuto PWA가 열림) */
export async function redirectToGmcAuto(redirectUri: string) {
  if (!isSafeGmcRedirect(redirectUri)) {
    window.location.href = "https://gmc.akademiya.kr";
    return;
  }
  try {
    const res = await client.post<{ code: string }>("/oauth/gmcauto-code");
    window.location.href = `${redirectUri}?code=${encodeURIComponent(res.data.code)}`;
  } catch {
    window.location.href = redirectUri;
  }
}
