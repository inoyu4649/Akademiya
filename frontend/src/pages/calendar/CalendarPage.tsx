import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { calendarApi, type CalendarEvent } from "../../api/calendar.api";
import styles from "./CalendarPage.module.css";

const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

export default function CalendarPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Date | null>(null);

  useEffect(() => {
    setLoading(true);
    calendarApi.events(year, month)
      .then((d) => setEvents(d.events))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
    setSelected(null);
  }, [year, month]);

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }

  // Build calendar grid
  const grid = useMemo(() => {
    const firstDay  = new Date(year, month - 1, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    // pad to full row
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month]);

  function eventsForDay(day: number) {
    const d = new Date(year, month - 1, day);
    return events.filter((e) => isSameDay(new Date(e.due_at), d));
  }

  const selectedEvents = selected ? eventsForDay(selected.getDate()) : [];

  const monthLabel = new Date(year, month - 1, 1).toLocaleString("default", {
    year: "numeric", month: "long",
  });

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>{t("calendar.title")}</h1>

      <div className={styles.wrapper}>
        {/* Calendar panel */}
        <div className={styles.calendarPanel}>
          {/* Header */}
          <div className={styles.calHeader}>
            <button className={styles.navBtn} onClick={prevMonth}>‹</button>
            <span className={styles.monthLabel}>{monthLabel}</span>
            <button className={styles.navBtn} onClick={nextMonth}>›</button>
          </div>

          {/* Weekday labels */}
          <div className={styles.weekRow}>
            {WEEKDAYS_EN.map((w) => (
              <div key={w} className={styles.weekCell}>{w}</div>
            ))}
          </div>

          {/* Day grid */}
          {loading ? (
            <div className={styles.loadingRow}>{t("common.loading")}</div>
          ) : (
            <div className={styles.grid}>
              {grid.map((day, idx) => {
                if (day === null) return <div key={idx} className={styles.emptyCell} />;
                const dayEvents  = eventsForDay(day);
                const isToday    = isSameDay(new Date(year, month - 1, day), today);
                const isSelected = selected ? isSameDay(selected, new Date(year, month - 1, day)) : false;
                return (
                  <div
                    key={idx}
                    className={`${styles.dayCell}
                      ${isToday    ? styles.today    : ""}
                      ${isSelected ? styles.selected : ""}
                      ${dayEvents.length ? styles.hasEvents : ""}`}
                    onClick={() => setSelected(new Date(year, month - 1, day))}
                  >
                    <span className={styles.dayNum}>{day}</span>
                    {dayEvents.length > 0 && (
                      <div className={styles.dots}>
                        {dayEvents.slice(0, 3).map((_, i) => (
                          <span key={i} className={styles.dot} />
                        ))}
                        {dayEvents.length > 3 && <span className={styles.moreCount}>+{dayEvents.length - 3}</span>}
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
              </h2>
              {selectedEvents.length === 0 ? (
                <p className={styles.sideEmpty}>{t("calendar.noEvents")}</p>
              ) : (
                <ul className={styles.eventList}>
                  {selectedEvents.map((ev) => (
                    <li
                      key={ev.id}
                      className={styles.eventItem}
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
