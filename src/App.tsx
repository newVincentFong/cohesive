import { useMemo, useState } from "react";
import type { Domain } from "@/core/session/session.types";
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

export default function App() {
  const { loading, needsOnboarding, refresh } = useOnboardingGate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeDomain, setActiveDomain] = useState<Domain>("writing");
  const [activeCodeSessionId, setActiveCodeSessionId] = useState<string | null>(null);
  const [activeMindSessionId, setActiveMindSessionId] = useState<string | null>(null);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);

  const sidebar = useMemo(() => {
    switch (activeDomain) {
      case "code":
        return (
          <CodeSidebar
            activeSessionId={activeCodeSessionId}
            onSelectSession={setActiveCodeSessionId}
          />
        );
      case "writing":
        return (
          <WritingSidebar
            activeDocumentId={activeDocumentId}
            onSelectDocument={setActiveDocumentId}
          />
        );
      case "mind":
        return (
          <MindSidebar
            activeSessionId={activeMindSessionId}
            onSelectSession={setActiveMindSessionId}
          />
        );
    }
  }, [activeDomain, activeCodeSessionId, activeDocumentId, activeMindSessionId]);

  const mainPanel = useMemo(() => {
    switch (activeDomain) {
      case "code":
        return <CodeMainPanel activeSessionId={activeCodeSessionId} />;
      case "writing":
        return <WritingMainPanel activeDocumentId={activeDocumentId} />;
      case "mind":
        return <MindMainPanel activeSessionId={activeMindSessionId} />;
    }
  }, [activeDomain, activeCodeSessionId, activeDocumentId, activeMindSessionId]);

  if (loading) {
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
      {needsOnboarding ? (
        <OnboardingModal
          onCompleted={() => {
            void refresh();
          }}
        />
      ) : null}
    </>
  );
}
