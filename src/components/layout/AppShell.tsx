import { useCallback } from "react";
import type { ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Domain } from "@/core/session/session.types";
import { isMacFrameless } from "@/core/platform/tauri";
import { DomainSwitch } from "./DomainSwitch";

interface AppShellProps {
  activeDomain: Domain;
  onDomainChange: (domain: Domain) => void;
  onOpenSettings: () => void;
  sidebar: ReactNode;
  children: ReactNode;
}

export function AppShell({
  activeDomain,
  onDomainChange,
  onOpenSettings,
  sidebar,
  children,
}: AppShellProps) {
  const macFrameless = isMacFrameless();

  const onTopbarPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!macFrameless || event.button !== 0) {
        return;
      }

      const target = event.target as HTMLElement;
      if (
        target.closest(
          "button, a, input, textarea, select, [data-tauri-drag-region='false']",
        )
      ) {
        return;
      }

      void getCurrentWindow().startDragging();
    },
    [macFrameless],
  );

  return (
    <div className={`app-shell${macFrameless ? " mac-frameless" : ""}`}>
      <header
        className="topbar"
        data-tauri-drag-region={macFrameless ? "deep" : undefined}
        onPointerDown={onTopbarPointerDown}
      >
        {macFrameless ? (
          <div className="topbar-traffic-spacer" aria-hidden="true" />
        ) : null}
        <div className="topbar-leading">
          <div className="brand">Cohesive</div>
        </div>
        <div className="topbar-trailing">
          <button
            type="button"
            className="ghost-button"
            data-tauri-drag-region="false"
            onClick={onOpenSettings}
          >
            Settings
          </button>
          <span className="muted">Local first</span>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-domain-switch">
            <DomainSwitch activeDomain={activeDomain} onChange={onDomainChange} />
          </div>
          {sidebar}
        </aside>
        <main className="main-panel">{children}</main>
      </div>
    </div>
  );
}
