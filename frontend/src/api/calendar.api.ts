import client from "./client";

export interface CalendarEvent {
  id:         number;
  title:      string;
  due_at:     string;
  class_id:   number;
  class_name: string;
}

export const calendarApi = {
  events: (year: number, month: number) =>
    client.get<{ events: CalendarEvent[] }>("/calendar", { params: { year, month } }).then((r) => r.data),
};
