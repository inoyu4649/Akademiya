import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styles from "./Developer.module.css";

const ICON_SIZES = [32, 64, 128, 256, 512];

// ── 코드 예제 (기술 값·URL·JSON 필드명·CSS·JS는 언어에 관계없이 동일하므로 번역하지 않음) ──
const AUTHORIZE_REDIRECT_EXAMPLE = `GET https://akademiya.kr/oauth/authorize
  ?client_id={CLIENT_ID}
  &redirect_uri={REDIRECT_URI}
  &scope=openid%20profile%20email
  &state={STATE}
  &code_challenge={CODE_CHALLENGE}
  &code_challenge_method=S256`;

const TOKEN_EXCHANGE_EXAMPLE = `POST https://akademiya.kr/api/openoauth/token
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
}`;

const USERINFO_EXAMPLE = `GET https://akademiya.kr/api/openoauth/userinfo
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
}`;

const REFRESH_EXAMPLE = `POST https://akademiya.kr/api/openoauth/token
Content-Type: application/json

{
  "grantType": "refresh_token",
  "clientId": "{CLIENT_ID}",
  "clientSecret": "{CLIENT_SECRET}",
  "refreshToken": "{REFRESH_TOKEN}"
}`;

const BUTTON_CSS_EXAMPLE = `.akademiya-btn {
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
}`;

const BUTTON_JS_EXAMPLE = `function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\\+/g, "-")
    .replace(/\\//g, "_")
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
  .addEventListener("click", startAkademiyaLogin);`;

/** "\n"으로 구분된 번역 문자열을 단락/목록으로 변환. "- "로 시작하는 연속 줄은 <ul>로 묶는다. */
function renderGuideBody(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let listBuffer: string[] = [];
  let i = 0;

  function flushList() {
    if (listBuffer.length === 0) return;
    nodes.push(
      <ul className={styles.guideList} key={`${keyPrefix}-ul-${i++}`}>
        {listBuffer.map((line) => <li key={line}>{line.slice(2)}</li>)}
      </ul>
    );
    listBuffer = [];
  }

  for (const line of text.split("\n")) {
    if (line.startsWith("- ")) {
      listBuffer.push(line);
      continue;
    }
    flushList();
    if (line.trim()) {
      nodes.push(<p className={styles.guideParagraph} key={`${keyPrefix}-p-${i++}`}>{line}</p>);
    }
  }
  flushList();
  return nodes;
}

interface GuidePart {
  body?: string;
  code?: string;
  node?: ReactNode;
}

function GuideSection({ title, parts }: { title: string; parts: GuidePart[] }) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {parts.map((part, i) => (
        <div key={i}>
          {part.body && renderGuideBody(part.body, `${title}-${i}`)}
          {part.code && <pre className={styles.codeBlock}>{part.code}</pre>}
          {part.node}
        </div>
      ))}
    </div>
  );
}

export default function OAuthGuidePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const title = (key: string) => t(`developer.guide.sections.${key}.title`);
  const body = (key: string, field = "body") => t(`developer.guide.sections.${key}.${field}`);

  const buttonLabel = t("developer.guide.buttonLabelExample");
  const buttonHtmlExample = `<button id="akademiya-login-btn" class="akademiya-btn" type="button">
  <img
    src="https://akademiya.kr/brand/akademiya-icon-32.png"
    srcset="https://akademiya.kr/brand/akademiya-icon-64.png 2x"
    width="20" height="20" alt=""
  />
  <span>${buttonLabel}</span>
</button>`;

  const iconGallery = (
    <div className={styles.iconGrid}>
      {ICON_SIZES.map((size) => (
        <a
          key={size}
          href={`/brand/akademiya-icon-${size}.png`}
          download
          className={styles.iconItem}
        >
          <img src={`/brand/akademiya-icon-${size}.png`} alt={t("developer.guide.iconAlt")} width={40} height={40} />
          <span>{size}×{size}</span>
        </a>
      ))}
    </div>
  );

  return (
    <div className={styles.guidePage}>
      <button className={styles.backBtn} onClick={() => navigate("/developer/oauth")}>← {t("common.back")}</button>
      <h1 className={styles.pageTitle} style={{ marginBottom: 6 }}>{t("developer.guide.title")}</h1>
      <p className={styles.pageSubtitle} style={{ marginBottom: 28 }}>{t("developer.guide.subtitle")}</p>

      <GuideSection title={title("intro")} parts={[{ body: body("intro") }]} />
      <GuideSection title={title("setup")} parts={[{ body: body("setup") }]} />
      <GuideSection title={title("flow")} parts={[{ body: body("flow") }]} />
      <GuideSection title={title("step1")} parts={[{ body: body("step1"), code: AUTHORIZE_REDIRECT_EXAMPLE }]} />
      <GuideSection title={title("step2")} parts={[{ body: body("step2") }]} />
      <GuideSection
        title={title("step3")}
        parts={[{ body: body("step3"), code: TOKEN_EXCHANGE_EXAMPLE }, { body: body("step3", "bodyAfter") }]}
      />
      <GuideSection
        title={title("step4")}
        parts={[{ body: body("step4"), code: USERINFO_EXAMPLE }, { body: body("step4", "bodyAfter") }]}
      />
      <GuideSection title={title("refresh")} parts={[{ body: body("refresh"), code: REFRESH_EXAMPLE }]} />
      <GuideSection title={title("errors")} parts={[{ body: body("errors") }]} />
      <GuideSection title={title("security")} parts={[{ body: body("security") }]} />
      <GuideSection title={title("limits")} parts={[{ body: body("limits") }]} />
      <GuideSection title={title("icons")} parts={[{ body: body("icons"), node: iconGallery }]} />
      <GuideSection
        title={title("button")}
        parts={[
          { body: body("button", "intro"), code: buttonHtmlExample },
          { body: body("button", "cssIntro"), code: BUTTON_CSS_EXAMPLE },
          { body: body("button", "jsIntro"), code: BUTTON_JS_EXAMPLE },
          { body: body("button", "jsAfter") },
        ]}
      />
    </div>
  );
}
