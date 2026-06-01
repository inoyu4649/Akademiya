import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const initialized = useAuthStore((s) => s.initialized);
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!initialized) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-base)", color: "var(--text-secondary)" }}>
        Loading...
      </div>
    );
  }
  if (!accessToken) return <Navigate to="/auth/login" replace />;
  return <>{children}</>;
}
