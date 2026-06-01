import client from "./client";

export interface BugReport {
  id:          number;
  title:       string;
  body?:       string;
  browser?:    string;
  os?:         string;
  status:      "open" | "in_progress" | "closed";
  admin_note?: string | null;
  created_at:  string;
  updated_at?: string;
  user_name?:  string;
  user_email?: string;
}

export const bugReportApi = {
  submit: (data: { title: string; body: string; browser?: string; os?: string }) =>
    client.post("/bug-reports", data).then((r) => r.data),

  myReports: () =>
    client.get<{ reports: BugReport[] }>("/bug-reports/my").then((r) => r.data),

  // Admin
  adminList: (status?: string) =>
    client.get<{ reports: BugReport[] }>("/admin/bug-reports", { params: status ? { status } : {} }).then((r) => r.data),

  adminUpdate: (id: number, data: { status?: string; admin_note?: string }) =>
    client.patch(`/admin/bug-reports/${id}`, data).then((r) => r.data),
};
