# Akademiya OpenOAuth 사용 가이드

여러분의 서비스에 **"Akademiya로 로그인"**을 연동하는 방법을 안내합니다.

> 이 문서는 앱 내 가이드 페이지(`/developer/oauth/guide`, ko/en/ja/zh 4개 언어 지원)의 한국어 버전을 정적 Markdown으로 옮긴 것입니다. 최신 버전은 항상 앱 내 가이드 페이지를 참고하세요.

## 목차

1. [개요](#개요)
2. [사전 준비](#사전-준비)
3. [인증 플로우 요약](#인증-플로우-요약)
4. [1단계 — 로그인 화면으로 리디렉션](#1단계--로그인-화면으로-리디렉션)
5. [2단계 — 콜백 수신](#2단계--콜백-수신)
6. [3단계 — 토큰 교환 (서버-서버)](#3단계--토큰-교환-서버-서버)
7. [4단계 — 사용자 정보 조회](#4단계--사용자-정보-조회)
8. [리프레시 토큰](#리프레시-토큰)
9. [주요 오류 코드](#주요-오류-코드)
10. [보안 체크리스트](#보안-체크리스트)
11. [이용 한도](#이용-한도)
12. [브랜드 아이콘](#브랜드-아이콘)
13. ["Akademiya로 로그인" 버튼 만들기](#akademiya로-로그인-버튼-만들기)

---

## 개요

Akademiya OpenOAuth는 여러분의 서비스에 "Akademiya로 로그인" 기능을 붙일 수 있게 해주는 OAuth 2.0 인증 제공자(Identity Provider)입니다.

Google, GitHub 등 다른 OAuth 제공자와 동일한 방식(Authorization Code + PKCE)으로 동작하며, Akademiya 계정을 가진 사용자가 여러분의 서비스에 별도 회원가입 없이 로그인할 수 있습니다.

이름과 이메일 주소(`sub` 포함)는 항상 전달되는 필수 정보입니다. 프로필 사진·조직 가입 현황·반 가입 현황은 OAuth App 소유자가 개발자 화면에서 선택적으로 켠 경우에만 함께 전달됩니다.

## 사전 준비

1. 회원정보 수정 메뉴에서 "개발자 모드"를 활성화하세요. 좌측 메뉴에 "개발자 도구"가 나타납니다.
2. "개발자 도구 → Akademiya OAuth → 새 OAuth App 만들기"에서 앱을 생성하세요.
   - **내부 코드명**: 영문/숫자/하이픈만 허용되며 생성 후 변경할 수 없습니다.
   - **외부 표출 이름**: 로그인·동의 화면에 표시되는 이름으로, 언제든 수정할 수 있습니다.
   - **메인 사이트 URL**: 서비스 대표 URL 1개(동의 화면의 링크로 사용됩니다).
   - **로그인 허용 수단**: Akademiya 계정 전용 / Google 계정 전용 / 둘 다 허용.
   - **로그인 허용 범위**: 전체 / 특정 조직 / 특정 반 / Google Workspace 도메인.
   - **선택적 Scope**: 프로필 사진 · 조직 가입 현황 · 반 가입 현황 중 이 앱에 필요한 정보만 체크박스로 켤 수 있습니다(이름·이메일은 항상 전달되는 필수 정보). 로그인 허용 범위를 조직/반으로 제한하면 해당 소속 정보 scope는 자동으로 켜집니다.
3. 생성 시 발급되는 Client ID와 Client Secret은 이 화면을 닫으면 다시 볼 수 없습니다. 안전한 곳에 저장하세요. Client Secret은 반드시 서버에만 보관하고 프런트엔드 코드에 노출하지 마세요.
4. 앱 설정의 "신뢰할 수 있는 출처"에 `redirect_uri`를 반드시 등록해야 합니다. 등록되지 않은 값으로는 로그인 요청이 거부됩니다.
   - **권장**: 전체 `redirect_uri`(예: `https://example.akademiya.kr/callback`)를 등록하면 정확히 그 주소로만 인가 코드가 전달됩니다(가장 안전).
   - **호환**: 오리진만(예: `https://example.akademiya.kr`) 등록하면 해당 오리진의 모든 경로를 허용합니다. 가능하면 전체 URI 등록을 사용하세요.
   - `redirect_uri`에 사용자 정보(`user:pass@`)나 프래그먼트(`#...`)는 포함할 수 없습니다.

## 인증 플로우 요약

Akademiya OpenOAuth는 Authorization Code Grant + PKCE(S256) 방식만 지원합니다. 전체 흐름은 4단계입니다.

- **1단계**: 사용자를 Akademiya 로그인 화면으로 리디렉션합니다.
- **2단계**: 사용자가 로그인하고 동의하면 등록된 `redirect_uri`로 인가 코드(`code`)가 전달됩니다.
- **3단계**: 여러분의 서버가 인가 코드를 `access_token`/`refresh_token`으로 교환합니다.
- **4단계**: `access_token`으로 사용자 정보(`userinfo`)를 조회합니다.

## 1단계 — 로그인 화면으로 리디렉션

먼저 `code_verifier`(43~128자의 임의 문자열)를 생성하고, `code_challenge = BASE64URL(SHA256(code_verifier))`를 계산하세요. `code_verifier`는 3단계에서 사용하므로 세션 등에 임시 보관해야 합니다.

CSRF 방지를 위한 `state` 값도 함께 생성해 세션에 저장하세요.

아래 URL로 사용자의 브라우저를 최상위 리디렉션(전체 페이지 이동)하세요. 팝업이나 iframe이 아닌 일반 리디렉션이어야 합니다.

```
GET https://akademiya.kr/oauth/authorize
  ?client_id={CLIENT_ID}
  &redirect_uri={REDIRECT_URI}
  &scope=openid%20profile%20email
  &state={STATE}
  &code_challenge={CODE_CHALLENGE}
  &code_challenge_method=S256
```

> `scope` 파라미터는 하위호환을 위해 형식만 검증되며, 실제로 어떤 정보가 전달되는지는 이 값과 무관하게 OAuth App 설정(필수 scope + 개발자가 켠 선택 scope)이 결정합니다.

## 2단계 — 콜백 수신

사용자가 Akademiya에 로그인하고 "허용"을 누르면, 등록된 `redirect_uri`로 다음 쿼리 파라미터와 함께 리디렉션됩니다.

- `code`: 60초 동안만 유효한 1회용 인가 코드
- `state`: 1단계에서 보낸 값과 동일 — 반드시 세션에 저장한 값과 비교해 CSRF를 방어하세요.

사용자가 거부하거나 오류가 발생하면 `redirect_uri`로 돌아오지 않고 Akademiya 화면에 오류가 표시됩니다.

## 3단계 — 토큰 교환 (서버-서버)

`code`를 발급받으면, 여러분의 백엔드 서버에서 다음 엔드포인트로 직접(서버-서버) 요청해 토큰을 교환하세요. 이 요청은 브라우저가 아닌 서버에서 호출해야 하며 Client Secret이 필요합니다.

요청 본문은 JSON이며, 필드명은 camelCase입니다(**표준 OAuth2 폼 인코딩이 아님에 유의**하세요).

```
POST https://akademiya.kr/api/openoauth/token
Content-Type: application/json

{
  "grantType": "authorization_code",
  "clientId": "{CLIENT_ID}",
  "clientSecret": "{CLIENT_SECRET}",
  "code": "{CODE}",
  "redirectUri": "{REDIRECT_URI}",
  "codeVerifier": "{CODE_VERIFIER}"
}

→ 200 OK
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "profile email"
}
```

`access_token`은 1시간, `refresh_token`은 30일간 유효합니다. `scope` 값은 이 앱에 설정된 필수+선택 scope로 서버가 결정하며, 인가 요청의 `scope` 파라미터와는 무관합니다.

## 4단계 — 사용자 정보 조회

발급받은 `access_token`으로 사용자 정보를 조회하세요.

```
GET https://akademiya.kr/api/openoauth/userinfo
Authorization: Bearer {ACCESS_TOKEN}

→ 200 OK
{
  "sub": "1234",
  "name": "Hong Gildong",
  "email": "user@akademiya.kr"

  // 아래 필드는 OAuth App 설정에서 해당 선택 scope를 켠 경우에만 추가된다
  // "picture": "https://akademiya.kr/api/avatars/....png",
  // "org_memberships": [{ "org_id": 1, "org_name": "...", "org_code": "HAFS", "permission": 3 }],
  // "class_memberships": [{ "class_id": 1, "class_name": "...", "class_code": "HAFS0103", "org_id": 1, "org_name": "...", "permission": 1 }]
}
```

`name`과 `email`은 항상 포함됩니다. `picture`·`org_memberships`·`class_memberships` 필드는 OAuth App 설정에서 해당 선택 scope를 켠 경우에만 추가로 포함됩니다.

## 리프레시 토큰

`access_token`이 만료되면 `refresh_token`으로 재발급받을 수 있습니다. 리프레시 토큰은 사용할 때마다 새 값으로 교체(회전)되며, 이전 값은 즉시 폐기됩니다.

```
POST https://akademiya.kr/api/openoauth/token
Content-Type: application/json

{
  "grantType": "refresh_token",
  "clientId": "{CLIENT_ID}",
  "clientSecret": "{CLIENT_SECRET}",
  "refreshToken": "{REFRESH_TOKEN}"
}
```

## 주요 오류 코드

| 코드 | 설명 |
| --- | --- |
| `INVALID_CLIENT` | Client ID 또는 Client Secret이 올바르지 않습니다. |
| `REDIRECT_URI_NOT_WHITELISTED` | `redirect_uri`의 오리진이 신뢰 출처 목록에 없습니다. |
| `PKCE_REQUIRED` | `code_challenge`가 없거나 `code_challenge_method`가 `S256`이 아닙니다. |
| `INVALID_OR_EXPIRED_CODE` | 인가 코드가 만료(60초)되었거나 이미 사용되었습니다. |
| `INVALID_CODE_VERIFIER` | `code_verifier`가 `code_challenge`와 일치하지 않습니다. |
| `OAUTH_APP_BANNED` | 해당 사용자가 이 앱에서 BAN되었습니다. |
| `OAUTH_NOT_ELIGIBLE` | 사용자가 앱의 로그인 허용 범위(조직·반·도메인)에 속하지 않습니다. |
| `OAUTH_GOOGLE_ONLY` | Google 전용 앱인데 사용자가 Google 계정을 연동하지 않았습니다. |

## 보안 체크리스트

- PKCE(S256)는 선택이 아닌 필수입니다. `code_verifier`를 안전하게 보관하세요.
- Client Secret은 반드시 서버에만 보관하세요. 브라우저·모바일 앱에 하드코딩하지 마세요.
- `redirect_uri`는 사전에 등록한 값과 일치해야 합니다. 보안을 위해 오리진만이 아니라 전체 `redirect_uri`를 등록해 정확 일치(exact match)를 적용하는 것을 권장합니다.
- `state` 값으로 CSRF를 방어하고, 요청 시 보낸 값과 콜백으로 받은 값을 반드시 비교하세요.
- `access_token`·`refresh_token`은 안전한 저장소(서버 세션, HttpOnly 쿠키 등)에 보관하고 클라이언트 JavaScript에 노출하지 마세요.

## 이용 한도

모든 사용자가 로그인할 수 있는 "공개(Public)" 범위(전체·Google Workspace) 앱은 계정당 기본 5개까지 만들 수 있습니다. 조직 또는 반 단위로 범위를 제한한 앱은 개수 제한이 없습니다.

공개 앱이 5개를 초과해 필요한 경우, OAuth App 생성 화면에서 한도 확장을 신청할 수 있습니다. 신청은 Akademiya 관리자의 검토 후 승인됩니다.

## 브랜드 아이콘

"Akademiya로 로그인" 버튼에 사용할 수 있도록 Akademiya 로고를 여러 크기의 투명 배경 PNG로 제공합니다. 로고의 비율과 색상은 변경하지 말고 그대로 사용해 주세요.

| 크기 | URL |
| --- | --- |
| 32×32 | `https://akademiya.kr/brand/akademiya-icon-32.png` |
| 64×64 | `https://akademiya.kr/brand/akademiya-icon-64.png` |
| 128×128 | `https://akademiya.kr/brand/akademiya-icon-128.png` |
| 256×256 | `https://akademiya.kr/brand/akademiya-icon-256.png` |
| 512×512 | `https://akademiya.kr/brand/akademiya-icon-512.png` |

화면 배율이 높은 환경(레티나 등)에서는 실제 표시 크기의 2배 파일을 사용하는 것을 권장합니다. (저장소 내 원본 파일 경로: [`frontend/public/brand/`](../frontend/public/brand))

## "Akademiya로 로그인" 버튼 만들기

Google·GitHub 로그인 버튼과 비슷하게, 위 로고와 "Akademiya로 로그인" 문구를 함께 표시하는 것을 권장합니다.

### HTML

아이콘 URL은 Akademiya 서버의 절대 경로를 사용합니다.

```html
<button id="akademiya-login-btn" class="akademiya-btn" type="button">
  <img
    src="https://akademiya.kr/brand/akademiya-icon-32.png"
    srcset="https://akademiya.kr/brand/akademiya-icon-64.png 2x"
    width="20" height="20" alt=""
  />
  <span>Akademiya로 로그인</span>
</button>
```

### CSS

버튼 스타일은 자유롭게 커스터마이징할 수 있습니다. 아래는 라이트·다크 모드를 모두 지원하는 기본 스타일 예제입니다.

```css
.akademiya-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 16px 0 12px;
  background: #ffffff;
  color: #1f1f1f;
  border: 1px solid #dadce0;
  border-radius: 8px;
  font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
}
.akademiya-btn:hover { background: #f7f7f7; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12); }
.akademiya-btn:active { background: #eeeeee; }
.akademiya-btn:focus-visible { outline: 2px solid #13e56a; outline-offset: 2px; }

@media (prefers-color-scheme: dark) {
  .akademiya-btn { background: #1f1f1f; color: #e8eaed; border-color: #5f6368; }
  .akademiya-btn:hover { background: #2a2a2a; }
}
```

### JavaScript

버튼을 클릭하면 PKCE 파라미터(`code_verifier`, `code_challenge`)와 CSRF 방지용 `state`를 생성해 세션에 저장한 뒤, 1단계에서 설명한 인가 URL로 이동해야 합니다.

```js
function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function startAkademiyaLogin() {
  const codeVerifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const challengeBuf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier)
  );
  const codeChallenge = base64url(new Uint8Array(challengeBuf));
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));

  sessionStorage.setItem("akademiya_code_verifier", codeVerifier);
  sessionStorage.setItem("akademiya_state", state);

  const url = new URL("https://akademiya.kr/oauth/authorize");
  url.searchParams.set("client_id", "{CLIENT_ID}");
  url.searchParams.set("redirect_uri", "https://example.akademiya.kr/callback");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  location.href = url.toString();
}

document.getElementById("akademiya-login-btn")
  .addEventListener("click", startAkademiyaLogin);
```

`code_verifier`와 `state`는 각각 3단계(토큰 교환)의 코드 검증과 콜백 검증에 사용되므로 세션에 안전하게 보관해야 합니다.
