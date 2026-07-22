import { useEffect, useRef, useState } from "react";
import { bootstrapDemoMode, type DemoBootstrapResult } from "./bootstrap";
import { isDemoMode } from "./isDemoMode";

interface UseDemoModeOptions {
  /** Called after fixture + session are ready (e.g. seed App session/domain). */
  onBootstrapped: (result: DemoBootstrapResult) => void | Promise<void>;
}

/**
 * Owns demo bootstrap lifecycle when launched via `npm run tauri:demo`.
 * No-ops when not in demo mode.
 */
export function useDemoMode({ onBootstrapped }: UseDemoModeOptions) {
  const demo = isDemoMode();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapKey, setBootstrapKey] = useState(0);
  const [projectId, setProjectId] = useState<string | null>(null);
  const onBootstrappedRef = useRef(onBootstrapped);
  onBootstrappedRef.current = onBootstrapped;

  useEffect(() => {
    if (!demo) return;
    let cancelled = false;
    setReady(false);
    setError(null);

    void (async () => {
      try {
        const result = await bootstrapDemoMode();
        if (cancelled) return;
        setProjectId(result.projectId);
        await onBootstrappedRef.current(result);
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Demo bootstrap failed");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [demo, bootstrapKey]);

  return {
    demo,
    ready,
    error,
    projectId,
    retry: () => setBootstrapKey((key) => key + 1),
  };
}
