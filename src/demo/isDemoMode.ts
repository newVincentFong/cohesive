/** True when launched via `npm run tauri:demo` (VITE_COHESIVE_DEMO=1). */
export function isDemoMode(): boolean {
  return import.meta.env.VITE_COHESIVE_DEMO === "1";
}
