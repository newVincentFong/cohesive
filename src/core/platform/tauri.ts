export async function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(command, args);
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function isMacOSDesktop(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /Mac/i.test(navigator.userAgent);
}

export function isMacFrameless(): boolean {
  return isTauriRuntime() && isMacOSDesktop();
}
