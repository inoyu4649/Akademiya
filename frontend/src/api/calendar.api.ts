import client from "./client";

export interface CalendarEvent {
  id:         number;
  title:      string;
  due_at:     string;
  class_id:   number;
  class_name: string;
}

export interface CalendarCustomEvent {
  id:          number;
  scope_type:  "org" | "class";
  scope_id:    number;
  scope_name:  string;
  title:       string;
  event_date:  string;  // YYYY-MM-DD
  description: string | null;
  color:       string;
  creator_name: string | null;
}

export interface CalendarScope {
  id:         number;
  name:       string;
  scope_type: "org" | "class";
  permission: number;
}

export const calendarApi = {
  // 과제 마감일
  events: (year: number, month: number) =>
    client.get<{ events: CalendarEvent[] }>("/calendar", { params: { year, month } }).then((r) => r.data),

  // 공휴일 (한국천문연구원)
  holidays: (year: number, month: number) =>
    client.get<{ holidays: string[] }>("/calendar/holidays", { params: { year, month } }).then((r) => r.data),

  // 조직/반 이벤트
  customEvents: (year: number, month: number) =>
    client.get<{ events: CalendarCustomEvent[] }>("/calendar/events", { params: { year, month } }).then((r) => r.data),

  // 이벤트 생성 가능한 반/조직 목록
  myScopes: () =>
    client.get<{ scopes: CalendarScope[] }>("/calendar/my-scopes").then((r) => r.data),

  // 이벤트 생성
  createEvent: (data: {
    scope_type: string;
    scope_id: number;
    title: string;
    event_date: string;
    description?: string;
    color?: string;
  }) => client.post("/calendar/events", data),

  // 이벤트 삭제
  deleteEvent: (id: number) => client.delete(`/calendar/events/${id}`),
};
