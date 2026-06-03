import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  calendarApi,
  type CalendarEvent,
  type CalendarCustomEvent,
  type CalendarScope,
} from "../../api/calendar.api";
import styles from "./CalendarPage.module.css";

const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate()
  );
}

// ── Add Event Modal ───────────────────────────────────────────────────────────
function AddEventModal({
  defaultDate,
  scopes,
  onClose,
  onCreated,
}: {
  defaultDate: string;
  scopes: CalendarScope[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle]       = useState("");
  const [date, setDate]         = useState(defaultDate);
  const [desc, setDesc]         = useState("");
  const [color, setColor]       = useState("#4f7cff");
  const [scopeIdx, setScopeIdx] = useState(0);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError(t("calendar.event.titleRequired")); return; }
    if (!date)         { setError(t("calendar.event.dateRequired")); return; }
    const scope = scopes[scopeIdx];
    setLoading(true);
    try {
      await calendarApi.createEvent({
        scope_type: scope.scope_type,
        scope_id: scope.id,
        title: title.trim(),
        event_date: date,
        description: desc.trim() || undefined,
        color,
      });
      onCreated();
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitle}>{t("calendar.event.addTitle")}</h3>
        <form onSubmit={handleCreate}>
          {/* 대상 */}
          <label className={styles.label}>{t("calendar.event.scopeLabel")}</label>
          <select
            className={styles.input}
            value={scopeIdx}
            onChange={(e) => setScopeIdx(Number(e.target.value))}
          >
            {scopes.map((s, i) => (
              <option key={i} value={i}>
                [{s.scope_type === "class" ? t("calendar.event.scopeClass") : t("calendar.event.scopeOrg")}] {s.name}
              </option>
            ))}
          </select>

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
            {["#4f7cff", "#13e56a", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316"].map((c) => (
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
  const { t } = useTranslation();
  const navigate = useNavigate();

  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [events,    setEvents]    = useState<CalendarEvent[]>([]);
  const [holidays,  setHolidays]  = useState<string[]>([]);
  const [customEvs, setCustomEvs] = useState<CalendarCustomEvent[]>([]);
  const [scopes,    setScopes]    = useState<CalendarScope[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [selected,  setSelected]  = useState<Date | null>(null);
  const [addOpen,   setAddOpen]   = useState(false);

  const addDefaultDate = selected
    ? `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(selected.getDate()).padStart(2, "0")}`
    : `${year}-${String(month).padStart(2, "0")}-01`;

  useEffect(() => {
    setLoading(true);
    Promise.all([
      calendarApi.events(year, month),
      calendarApi.holidays(year, month),
      calendarApi.customEvents(year, month),
    ])
      .then(([ev, hol, cev]) => {
        setEvents(ev.events);
        setHolidays(hol.holidays);
        setCustomEvs(cev.events);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    setSelected(null);
  }, [year, month]);

  // 이벤트 추가 가능 반/조직 목록
  useEffect(() => {
    calendarApi.myScopes()
      .then((d) => setScopes(d.scopes))
      .catch(() => {});
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

  function assignmentsForDay(day: number) {
    const d = new Date(year, month - 1, day);
    return events.filter((e) => isSameDay(new Date(e.due_at), d));
  }
  function customEventsForDay(day: number) {
    const ds = dateStr(day);
    return customEvs.filter((e) => e.event_date === ds);
  }
  function isHoliday(day: number) {
    return holidays.includes(dateStr(day));
  }
  // 일요일(0) 또는 토요일(6) 여부
  function getDow(day: number) {
    return new Date(year, month - 1, day).getDay();
  }

  const selectedAssignments = selected ? assignmentsForDay(selected.getDate()) : [];
  const selectedCustom      = selected ? customEventsForDay(selected.getDate()) : [];
  const selectedIsHoliday   = selected ? isHoliday(selected.getDate()) : false;

  const monthLabel = new Date(year, month - 1, 1).toLocaleString("default", {
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

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t("calendar.title")}</h1>
        {scopes.length > 0 && (
          <button className={styles.addEventBtn} onClick={() => setAddOpen(true)}>
            + {t("calendar.event.addBtn")}
          </button>
        )}
      </div>

      {/* Add event modal */}
      {addOpen && (
        <AddEventModal
          defaultDate={addDefaultDate}
          scopes={scopes}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            // 새로고침
            calendarApi.customEvents(year, month)
              .then((d) => setCustomEvs(d.events))
              .catch(() => {});
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
            {WEEKDAYS_EN.map((w, i) => (
              <div
                key={w}
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
                const dayAssignments = assignmentsForDay(day);
                const dayCustom      = customEventsForDay(day);
                const holiday        = isHoliday(day);
                const dow            = getDow(day);
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
                      ${(dayAssignments.length + dayCustom.length) > 0 ? styles.hasEvents : ""}`}
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
                    {(dayAssignments.length + dayCustom.length) > 0 && (
                      <div className={styles.dots}>
                        {dayAssignments.slice(0, 2).map((_, i) => (
                          <span key={`a${i}`} className={styles.dot} />
                        ))}
                        {dayCustom.slice(0, 2).map((ev, i) => (
                          <span
                            key={`c${i}`}
                            className={styles.dot}
                            style={{ background: ev.color }}
                          />
                        ))}
                        {dayAssignments.length + dayCustom.length > 4 && (
                          <span className={styles.moreCount}>
                            +{dayAssignments.length + dayCustom.length - 4}
                          </span>
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
                {selected.toLocaleDateString("default", { month: "long", day: "numeric" })}
                {selectedIsHoliday && (
                  <span className={styles.holidayBadge}>{t("calendar.holiday")}</span>
                )}
              </h2>

              {/* 조직/반 이벤트 */}
              {selectedCustom.length > 0 && (
                <div className={styles.evSection}>
                  <div className={styles.evSectionLabel}>{t("calendar.customEvents")}</div>
                  <ul className={styles.eventList}>
                    {selectedCustom.map((ev) => (
                      <li key={ev.id} className={styles.eventItem} style={{ borderLeftColor: ev.color }}>
                        <div className={styles.eventTitle}>{ev.title}</div>
                        <div className={styles.eventClass}>{ev.scope_name}</div>
                        {ev.description && (
                          <div className={styles.eventDesc}>{ev.description}</div>
                        )}
                        <button
                          className={styles.evDeleteBtn}
                          onClick={(e) => { e.stopPropagation(); handleDeleteEvent(ev.id); }}
                          title={t("common.cancel")}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 과제 마감일 */}
              {selectedAssignments.length > 0 ? (
                <div className={styles.evSection}>
                  <div className={styles.evSectionLabel}>{t("calendar.assignments")}</div>
                  <ul className={styles.eventList}>
                    {selectedAssignments.map((ev) => (
                      <li
                        key={ev.id}
                        className={`${styles.eventItem} ${styles.assignmentItem}`}
                        onClick={() => navigate(`/assignments/${ev.id}`)}
                      >
                        <div className={styles.eventTitle}>{ev.title}</div>
                        <div className={styles.eventClass}>{ev.class_name}</div>
                        <div className={styles.eventTime}>
                          {new Date(ev.due_at).toLocaleTimeString("default", {
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : selectedCustom.length === 0 && !selectedIsHoliday ? (
                <p className={styles.sideEmpty}>{t("calendar.noEvents")}</p>
              ) : null}
            </>
          ) : (
            <p className={styles.sideHint}>{t("calendar.selectHint")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
