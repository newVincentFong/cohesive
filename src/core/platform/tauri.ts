export function formatInvokeError(err: unknown): string {
  if (typeof err === "string") {
    return err;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "Something went wrong";
}

export async function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  try {
    return await tauriInvoke<T>(command, args);
  } catch (err) {
    throw new Error(formatInvokeError(err));
  }
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
