import type { ReactNode } from "react";
import type { Domain } from "@/core/session/session.types";
import { isMacFrameless } from "@/core/platform/tauri";
import { DomainSwitch } from "./DomainSwitch";

interface AppShellProps {
  activeDomain: Domain;
  onDomainChange: (domain: Domain) => void;
  sidebar: ReactNode;
  children: ReactNode;
}

export function AppShell({
  activeDomain,
  onDomainChange,
  sidebar,
  children,
}: AppShellProps) {
  const macFrameless = isMacFrameless();

  return (
    <div className={`app-shell${macFrameless ? " mac-frameless" : ""}`}>
      <header className="topbar">
        {macFrameless ? (
          <div className="topbar-traffic-spacer" aria-hidden="true" data-tauri-drag-region />
        ) : null}
        <div className="topbar-leading" data-tauri-drag-region={macFrameless || undefined}>
          <div className="brand">Cohesive</div>
        </div>
        <DomainSwitch activeDomain={activeDomain} onChange={onDomainChange} />
        <div className="topbar-trailing muted" data-tauri-drag-region={macFrameless || undefined}>
          Local first
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">{sidebar}</aside>
        <main className="main-panel">{children}</main>
      </div>
    </div>
  );
}
