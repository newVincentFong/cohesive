import { useEffect, useRef, useState, type ReactNode } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { deleteSession } from "@/core/session/session.service";
import type { Session } from "@/core/session/session.types";

interface SessionSidebarListProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  onSessionsChange: () => void;
  renderSubtitle?: (session: Session) => ReactNode;
}

export function SessionSidebarList({
  sessions,
  activeSessionId,
  onSelectSession,
  onSessionsChange,
  renderSubtitle,
}: SessionSidebarListProps) {
  const [openMenuSessionId, setOpenMenuSessionId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenuSessionId) return;

    function handlePointerDown(event: MouseEvent) {
      if (!listRef.current?.contains(event.target as Node)) {
        setOpenMenuSessionId(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openMenuSessionId]);

  function toggleMenu(sessionId: string, event: React.MouseEvent) {
    event.stopPropagation();
    setOpenMenuSessionId((current) => (current === sessionId ? null : sessionId));
  }

  async function handleDelete(session: Session) {
    setOpenMenuSessionId(null);

    const confirmed = await confirm(
      `Delete "${session.title}"? This cannot be undone.`,
      { title: "Delete session", kind: "warning" },
    );
    if (!confirmed) return;

    await deleteSession(session.id);
    if (activeSessionId === session.id) {
      onSelectSession(null);
    }
    onSessionsChange();
  }

  return (
    <div ref={listRef}>
      {sessions.map((session) => {
        const menuOpen = openMenuSessionId === session.id;

        return (
          <div
            key={session.id}
            className={`sidebar-item-row ${activeSessionId === session.id ? "active" : ""}`}
          >
            <button
              type="button"
              className="sidebar-item"
              onClick={() => onSelectSession(session.id)}
            >
              <div>{session.title}</div>
              {renderSubtitle ? (
                <div className="muted" style={{ fontSize: 12 }}>
                  {renderSubtitle(session)}
                </div>
              ) : null}
            </button>
            <div className="sidebar-item-actions">
              <button
                type="button"
                className="sidebar-item-menu-trigger"
                aria-label={`Options for ${session.title}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={(event) => toggleMenu(session.id, event)}
              >
                <span className="sidebar-item-menu-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </button>
              {menuOpen ? (
                <div className="sidebar-item-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="sidebar-item-menu-item danger"
                    onClick={() => void handleDelete(session)}
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
