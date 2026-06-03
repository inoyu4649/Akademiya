import client from "./client";

export interface Assignment {
  id: number;
  class_id: number;
  title: string;
  description: string | null;
  due_at: string | null;
  created_at: string;
  creator_name: string;
  // list only
  my_status?: "submitted" | "approved" | "returned" | null;
  my_submitted_at?: string | null;
  // detail only
  class_name?: string;
  org_id?: number;
  timezone?: string;
}

export interface SubmissionFile {
  id: number;
  file_url: string;
  original_name: string;
  file_size: number;
}

export interface Submission {
  // leader list view fields
  user_id?: number;
  submission_id?: number;
  display_name?: string;
  email?: string;
  // common fields
  id?: number;
  file_url: string | null;  // legacy (kept for backward compat)
  link_url: string | null;
  files?: SubmissionFile[]; // multi-file
  status: "submitted" | "approved" | "returned";
  feedback: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface Comment {
  id: number;
  content: string;
  is_filtered: number;
  created_at: string;
  user_id: number;
  display_name: string;
}

export const assignmentApi = {
  // assignments
  create: (data: { class_id: number; title: string; description?: string; due_at?: string }) =>
    client.post("/assignments", data),

  listByClass: (classId: number) =>
    client.get<{ assignments: Assignment[]; myPermission: number }>(`/assignments/class/${classId}`),

  detail: (id: number) =>
    client.get<{ assignment: Assignment; myPermission: number; mySubmission: Submission | null }>(
      `/assignments/${id}`
    ),

  update: (id: number, data: { title?: string; description?: string; due_at?: string }) =>
    client.patch(`/assignments/${id}`, data),

  delete: (id: number) =>
    client.delete(`/assignments/${id}`),

  // submissions (always use FormData)
  submit: (formData: FormData) =>
    client.post("/submissions", formData),

  getSubmissions: (assignmentId: number) =>
    client.get<{ submissions: Submission[]; isLeader: boolean }>(
      `/submissions/assignment/${assignmentId}`
    ),

  approveSubmission: (id: number) =>
    client.post(`/submissions/${id}/approve`),

  returnSubmission: (id: number, feedback: string) =>
    client.post(`/submissions/${id}/return`, { feedback }),

  // comments
  addComment: (data: { assignment_id: number; content: string }) =>
    client.post("/comments", data),

  getComments: (assignmentId: number) =>
    client.get<{ comments: Comment[] }>(`/comments/assignment/${assignmentId}`),

  deleteComment: (id: number) =>
    client.delete(`/comments/${id}`),
};
