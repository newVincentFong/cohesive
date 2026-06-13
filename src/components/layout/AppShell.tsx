import type { ReactNode } from "react";
import type { Domain } from "@/core/session/session.types";
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
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">Cohesive</div>
        <DomainSwitch activeDomain={activeDomain} onChange={onDomainChange} />
        <div className="muted">Local first</div>
      </header>
      <div className="workspace">
        <aside className="sidebar">{sidebar}</aside>
        <main className="main-panel">{children}</main>
      </div>
    </div>
  );
}
