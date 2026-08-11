import client from "./client";

export type CalendarScopeType = "org" | "personal";

export interface CalendarCustomEvent {
  id:           number;
  scope_type:   CalendarScopeType;
  scope_id:     number;
  scope_name:   string | null;   // 개인 일정이면 null
  title:        string;
  event_date:   string;          // YYYY-MM-DD
  description:  string | null;
  color:        string;
  creator_name: string | null;
}

export interface CalendarScope {
  id:         number;
  name:       string | null;     // 개인 일정이면 null (UI에서 i18n 문구로 대체)
  scope_type: CalendarScopeType;
  permission: number;
}

export const calendarApi = {
  // 공휴일 (한국천문연구원)
  holidays: (year: number, month: number) =>
    client.get<{ holidays: string[] }>("/calendar/holidays", { params: { year, month } }).then((r) => r.data),

  // 개인 일정 + 가입한 조직의 일정
  customEvents: (year: number, month: number) =>
    client.get<{ events: CalendarCustomEvent[] }>("/calendar/events", { params: { year, month } }).then((r) => r.data),

  // 일정을 추가할 수 있는 대상 (항상 "개인" + 관리자인 조직)
  myScopes: () =>
    client.get<{ scopes: CalendarScope[] }>("/calendar/my-scopes").then((r) => r.data),

  createEvent: (data: {
    scope_type: CalendarScopeType;
    scope_id?: number;           // 개인 일정은 서버가 본인 id로 강제
    title: string;
    event_date: string;
    description?: string;
    color?: string;
  }) => client.post("/calendar/events", data),

  updateEvent: (id: number, data: {
    title?: string;
    event_date?: string;
    description?: string | null;
    color?: string;
  }) => client.patch(`/calendar/events/${id}`, data),

  deleteEvent: (id: number) => client.delete(`/calendar/events/${id}`),
};
