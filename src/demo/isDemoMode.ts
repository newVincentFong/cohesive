/**
 * True when launched via `npm run tauri:demo`
 * (`COHESIVE_DEMO=1` + `VITE_COHESIVE_DEMO=1`).
 *
 * Demo uses an isolated `cohesive-demo.db` (reset each launch) and a stable
 * temp fixture under `{temp}/cohesive-demo`, removed on process exit. It does
 * not write into the production app database.
 */
export function isDemoMode(): boolean {
  return import.meta.env.VITE_COHESIVE_DEMO === "1";
}
