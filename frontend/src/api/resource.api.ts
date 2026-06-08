import axios from "axios";
import { useAuthStore } from "../store/auth.store";

const API = import.meta.env.VITE_API_URL ?? "";

function authHeaders() {
  const token = useAuthStore.getState().accessToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface ResourceFile {
  id: number;
  file_url: string;
  original_name: string;
  file_size: number;
}

export interface Resource {
  id: number;
  title: string;
  description: string | null;
  link_url: string | null;
  creator_name: string;
  created_at: string;
  files: ResourceFile[];
}

export const resourceApi = {
  list: (classId: number) =>
    axios.get<{ resources: Resource[]; isLeader: boolean }>(
      `${API}/api/resources/class/${classId}`,
      { headers: authHeaders(), withCredentials: true }
    ),

  upload: (formData: FormData) =>
    axios.post<{ id: number }>(`${API}/api/resources`, formData, {
      headers: { ...authHeaders() },
      withCredentials: true,
    }),

  remove: (id: number) =>
    axios.delete(`${API}/api/resources/${id}`, {
      headers: authHeaders(),
      withCredentials: true,
    }),
};
