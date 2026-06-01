import client from "./client";

export interface AssignmentStat {
  id:              number;
  title:           string;
  due_at:          string | null;
  total_members:   number;
  submitted:       number;
  approved:        number;
  returned:        number;
  not_submitted:   number;
  submission_rate: number;
}

export interface ClassStats {
  class:        { id: number; name: string; timezone: string };
  totalMembers: number;
  canDownload:  boolean;
  assignments:  AssignmentStat[];
}

export interface ClassStat {
  id:               number;
  name:             string;
  member_count:     number;
  total_assignments:number;
  total_submitters: number;
  submission_rate:  number;
}

export interface OrgStats {
  org:         { id: number; name: string };
  canDownload: boolean;
  classes:     ClassStat[];
}

export const statsApi = {
  classStats: (classId: number) =>
    client.get<ClassStats>(`/stats/class/${classId}`).then((r) => r.data),
  orgStats: (orgId: number) =>
    client.get<OrgStats>(`/stats/org/${orgId}`).then((r) => r.data),
  downloadClassCsv: (classId: number) =>
    client.get(`/stats/class/${classId}/csv`, { responseType: "blob" }).then((r) => r.data as Blob),
  downloadOrgCsv: (orgId: number) =>
    client.get(`/stats/org/${orgId}/csv`, { responseType: "blob" }).then((r) => r.data as Blob),
};
