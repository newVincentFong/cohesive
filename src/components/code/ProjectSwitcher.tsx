import { useEffect, useRef, useState } from "react";
import type { CodeProject } from "@/core/code/agent.types";

interface ProjectSwitcherProps {
  projects: CodeProject[];
  selectedProjectId: string | null;
  onSelectProject: (project: CodeProject) => void;
  onPickProject: () => void;
}

function shortenPath(path: string): string {
  const homeMatch = path.match(/^(\/(?:Users|home)\/[^/]+)(.*)$/);
  if (homeMatch) {
    return `~${homeMatch[2] || ""}`;
  }
  return path;
}

function projectMonogram(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

export function ProjectSwitcher({
  projects,
  selectedProjectId,
  onSelectProject,
  onPickProject,
}: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = projects.find((project) => project.id === selectedProjectId) ?? null;
  const hasProjects = projects.length > 0;

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleTriggerClick() {
    if (!hasProjects) {
      onPickProject();
      return;
    }
    setOpen((current) => !current);
  }

  function handleSelect(project: CodeProject) {
    setOpen(false);
    if (project.id !== selectedProjectId) {
      onSelectProject(project);
    }
  }

  function handleOpenProject() {
    setOpen(false);
    onPickProject();
  }

  return (
    <div ref={rootRef} className="project-switcher-root">
      <button
        type="button"
        className={`project-switcher ${open ? "open" : ""} ${selected ? "" : "empty"}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-demo={hasProjects ? undefined : "pick-project"}
        onClick={handleTriggerClick}
      >
        {selected ? (
          <>
            <span className="project-switcher-monogram" aria-hidden="true">
              {projectMonogram(selected.displayName)}
            </span>
            <span className="project-switcher-meta">
              <span className="project-switcher-name">{selected.displayName}</span>
              <span className="project-switcher-path" title={selected.path}>
                {shortenPath(selected.path)}
              </span>
            </span>
          </>
        ) : (
          <>
            <span className="project-switcher-monogram empty" aria-hidden="true">
              +
            </span>
            <span className="project-switcher-meta">
              <span className="project-switcher-name">Choose a project</span>
              <span className="project-switcher-path">Open a folder to get started</span>
            </span>
          </>
        )}
        {hasProjects ? (
          <span className="project-switcher-chevrons" aria-hidden="true">
            <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
              <path d="M5 1.5L8.5 5H1.5L5 1.5Z" fill="currentColor" />
              <path d="M5 12.5L1.5 9H8.5L5 12.5Z" fill="currentColor" />
            </svg>
          </span>
        ) : null}
      </button>

      {open && hasProjects ? (
        <div className="project-switcher-menu" role="menu">
          {projects.map((project) => {
            const isSelected = project.id === selectedProjectId;
            return (
              <button
                key={project.id}
                type="button"
                role="menuitem"
                className={`project-switcher-menu-item ${isSelected ? "selected" : ""}`}
                onClick={() => handleSelect(project)}
              >
                <span className="project-switcher-menu-check" aria-hidden="true">
                  {isSelected ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2.5 6.2L4.8 8.5L9.5 3.5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </span>
                <span className="project-switcher-menu-copy">
                  <span className="project-switcher-menu-name">{project.displayName}</span>
                  <span className="project-switcher-menu-path" title={project.path}>
                    {shortenPath(project.path)}
                  </span>
                </span>
              </button>
            );
          })}
          <div className="project-switcher-menu-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="project-switcher-menu-item action"
            data-demo="pick-project"
            onClick={handleOpenProject}
          >
            <span className="project-switcher-menu-check" aria-hidden="true" />
            <span className="project-switcher-menu-copy">
              <span className="project-switcher-menu-name">Open project...</span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
