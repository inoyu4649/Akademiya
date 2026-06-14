import { Link, useParams } from "react-router-dom";
import {
  akademiyaPrivacyPolicy,
  akademiyaPrivacyPolicyVersions,
  getPrivacyPolicyByVersion,
} from "./privacyContent";
import s from "./PrivacyPolicyPage.module.css";

export default function PrivacyPolicyPage() {
  const { version } = useParams<{ version?: string }>();
  const requested = version ? getPrivacyPolicyByVersion(Number(version)) : undefined;
  const policy = requested ?? akademiyaPrivacyPolicy;
  const isLatest = policy.version === akademiyaPrivacyPolicy.version;

  return (
    <div className={s.wrapper}>
      <div className={s.container}>
        <div className={s.header}>
          <Link to="/" className={s.logoLink}>
            <img src="/logo.png" alt="Akademiya" className={s.logo} />
          </Link>
          <h1 className={s.title}>{policy.title}</h1>
          <p className={s.meta}>
            버전 {policy.version} &nbsp;·&nbsp; 시행일: {policy.effectiveDate}
            {policy.expiryDate ? ` ~ ${policy.expiryDate}` : ""}
            {!isLatest && " (이전 버전)"}
          </p>
        </div>

        <div className={s.preamble}>{policy.preamble}</div>

        <nav className={s.toc}>
          <p className={s.tocTitle}>목차</p>
          <ol className={s.tocList}>
            {policy.sections.map((sec) => (
              <li key={sec.id}>
                <a href={`#${sec.id}`} className={s.tocLink}>
                  {sec.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className={s.body}>
          {policy.sections.map((sec) => (
            <section key={sec.id} id={sec.id} className={s.section}>
              <h2 className={s.sectionTitle}>{sec.title}</h2>
              <div className={s.sectionContent}>
                {sec.content.split("\n").map((line, i) => (
                  <p key={i} className={line === "" ? s.blank : s.line}>
                    {line}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className={s.versionHistory}>
          <p className={s.versionHistoryTitle}>버전 이력</p>
          <ul className={s.versionList}>
            {[...akademiyaPrivacyPolicyVersions].reverse().map((v) => (
              <li key={v.version} className={s.versionItem}>
                <Link to={`/privacy/${v.version}`} className={s.versionLink}>
                  v{v.version} ({v.effectiveDate}
                  {v.expiryDate ? ` ~ ${v.expiryDate}` : " ~ 현재"}) 적용
                </Link>
                {v.version === akademiyaPrivacyPolicy.version && (
                  <span className={s.currentBadge}>현재 버전</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className={s.footer}>
          <Link to="/auth/register" className={s.backLink}>
            ← 회원가입으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
