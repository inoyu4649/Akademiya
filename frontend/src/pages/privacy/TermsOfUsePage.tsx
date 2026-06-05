import { Link } from "react-router-dom";
import { akademiyaTermsOfUse } from "./privacyContent";
import s from "./PrivacyPolicyPage.module.css";

export default function TermsOfUsePage() {
  const terms = akademiyaTermsOfUse;

  return (
    <div className={s.wrapper}>
      <div className={s.container}>
        <div className={s.header}>
          <Link to="/" className={s.logoLink}>
            <img src="/logo.png" alt="Akademiya" className={s.logo} />
          </Link>
          <h1 className={s.title}>{terms.title}</h1>
          <p className={s.meta}>
            버전 {terms.version} &nbsp;·&nbsp; 시행일: {terms.effectiveDate}
          </p>
        </div>

        <div className={s.preamble}>{terms.preamble}</div>

        <nav className={s.toc}>
          <p className={s.tocTitle}>목차</p>
          <ol className={s.tocList}>
            {terms.sections.map((sec) => (
              <li key={sec.id}>
                <a href={`#${sec.id}`} className={s.tocLink}>
                  {sec.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className={s.body}>
          {terms.sections.map((sec) => (
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

        <div className={s.footer}>
          <Link to="/auth/register" className={s.backLink}>
            ← 회원가입으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
