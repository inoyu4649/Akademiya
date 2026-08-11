import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { Suspense, useEffect } from "react";
import { useAuthStore } from "./store/auth.store";
import { authApi } from "./api/auth.api";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import OAuthCallbackPage from "./pages/auth/OAuthCallbackPage";
import CompleteProfilePage from "./pages/auth/CompleteProfilePage";
import AccountCenterPage from "./pages/account/AccountCenterPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import AppLayout from "./components/layout/AppLayout";
import DashboardPage from "./pages/dashboard/DashboardPage";
import AdminPage from "./pages/admin/AdminPage";
import CalendarPage from "./pages/calendar/CalendarPage";
import BugReportPage from "./pages/bugReport/BugReportPage";
import SurveyListPage from "./pages/survey/SurveyListPage";
import SurveyCreatePage from "./pages/survey/SurveyCreatePage";
import SurveyEditPage from "./pages/survey/SurveyEditPage";
import SurveyDetailPage from "./pages/survey/SurveyDetailPage";
import SurveyStatsPage from "./pages/survey/SurveyStatsPage";
import SurveyPublicPage from "./pages/survey/SurveyPublicPage";
import PrivacyPolicyPage from "./pages/privacy/PrivacyPolicyPage";
import TermsOfUsePage from "./pages/privacy/TermsOfUsePage";
import OAuthAppsPage from "./pages/developer/OAuthAppsPage";
import OAuthAppCreatePage from "./pages/developer/OAuthAppCreatePage";
import OAuthAppDetailPage from "./pages/developer/OAuthAppDetailPage";
import OAuthGuidePage from "./pages/developer/OAuthGuidePage";
import OAuthAuthorizePage from "./pages/auth/OAuthAuthorizePage";
import "./App.css";

const router = createBrowserRouter([
  // ── 인증 페이지 (사이드바 없음) ──────────────────────────────
  { path: "/auth/login", element: <LoginPage /> },
  { path: "/auth/register", element: <RegisterPage /> },
  { path: "/auth/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/auth/reset-password", element: <ResetPasswordPage /> },
  { path: "/auth/callback",         element: <OAuthCallbackPage /> },
  { path: "/oauth/authorize",       element: <OAuthAuthorizePage /> },
  {
    path: "/auth/complete-profile",
    element: <ProtectedRoute><CompleteProfilePage /></ProtectedRoute>,
  },

  // ── 공개 페이지 (비로그인 접근 가능) ────────────────────────────
  { path: "/surveys/public/:id", element: <SurveyPublicPage /> },
  { path: "/privacy",             element: <PrivacyPolicyPage /> },
  { path: "/privacy/:version",    element: <PrivacyPolicyPage /> },
  { path: "/terms",               element: <TermsOfUsePage /> },
  { path: "/terms/:version",      element: <TermsOfUsePage /> },

  // ── 앱 페이지 (사이드바 있음) ─────────────────────────────────
  {
    element: <ProtectedRoute><AppLayout /></ProtectedRoute>,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "account",                element: <AccountCenterPage /> },
      // 구 경로 호환 — 사이드바/북마크의 /profile을 계정 센터로 넘긴다
      { path: "profile",                element: <Navigate to="/account" replace /> },
      { path: "admin",                  element: <AdminPage /> },
      { path: "calendar",               element: <CalendarPage /> },
      { path: "bug-report",             element: <BugReportPage /> },
      { path: "surveys",                element: <SurveyListPage /> },
      { path: "surveys/create",         element: <SurveyCreatePage /> },
      { path: "surveys/:id/edit",       element: <SurveyEditPage /> },
      { path: "surveys/:id",            element: <SurveyDetailPage /> },
      { path: "surveys/:id/stats",      element: <SurveyStatsPage /> },
      { path: "developer/oauth",        element: <OAuthAppsPage /> },
      { path: "developer/oauth/create", element: <OAuthAppCreatePage /> },
      { path: "developer/oauth/guide",  element: <OAuthGuidePage /> },
      { path: "developer/oauth/:id",    element: <OAuthAppDetailPage /> },
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
