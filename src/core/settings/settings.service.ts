import { invoke } from "@/core/platform/tauri";

export interface AppSettings {
  onboardingCompleted: boolean;
  hasApiKey: boolean;
}

export async function getAppSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("settings_get");
}

export async function saveApiKey(apiKey: string): Promise<void> {
  await invoke("settings_save_api_key", { apiKey });
}

export async function completeOnboarding(): Promise<void> {
  await invoke("settings_complete_onboarding");
}
