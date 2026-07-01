import { useSettingsStore } from "../store/settings.store";
import { useAuthStore } from "../store/auth.store";
import { unlockVault } from "../api/vault.api";

// "기기에 저장" 옵션이 켜져 있고 저장된 비밀번호가 있으면 조용히 볼트 언락을 시도한다.
export async function tryAutoUnlock(): Promise<boolean> {
  const { savePasswordLocally, savedVaultPassword } = useSettingsStore.getState();
  const token = useAuthStore.getState().accessToken;
  if (!savePasswordLocally || !savedVaultPassword || !token) return false;
  try {
    await unlockVault(token, savedVaultPassword);
    return true;
  } catch {
    return false;
  }
}
