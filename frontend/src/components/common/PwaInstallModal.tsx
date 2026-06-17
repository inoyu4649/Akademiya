import { useTranslation } from "react-i18next";
import styles from "./PwaInstallModal.module.css";

type OsType = "ios" | "ipados" | "android" | "windows" | "mac" | "linux" | "unknown";

export function detectOs(): OsType {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ipados";
  if (/iPhone/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows/.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/.test(ua)) return "mac";
  if (/Linux/.test(ua)) return "linux";
  return "unknown";
}

function InstallGuide({ os }: { os: OsType }) {
  const { t } = useTranslation();
  const isSafari =
    /Safari/.test(navigator.userAgent) &&
    !/CriOS|FxiOS|EdgiOS|Chrome/.test(navigator.userAgent);

  if (os === "ios" || os === "ipados") {
    const device = os === "ipados" ? "iPad" : "iPhone";
    return (
      <div>
        <p
          className={styles.guideText}
          dangerouslySetInnerHTML={{ __html: t("pwaInstall.iosTitle", { device }) }}
        />
        {!isSafari && (
          <div
            className={styles.warningBox}
            dangerouslySetInnerHTML={{ __html: t("pwaInstall.iosNotSafari") }}
          />
        )}
        <ol className={styles.stepList}>
          <li dangerouslySetInnerHTML={{ __html: t("pwaInstall.step1") }} />
          {os === "ipados" ? (
            <>
              <li dangerouslySetInnerHTML={{ __html: t("pwaInstall.iosIpadStep2") }} />
              <li dangerouslySetInnerHTML={{ __html: t("pwaInstall.iosIpadStep3") }} />
            </>
          ) : (
            <>
              <li dangerouslySetInnerHTML={{ __html: t("pwaInstall.iosStep2") }} />
              <li dangerouslySetInnerHTML={{ __html: t("pwaInstall.iosStep3") }} />
              <li dangerouslySetInnerHTML={{ __html: t("pwaInstall.iosStep4") }} />
            </>
          )}
          <li dangerouslySetInnerHTML={{ __html: t("pwaInstall.iosStep5") }} />
          <li dangerouslySetInnerHTML={{ __html: t("pwaInstall.iosStep6") }} />
        </ol>
      </div>
    );
  }

  if (os === "android") {
    return (
      <div>
        <p className={styles.guideText}>{t("pwaInstall.androidTitle")}</p>
        <ol className={styles.stepList}>
          <li dangerouslySetInnerHTML={{ __html: t("pwaInstall.androidStep1") }} />
          <li dangerouslySetInnerHTML={{ __html: t("pwaInstall.androidStep2") }} />
          <li dangerouslySetInnerHTML={{ __html: t("pwaInstall.androidStep3") }} />
          <li dangerouslySetInnerHTML={{ __html: t("pwaInstall.androidStep4") }} />
        </ol>
      </div>
    );
  }

  return (
    <div>
      <p className={styles.guideText}>{t("pwaInstall.pcTitle")}</p>
      <ol className={styles.stepList}>
        <li dangerouslySetInnerHTML={{ __html: t("pwaInstall.pcStep1") }} />
        <li dangerouslySetInnerHTML={{ __html: t("pwaInstall.pcStep2") }} />
        <li dangerouslySetInnerHTML={{ __html: t("pwaInstall.pcStep3") }} />
        <li dangerouslySetInnerHTML={{ __html: t("pwaInstall.pcStep4") }} />
      </ol>
    </div>
  );
}

interface Props {
  onClose: () => void;
}

export default function PwaInstallModal({ onClose }: Props) {
  const { t } = useTranslation();
  const os = detectOs();

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h3 className={styles.title}>{t("pwaInstall.modalTitle")}</h3>
        <InstallGuide os={os} />
        <button className={styles.closeBtn} onClick={onClose}>
          {t("pwaInstall.modalClose")}
        </button>
      </div>
    </div>
  );
}
