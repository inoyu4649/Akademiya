import axios from "axios";
import { useAuthStore } from "../store/auth.store";

const client = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise: Promise<string> | null = null;

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config as typeof error.config & { _retry?: boolean };
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      if (!refreshPromise) {
        refreshPromise = axios
          .post<{ accessToken: string }>("/api/auth/refresh", {}, { withCredentials: true })
          .then((res) => {
            const { accessToken } = res.data;
            const { user } = useAuthStore.getState();
            if (user) useAuthStore.getState().setAuth(user, accessToken);
            return accessToken;
          })
          .finally(() => {
            refreshPromise = null;
          });
      }
      try {
        const token = await refreshPromise;
        original.headers.Authorization = `Bearer ${token}`;
        return client(original);
      } catch {
        useAuthStore.getState().clearAuth();
        window.location.href = "/auth/login";
      }
    }
    return Promise.reject(error);
  }
);

export default client;
