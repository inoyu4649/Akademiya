import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import styles from './Developer.module.css'

// ── 코드 예제 (엔드포인트/헤더/JSON 필드명은 언어에 관계없이 동일하므로 번역하지 않음) ──
const AUTH_EXAMPLE = `X-Api-Key: {keyId}.{secret}`

const ENDPOINT_EXAMPLE = `GET https://gmc.akademiya.kr/api/public/v1/status/{studentNo}
X-Api-Key: {keyId}.{secret}`

const RESPONSE_EXAMPLE = `GET /api/public/v1/status/20301
X-Api-Key: 1a2b3c4d....ef56

→ 200 OK
{
  "success": true,
  "data": {
    "studentNo": "20301",
    "hasApplied": true,
    "reservedTime": "13:20",
    "history": [
      {
        "applyDate": "2026-07-10",
        "scheduleTime": "13:20",
        "timeCode": "B",
        "success": true,
        "message": null
      }
    ]
  }
}`

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.guideSection}>
      <h3 className={styles.guideSectionTitle}>{title}</h3>
      {children}
    </div>
  )
}

// 가이드 본문은 policyContent.ts/PolicyPage와 동일하게 한국어 전용(4개 언어 i18n 대상 아님) —
// 페이지 제목/설명 등 UI 텍스트만 i18n을 사용한다.
export default function ApiKeyGuidePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="card">
      <div className="card-header">
        <h2>{t('developer.guideTitle', 'GMCAuto API 사용 가이드')}</h2>
        <p>{t('developer.guideDesc', '다른 서비스가 서버-서버 통신으로 GMC PASS 신청 현황을 조회하는 방법을 안내합니다.')}</p>
      </div>
      <div className="card-body">
        <button
          className="btn btn-outline"
          onClick={() => navigate('/developer/keys')}
          style={{ marginBottom: '18px', fontSize: '12px', padding: '5px 12px' }}
        >
          {t('common.back', '← 뒤로')}
        </button>

        <Section title="개요">
          <p className={styles.guideParagraph}>
            GMCAuto 공개 API는 Akademiya 등 다른 서비스가 학교 홈페이지에 직접 동시 접속해 차단을 유발하지 않도록,
            GMCAuto가 이미 확보한 신청 데이터를 서버-서버 전용으로 제공하는 API입니다.
          </p>
          <p className={styles.guideParagraph}>
            세션 쿠키가 아닌 API Key 헤더로 인증하며, 학번 하나를 기준으로 다음 정보를 조회할 수 있습니다.
          </p>
          <ul className={styles.guideList}>
            <li>오늘 신청 성공 여부(<code>hasApplied</code>) — 항상 포함</li>
            <li>반복 등록된 예약 시간(<code>reservedTime</code>) — 선택 스코프</li>
            <li>최근 신청 내역 20건(<code>history</code>) — 선택 스코프</li>
          </ul>
        </Section>

        <Section title="사전 준비">
          <ol className={styles.guideList} style={{ listStyleType: 'decimal' }}>
            <li>GMCAuto에 Akademiya 계정으로 로그인한 뒤, 계정 설정에서 "개발자 모드"를 켜세요. 좌측 메뉴에 "개발자 도구" 그룹이 나타납니다.</li>
            <li>"개발자 도구 → GMCAuto API 키 → 새 키 발급"에서 키 이름을 입력하고, 필요한 선택 스코프를 체크한 뒤 발급하세요.</li>
            <li>발급 직후 한 번만 전체 키 값(<code>keyId.secret</code> 형식)이 표시됩니다. 이 화면을 닫으면 다시 조회할 수 없으니 안전한 곳에 저장하세요. 분실 시 재발급만 가능하며 기존 값은 조회할 수 없습니다.</li>
            <li>키는 발급한 Akademiya 계정에 종속되며, 조회 가능한 선택 스코프는 계정의 role(권한 등급)에 따라 제한됩니다.</li>
          </ol>
        </Section>

        <Section title="인증 방식">
          <p className={styles.guideParagraph}>
            발급받은 키를 <code>X-Api-Key</code> 헤더에 그대로 담아 요청하세요. 세션 쿠키나 <code>Authorization</code> 헤더는 사용하지 않습니다.
          </p>
          <pre className={styles.codeBlock}>{AUTH_EXAMPLE}</pre>
          <p className={styles.guideParagraph}>
            키는 서버에만 보관하고 브라우저·모바일 앱 등 클라이언트 코드에 노출하지 마세요. 유출이 의심되면 즉시 재발급하세요.
          </p>
        </Section>

        <Section title="엔드포인트">
          <pre className={styles.codeBlock}>{ENDPOINT_EXAMPLE}</pre>
          <p className={styles.guideParagraph}>
            <code>studentNo</code>는 GMCAuto에 등록된 학번 문자열입니다. 등록된 적 없는 학번을 조회해도 오류가 아니라
            "신청 내역 없음" 상태(<code>hasApplied: false</code> 등)로 응답합니다.
          </p>
        </Section>

        <Section title="스코프와 권한">
          <p className={styles.guideParagraph}>
            키를 발급할 때 아래 선택 스코프 중 필요한 항목만 켤 수 있습니다. <code>hasApplied</code>는 스코프와 무관하게
            항상 포함되는 필수 정보입니다.
          </p>
          <div className={styles.guideTableWrap}>
            <table className={styles.guideTable}>
              <thead>
                <tr>
                  <th>스코프</th>
                  <th>제공 정보</th>
                  <th>필요 권한(role)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>(없음, 항상 포함)</td>
                  <td><code>hasApplied</code> — 오늘 신청 성공 여부</td>
                  <td>제한 없음</td>
                </tr>
                <tr>
                  <td><code>schedule_time</code></td>
                  <td><code>reservedTime</code> — 반복 등록된 예약 시간</td>
                  <td>role 1 이상 ("통계 보기" 이상)</td>
                </tr>
                <tr>
                  <td><code>full_history</code></td>
                  <td><code>history</code> — 최근 신청 내역 20건</td>
                  <td>role 2 이상 ("통계+다운로드" 이상)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ul className={styles.guideList}>
            <li>role은 GMCAuto 관리자가 계정별로 부여하며, 발급자 본인이 직접 올릴 수 없습니다.</li>
            <li>키 발급 시점에 role이 부족해 켤 수 없던 스코프는 체크박스가 비활성화됩니다.</li>
            <li>키 발급 후 소유자의 role이 강등되면, 이미 켜져 있던 스코프라도 API 응답 시점에 다시 캡(cap)되어 더 이상 제공되지 않습니다. 세션이 아닌 요청마다 재검증되므로 별도 조치 없이 즉시 반영됩니다.</li>
          </ul>
        </Section>

        <Section title="요청/응답 예시">
          <pre className={styles.codeBlock}>{RESPONSE_EXAMPLE}</pre>
          <p className={styles.guideParagraph}>
            키에 <code>schedule_time</code>/<code>full_history</code> 스코프가 없으면 해당 필드는 각각 <code>null</code>,
            <code>[]</code>로 내려옵니다. 이 값은 "권한이 없어서 비어 있는 것"과 "실제로 예약/이력이 없는 것"을 구분하지 않으므로,
            스코프가 없는 필드는 애초에 응답에서 사용하지 않도록 클라이언트를 구성하세요.
          </p>
        </Section>

        <Section title="오류 코드">
          <div className={styles.guideTableWrap}>
            <table className={styles.guideTable}>
              <thead>
                <tr>
                  <th>상태 코드</th>
                  <th>상황</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>401</code></td>
                  <td><code>X-Api-Key</code> 헤더가 없거나, 형식(<code>keyId.secret</code>)이 잘못되었거나, 키가 유효하지 않습니다.</td>
                </tr>
                <tr>
                  <td><code>500</code></td>
                  <td>서버 내부 오류입니다. <code>message</code> 필드에 상세 내용이 포함됩니다.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="키 관리">
          <p className={styles.guideParagraph}>
            "개발자 도구 → GMCAuto API 키"에서 발급한 키 목록과 누적 호출 수를 확인할 수 있습니다. 각 키 상세 화면에서
            다음 작업이 가능합니다.
          </p>
          <ul className={styles.guideList}>
            <li><strong>이름 변경</strong>: 키의 용도 구분용 이름만 변경합니다. 키 값에는 영향이 없습니다.</li>
            <li><strong>스코프 변경</strong>: 계정 role이 허용하는 범위 내에서 선택 스코프를 다시 켜거나 끌 수 있습니다.</li>
            <li><strong>재발급(Secret 회전)</strong>: <code>keyId</code>는 유지한 채 <code>secret</code>만 새로 발급합니다. 재발급 즉시 기존 secret은 폐기되어 재발급 전 값으로는 더 이상 인증할 수 없습니다.</li>
            <li><strong>삭제</strong>: 키를 영구 삭제합니다. 삭제된 키로의 요청은 즉시 401로 거부됩니다.</li>
          </ul>
        </Section>

        <Section title="유의사항">
          <ul className={styles.guideList}>
            <li>이 API는 서버-서버 전용입니다. 브라우저에서 직접 호출하거나 프런트엔드 코드에 키를 노출하지 마세요.</li>
            <li>호출할 때마다 키의 누적 호출 수(<code>request_count</code>)가 기록되며, 개발자 도구 화면에서 확인할 수 있습니다. 현재 별도의 초당/분당 호출 제한(rate limit)은 적용되어 있지 않지만, 과도한 트래픽이나 비정상적인 사용 패턴이 확인되면 키가 정지될 수 있습니다.</li>
            <li><code>hasApplied</code>는 오늘 날짜 기준 신청 성공 여부만 나타냅니다. 과거 날짜의 성공 여부가 필요하면 <code>full_history</code> 스코프의 <code>history</code> 배열을 사용하세요.</li>
          </ul>
        </Section>
      </div>
    </div>
  )
}
