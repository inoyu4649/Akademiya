import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { Suspense, useEffect } from "react";
import { useAuthStore } from "./store/auth.store";
import { authApi } from "./api/auth.api";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import OAuthCallbackPage from "./pages/auth/OAuthCallbackPage";
import GmcAutoOAuthPage from "./pages/auth/GmcAutoOAuthPage";
import CompleteProfilePage from "./pages/auth/CompleteProfilePage";
import ProfilePage from "./pages/auth/ProfilePage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import AppLayout from "./components/layout/AppLayout";
import OrgListPage from "./pages/org/OrgListPage";
import OrgApplyPage from "./pages/org/OrgApplyPage";
import OrgJoinPage from "./pages/org/OrgJoinPage";
import OrgDetailPage from "./pages/org/OrgDetailPage";
import ClassListPage from "./pages/class/ClassListPage";
import ClassApplyPage from "./pages/class/ClassApplyPage";
import ClassJoinPage from "./pages/class/ClassJoinPage";
import ClassDetailPage from "./pages/class/ClassDetailPage";
import ClassResourcesPage from "./pages/class/ClassResourcesPage";
import AssignmentListPage from "./pages/assignment/AssignmentListPage";
import AssignmentCreatePage from "./pages/assignment/AssignmentCreatePage";
import AssignmentDetailPage from "./pages/assignment/AssignmentDetailPage";
import ReportManagePage from "./pages/report/ReportManagePage";
import AdminPage from "./pages/admin/AdminPage";
import CalendarPage from "./pages/calendar/CalendarPage";
import ClassStatsPage from "./pages/stats/ClassStatsPage";
import OrgStatsPage from "./pages/stats/OrgStatsPage";
import BugReportPage from "./pages/bugReport/BugReportPage";
import SurveyListPage from "./pages/survey/SurveyListPage";
import SurveyCreatePage from "./pages/survey/SurveyCreatePage";
import SurveyEditPage from "./pages/survey/SurveyEditPage";
import SurveyDetailPage from "./pages/survey/SurveyDetailPage";
import SurveyStatsPage from "./pages/survey/SurveyStatsPage";
import SurveyPublicPage from "./pages/survey/SurveyPublicPage";
import PrivacyPolicyPage from "./pages/privacy/PrivacyPolicyPage";
import TermsOfUsePage from "./pages/privacy/TermsOfUsePage";
import "./App.css";

const router = createBrowserRouter([
  // ── 인증 페이지 (사이드바 없음) ──────────────────────────────
  { path: "/auth/login", element: <LoginPage /> },
  { path: "/auth/register", element: <RegisterPage /> },
  { path: "/auth/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/auth/reset-password", element: <ResetPasswordPage /> },
  { path: "/auth/callback",         element: <OAuthCallbackPage /> },
  { path: "/auth/gmcauto-oauth",    element: <GmcAutoOAuthPage /> },
  {
    path: "/auth/complete-profile",
    element: <ProtectedRoute><CompleteProfilePage /></ProtectedRoute>,
  },

  // ── 공개 페이지 (비로그인 접근 가능) ────────────────────────────
  { path: "/surveys/public/:id", element: <SurveyPublicPage /> },
  { path: "/privacy",             element: <PrivacyPolicyPage /> },
  { path: "/terms",               element: <TermsOfUsePage /> },

  // ── 앱 페이지 (사이드바 있음) ─────────────────────────────────
  {
    element: <ProtectedRoute><AppLayout /></ProtectedRoute>,
    children: [
      { index: true, element: <OrgListPage /> },
      { path: "org/apply", element: <OrgApplyPage /> },
      { path: "org/join", element: <OrgJoinPage /> },
      { path: "org/:id", element: <OrgDetailPage /> },
      { path: "classes", element: <ClassListPage /> },
      { path: "classes/apply", element: <ClassApplyPage /> },
      { path: "classes/join", element: <ClassJoinPage /> },
      { path: "classes/:id", element: <ClassDetailPage /> },
      { path: "classes/:classId/resources",   element: <ClassResourcesPage /> },
      { path: "classes/:classId/assignments", element: <AssignmentListPage /> },
      { path: "classes/:classId/assignments/create", element: <AssignmentCreatePage /> },
      { path: "assignments/:id", element: <AssignmentDetailPage /> },
      { path: "reports",                element: <ReportManagePage /> },
      { path: "admin",                  element: <AdminPage /> },
      { path: "profile",                element: <ProfilePage /> },
      { path: "calendar",               element: <CalendarPage /> },
      { path: "classes/:classId/stats", element: <ClassStatsPage /> },
      { path: "org/:id/stats",          element: <OrgStatsPage /> },
      { path: "bug-report",             element: <BugReportPage /> },
      { path: "surveys",                element: <SurveyListPage /> },
      { path: "surveys/create",         element: <SurveyCreatePage /> },
      { path: "surveys/:id/edit",       element: <SurveyEditPage /> },
      { path: "surveys/:id",            element: <SurveyDetailPage /> },
      { path: "surveys/:id/stats",      element: <SurveyStatsPage /> },
    ],
  },

  { path: "*", element: <Navigate to="/auth/login" replace /> },
]);

// 페이지 리프레시 시 세션 복원: refresh 쿠키로 access token + user 복원
function AuthInitializer() {
  const { initialized, setAuth, setInitialized } = useAuthStore();

  useEffect(() => {
    if (initialized) return;
    authApi
      .refresh()
      .then((res) => {
        setAuth(res.data.user, res.data.accessToken);
      })
      .catch(() => {
        setInitialized(true);
      });
  }, []);

  return null;
}

export default function App() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: "var(--text-secondary)" }}>Loading...</div>}>
      <AuthInitializer />
      <RouterProvider router={router} />
    </Suspense>
  );
}
