import client from "./client";

export interface SurveyQuestion {
  id:       number;
  order_num: number;
  type:     "single" | "multiple" | "text" | "rating";
  title:    string;
  required: number;
  options?: SurveyOption[];
}

export interface SurveyOption {
  id:        number;
  order_num: number;
  label:     string;
}

export interface Survey {
  id:              number;
  creator_id:      number;
  creator_name:    string;
  title:           string;
  description:     string | null;
  scope_type:      "class" | "org" | "public";
  scope_id:        number | null;
  is_active:       number;
  allow_anonymous: number;
  allow_edit:      number;  // 응답 수정 허용
  allow_multiple:  number;  // 복수 응답 허용
  expires_at:      string | null;
  created_at:      string;
  // extra fields in feed/list
  scope_name?:     string;
  response_count?: number;
  already_responded?: number;
}

export interface MyAnswerItem {
  question_id: number;
  option_id:   number | null;
  text_answer: string | null;
}

export interface SurveyAnswer {
  question_id: number;
  option_ids?: number[];
  text_answer?: string;
}

export const surveyApi = {
  // 설문 생성
  create: (data: {
    title: string;
    description?: string;
    scope_type: string;
    scope_id?: number | null;
    allow_anonymous?: boolean;
    allow_edit?: boolean;
    allow_multiple?: boolean;
    expires_at?: string | null;
    questions: Array<{
      type: string;
      title: string;
      required?: boolean;
      options?: string[];
    }>;
  }) => client.post<{ surveyId: number }>("/surveys", data),

  // 내가 만든 설문
  my: () =>
    client.get<{ surveys: Survey[] }>("/surveys/my").then((r) => r.data),

  // 내 반/조직의 진행중 설문 피드
  feed: () =>
    client.get<{ surveys: Survey[] }>("/surveys/feed").then((r) => r.data),

  // 반의 설문 목록
  byClass: (classId: number) =>
    client.get<{ surveys: Survey[] }>(`/surveys/class/${classId}`).then((r) => r.data),

  // 조직의 설문 목록
  byOrg: (orgId: number) =>
    client.get<{ surveys: Survey[] }>(`/surveys/org/${orgId}`).then((r) => r.data),

  // 설문 상세 (로그인)
  detail: (id: number) =>
    client.get<{
      survey: Survey;
      questions: SurveyQuestion[];
      alreadyResponded: boolean;
      myAnswers: MyAnswerItem[];
      canViewStats: boolean;
      isCreator: boolean;
    }>(`/surveys/${id}`).then((r) => r.data),

  // 공개 설문 (비로그인)
  publicDetail: (id: number) =>
    client.get<{ survey: Survey; questions: SurveyQuestion[] }>(`/surveys/public/${id}`).then((r) => r.data),

  // 응답 제출 (로그인)
  respond: (id: number, answers: SurveyAnswer[]) =>
    client.post(`/surveys/${id}/respond`, { answers }),

  // 공개 설문 응답 제출 (비로그인)
  publicRespond: (id: number, answers: SurveyAnswer[]) =>
    client.post(`/surveys/public/${id}/respond`, { answers }),

  // 응답 수정 (allow_edit)
  editResponse: (id: number, answers: SurveyAnswer[]) =>
    client.put(`/surveys/${id}/respond`, { answers }),

  // 통계
  stats: (id: number) =>
    client.get<{
      survey: Survey;
      questions: SurveyQuestion[];
      totalResponses: number;
      statViewers: Array<{ id: number; display_name: string; email: string }>;
    }>(`/surveys/${id}/stats`).then((r) => r.data),

  // 통계 조회 권한 추가
  addViewer: (id: number, email: string) =>
    client.post(`/surveys/${id}/viewers`, { email }),

  // 통계 조회 권한 제거
  removeViewer: (id: number, userId: number) =>
    client.delete(`/surveys/${id}/viewers/${userId}`),

  // 설문 수정 (활성화/비활성화, 만료일 등)
  update: (id: number, data: { title?: string; description?: string; is_active?: boolean; expires_at?: string | null }) =>
    client.patch(`/surveys/${id}`, data),

  // 설문 삭제
  delete: (id: number) => client.delete(`/surveys/${id}`),
};
