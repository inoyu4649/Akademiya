import client from "./client";

export interface Notification {
  id: number;
  type:
    | "new_assignment"
    | "deadline_1d"
    | "deadline_3h"
    | "deadline_1h"
    | "deadline_10m"
    | "broadcast"
    | "org_rejected"
    | "class_rejected"
    | "new_survey"
    | "org_kicked"
    | "class_kicked";
  title: string;
  body: string | null;
  link: string | null;
  is_read: number;   // 0 | 1
  created_at: string;
}

export const notificationApi = {
  /** 내 알림 목록 + 미읽음 수 */
  list: () =>
    client
      .get<{ notifications: Notification[]; unreadCount: number }>("/notifications")
      .then((r) => r.data),

  /** 단일 읽음 처리 */
  markRead: (id: number) =>
    client.patch(`/notifications/${id}/read`).then((r) => r.data),

  /** 전체 읽음 처리 */
  markAllRead: () =>
    client.patch("/notifications/read-all").then((r) => r.data),

  /** 알림 단일 삭제 */
  deleteOne: (id: number) =>
    client.delete(`/notifications/${id}`).then((r) => r.data),

  /** 읽은 알림 전체 삭제 */
  deleteRead: () =>
    client.delete("/notifications").then((r) => r.data),

  /** 브로드캐스트 */
  broadcast: (data: {
    title: string;
    body?: string;
    link?: string;
    scope: "class" | "org" | "all";
    scope_id?: number;
  }) => client.post("/notifications/broadcast", data).then((r) => r.data),
};
