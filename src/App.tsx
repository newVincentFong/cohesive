import { useEffect, useMemo, useState } from "react";
import type { Domain } from "@/core/session/session.types";
import { DEFAULT_DOMAIN, isDomainEnabled } from "@/core/product-flags";
import { AppShell } from "@/components/layout/AppShell";
import { CodeMainPanel, CodeSidebar } from "@/components/code/CodeSurface";
import { MindMainPanel, MindSidebar } from "@/components/mind/MindSurface";
import { WritingMainPanel, WritingSidebar } from "@/components/writing/WritingSurface";
import {
  OnboardingModal,
  useOnboardingGate,
} from "@/components/onboarding/OnboardingModal";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { BrandMark } from "@/components/layout/BrandMark";
import { isDemoMode } from "@/demo/isDemoMode";
import { bootstrapDemoMode } from "@/demo/bootstrap";
import { DemoRuntime } from "@/demo/DemoRuntime";

export default function App() {
  const demo = isDemoMode();
  const { loading, needsOnboarding, refresh } = useOnboardingGate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeDomain, setActiveDomain] = useState<Domain>(DEFAULT_DOMAIN);
  const [activeCodeSessionId, setActiveCodeSessionId] = useState<string | null>(null);
  const [activeMindSessionId, setActiveMindSessionId] = useState<string | null>(null);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [demoReady, setDemoReady] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [demoBootstrapKey, setDemoBootstrapKey] = useState(0);
  const [demoProjectId, setDemoProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!demo) return;
    let cancelled = false;
    setDemoReady(false);
    setDemoError(null);

    void (async () => {
      try {
        const result = await bootstrapDemoMode();
        if (cancelled) return;
        setDemoProjectId(result.projectId);
        setActiveCodeSessionId(result.sessionId);
        setActiveDomain("code");
        await refresh();
        if (!cancelled) setDemoReady(true);
      } catch (err) {
        if (!cancelled) {
          setDemoError(err instanceof Error ? err.message : "Demo bootstrap failed");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // refresh identity changes every render; bootstrap only on explicit retry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, demoBootstrapKey]);

  const sidebar = useMemo(() => {
    if (!isDomainEnabled(activeDomain) || activeDomain === "code") {
      return (
        <CodeSidebar
          activeSessionId={activeCodeSessionId}
          onSelectSession={setActiveCodeSessionId}
        />
      );
    }
    if (activeDomain === "writing") {
      return (
        <WritingSidebar
          activeDocumentId={activeDocumentId}
          onSelectDocument={setActiveDocumentId}
        />
      );
    }
    return (
      <MindSidebar
        activeSessionId={activeMindSessionId}
        onSelectSession={setActiveMindSessionId}
      />
    );
  }, [activeDomain, activeCodeSessionId, activeDocumentId, activeMindSessionId]);

  const mainPanel = useMemo(() => {
    if (!isDomainEnabled(activeDomain) || activeDomain === "code") {
      return <CodeMainPanel activeSessionId={activeCodeSessionId} />;
    }
    if (activeDomain === "writing") {
      return <WritingMainPanel activeDocumentId={activeDocumentId} />;
    }
    return <MindMainPanel activeSessionId={activeMindSessionId} />;
  }, [activeDomain, activeCodeSessionId, activeDocumentId, activeMindSessionId]);

  if (loading && !demo) {
    return (
      <div className="app-loading">
        <div className="brand">
          <BrandMark />
          Cohesive
        </div>
        <div className="app-loading-spinner" aria-label="Loading" />
      </div>
    );
  }

  if (demo && demoError) {
    return (
      <div className="app-loading">
        <div className="brand">
          <BrandMark />
          Demo mode failed
        </div>
        <p className="muted" style={{ maxWidth: 420, textAlign: "center" }}>
          {demoError}
        </p>
        <button
          type="button"
          className="primary-button"
          onClick={() => setDemoBootstrapKey((key) => key + 1)}
        >
          Retry
        </button>
      </div>
    );
  }

  const showOnboarding = !demo && needsOnboarding;

  return (
    <>
      <AppShell
        activeDomain={activeDomain}
        onDomainChange={setActiveDomain}
        onOpenSettings={() => setSettingsOpen(true)}
        sidebar={sidebar}
      >
        {mainPanel}
      </AppShell>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {showOnboarding ? (
        <OnboardingModal
          onCompleted={() => {
            void refresh();
          }}
        />
      ) : null}
      {demo && activeCodeSessionId && demoProjectId ? (
        <DemoRuntime
          projectId={demoProjectId}
          sessionId={activeCodeSessionId}
          ready={demoReady}
          onSessionChange={setActiveCodeSessionId}
        />
      ) : null}
    </>
  );
}
