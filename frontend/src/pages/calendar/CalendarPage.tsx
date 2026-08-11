import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  calendarApi,
  type CalendarCustomEvent,
  type CalendarScope,
} from "../../api/calendar.api";
import styles from "./CalendarPage.module.css";

// i18n 언어 → BCP-47 로케일 매핑
const LOCALE_MAP: Record<string, string> = {
  ko: "ko-KR",
  en: "en-US",
  ja: "ja-JP",
  zh: "zh-CN",
};

const PALETTE = ["#4f7cff", "#13e56a", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316"];

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate()
  );
}

// ── 일정 추가/수정 모달 ───────────────────────────────────────────────────────
function EventModal({
  defaultDate,
  scopes,
  editing,
  onClose,
  onSaved,
}: {
  defaultDate: string;
  scopes: CalendarScope[];
  /** 있으면 수정 모드 */
  editing: CalendarCustomEvent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle]       = useState(editing?.title ?? "");
  const [date, setDate]         = useState(editing ? String(editing.event_date).slice(0, 10) : defaultDate);
  const [desc, setDesc]         = useState(editing?.description ?? "");
  const [color, setColor]       = useState(editing?.color ?? PALETTE[0]);
  const [scopeIdx, setScopeIdx] = useState(0);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const scopeLabel = (s: CalendarScope) =>
    s.scope_type === "personal" ? t("calendar.event.scopePersonal") : `[${t("calendar.event.scopeOrg")}] ${s.name}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError(t("calendar.event.titleRequired")); return; }
    if (!date)         { setError(t("calendar.event.dateRequired")); return; }
    setLoading(true);
    setError("");
    try {
      if (editing) {
        await calendarApi.updateEvent(editing.id, {
          title: title.trim(),
          event_date: date,
          description: desc.trim() || null,
          color,
        });
      } else {
        const scope = scopes[scopeIdx];
        await calendarApi.createEvent({
          scope_type: scope.scope_type,
          // 개인 일정의 scope_id는 서버가 본인 id로 강제하므로 조직일 때만 의미가 있다
          scope_id: scope.scope_type === "org" ? scope.id : undefined,
          title: title.trim(),
          event_date: date,
          description: desc.trim() || undefined,
          color,
        });
      }
      onSaved();
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitle}>
          {editing ? t("calendar.event.editTitle") : t("calendar.event.addTitle")}
        </h3>
        <form onSubmit={handleSubmit}>
          {/* 대상 — 수정 시에는 바꿀 수 없다 */}
          {!editing && (
            <>
              <label className={styles.label}>{t("calendar.event.scopeLabel")}</label>
              <select
                className={styles.input}
                value={scopeIdx}
                onChange={(e) => setScopeIdx(Number(e.target.value))}
              >
                {scopes.map((s, i) => (
                  <option key={i} value={i}>{scopeLabel(s)}</option>
                ))}
              </select>
            </>
          )}

          {/* 제목 */}
          <label className={styles.label}>{t("calendar.event.titleLabel")}</label>
          <input
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("calendar.event.titlePlaceholder")}
            maxLength={300}
          />

          {/* 날짜 */}
          <label className={styles.label}>{t("calendar.event.dateLabel")}</label>
          <input
            className={styles.input}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

          {/* 설명 */}
          <label className={styles.label}>{t("calendar.event.descLabel")}</label>
          <textarea
            className={styles.textarea}
            rows={2}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder={t("calendar.event.descPlaceholder")}
            maxLength={500}
          />

          {/* 색상 */}
          <label className={styles.label}>{t("calendar.event.colorLabel")}</label>
          <div className={styles.colorRow}>
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className={`${styles.colorDot} ${color === c ? styles.colorDotSelected : ""}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>

          {error && <p className={styles.errorMsg}>{error}</p>}

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button type="submit" className={styles.btnConfirm} disabled={loading}>
              {loading ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const { t, i18n } = useTranslation();
  const locale = LOCALE_MAP[i18n.language] ?? i18n.language;

  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [holidays,  setHolidays]  = useState<string[]>([]);
  const [customEvs, setCustomEvs] = useState<CalendarCustomEvent[]>([]);
  const [scopes,    setScopes]    = useState<CalendarScope[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [selected,  setSelected]  = useState<Date | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState<CalendarCustomEvent | null>(null);

  const addDefaultDate = selected
    ? `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(selected.getDate()).padStart(2, "0")}`
    : `${year}-${String(month).padStart(2, "0")}-01`;

  function reloadEvents() {
    calendarApi.customEvents(year, month)
      .then((d) => setCustomEvs(d.events))
      .catch(() => { /* 무시 */ });
  }

  useEffect(() => {
    setLoading(true);
    // Promise.allSettled: 공휴일 API가 실패해도 일정은 정상 표시
    Promise.allSettled([
      calendarApi.holidays(year, month),
      calendarApi.customEvents(year, month),
    ])
      .then(([holResult, cevResult]) => {
        if (holResult.status === "fulfilled") setHolidays(holResult.value.holidays);
        if (cevResult.status === "fulfilled") setCustomEvs(cevResult.value.events);
      })
      .finally(() => setLoading(false));
    setSelected(null);
  }, [year, month]);

  // 일정을 추가할 수 있는 대상 (개인 + 관리자인 조직)
  useEffect(() => {
    calendarApi.myScopes()
      .then((d) => setScopes(d.scopes))
      .catch(() => { /* 무시 */ });
  }, []);

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }

  const grid = useMemo(() => {
    const firstDay    = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month]);

  const dateStr = (day: number) =>
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  function customEventsForDay(day: number) {
    const ds = dateStr(day);
    // slice(0, 10): mysql2가 DATE를 Date객체로 직렬화한 경우("2026-06-07T00:00:00.000Z")에도 안전하게 비교
    return customEvs.filter((e) => String(e.event_date).slice(0, 10) === ds);
  }
  function isHoliday(day: number) {
    return holidays.includes(dateStr(day));
  }
  // 일요일(0) 또는 토요일(6) 여부
  function getDow(day: number) {
    return new Date(year, month - 1, day).getDay();
  }

  const selectedCustom    = selected ? customEventsForDay(selected.getDate()) : [];
  const selectedIsHoliday = selected ? isHoliday(selected.getDate()) : false;

  // 요일 이름: 언어에 따라 동적 생성 (2024-01-07 = 일요일 기준)
  const WEEKDAYS = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Date(2024, 0, 7 + i).toLocaleString(locale, { weekday: "short" })
      ),
    [locale]
  );

  const monthLabel = new Date(year, month - 1, 1).toLocaleString(locale, {
    year: "numeric", month: "long",
  });

  async function handleDeleteEvent(id: number) {
    if (!confirm(t("calendar.event.confirmDelete"))) return;
    try {
      await calendarApi.deleteEvent(id);
      setCustomEvs((prev) => prev.filter((e) => e.id !== id));
    } catch {
      alert(t("common.error"));
    }
  }

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(ev: CalendarCustomEvent) {
    setEditing(ev);
    setModalOpen(true);
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t("calendar.title")}</h1>
        {scopes.length > 0 && (
          <button className={styles.addEventBtn} onClick={openAdd}>
            + {t("calendar.event.addBtn")}
          </button>
        )}
      </div>

      {modalOpen && (
        <EventModal
          defaultDate={addDefaultDate}
          scopes={scopes}
          editing={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            reloadEvents();
          }}
        />
      )}

      <div className={styles.wrapper}>
        {/* Calendar panel */}
        <div className={styles.calendarPanel}>
          <div className={styles.calHeader}>
            <button className={styles.navBtn} onClick={prevMonth}>‹</button>
            <span className={styles.monthLabel}>{monthLabel}</span>
            <button className={styles.navBtn} onClick={nextMonth}>›</button>
          </div>

          <div className={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <div
                key={i}
                className={`${styles.weekCell} ${i === 0 ? styles.sunLabel : i === 6 ? styles.satLabel : ""}`}
              >
                {w}
              </div>
            ))}
          </div>

          {loading ? (
            <div className={styles.loadingRow}>{t("common.loading")}</div>
          ) : (
            <div className={styles.grid}>
              {grid.map((day, idx) => {
                if (day === null) return <div key={idx} className={styles.emptyCell} />;
                const dayCustom = customEventsForDay(day);
                const holiday   = isHoliday(day);
                const dow       = getDow(day);
                const isToday    = isSameDay(new Date(year, month - 1, day), today);
                const isSelected = selected ? isSameDay(selected, new Date(year, month - 1, day)) : false;
                const isSun = dow === 0;
                const isSat = dow === 6;

                return (
                  <div
                    key={idx}
                    className={`${styles.dayCell}
                      ${isToday    ? styles.today    : ""}
                      ${isSelected ? styles.selected : ""}
                      ${dayCustom.length > 0 ? styles.hasEvents : ""}`}
                    onClick={() => setSelected(new Date(year, month - 1, day))}
                  >
                    <span
                      className={`${styles.dayNum}
                        ${holiday || isSun ? styles.dayNumRed : ""}
                        ${isSat ? styles.dayNumBlue : ""}`}
                    >
                      {day}
                    </span>
                    {/* 공휴일 표시 */}
                    {holiday && <span className={styles.holidayDot} title={t("calendar.holiday")} />}
                    {/* 이벤트 점 */}
                    {dayCustom.length > 0 && (
                      <div className={styles.dots}>
                        {dayCustom.slice(0, 4).map((ev, i) => (
                          <span
                            key={`c${i}`}
                            className={styles.dot}
                            style={{ background: ev.color }}
                          />
                        ))}
                        {dayCustom.length > 4 && (
                          <span className={styles.moreCount}>+{dayCustom.length - 4}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className={styles.sidePanel}>
          {selected ? (
            <>
              <h2 className={styles.sideTitle}>
                {selected.toLocaleDateString(locale, { month: "long", day: "numeric" })}
                {selectedIsHoliday && (
                  <span className={styles.holidayBadge}>{t("calendar.holiday")}</span>
                )}
              </h2>

              {selectedCustom.length > 0 ? (
                <div className={styles.evSection}>
                  <ul className={styles.eventList}>
                    {selectedCustom.map((ev) => (
                      <li
                        key={ev.id}
                        className={`${styles.eventItem} ${styles.eventItemClickable}`}
                        style={{ borderLeftColor: ev.color }}
                        onClick={() => openEdit(ev)}
                      >
                        <div className={styles.eventTitle}>{ev.title}</div>
                        <div className={styles.eventClass}>
                          {ev.scope_type === "personal"
                            ? t("calendar.event.scopePersonal")
                            : ev.scope_name}
                        </div>
                        {ev.description && (
                          <div className={styles.eventDesc}>{ev.description}</div>
                        )}
                        <button
                          className={styles.evDeleteBtn}
                          onClick={(e) => { e.stopPropagation(); handleDeleteEvent(ev.id); }}
                          title={t("calendar.event.deleteBtn")}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                !selectedIsHoliday && <p className={styles.sideEmpty}>{t("calendar.noEvents")}</p>
              )}
            </>
          ) : (
            <p className={styles.sideHint}>{t("calendar.selectHint")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
