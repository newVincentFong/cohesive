import { useMemo, useState } from "react";
import type { AgentTraceColumn } from "@/core/code/agents/agent-trace.types";
import {
  buildSpanTree,
  formatDuration,
  spanTreeExtent,
  type SpanNode,
} from "@/core/code/agents/agent-trace-spans";

const MIN_BAR_WIDTH_PERCENT = 0.6;

interface SpanRowProps {
  node: SpanNode;
  depth: number;
  extent: { min: number; max: number };
  selectedId: string | null;
  collapsed: Set<string>;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}

function SpanRow({
  node,
  depth,
  extent,
  selectedId,
  collapsed,
  onSelect,
  onToggleCollapse,
}: SpanRowProps) {
  const total = extent.max - extent.min;
  const left = ((node.start - extent.min) / total) * 100;
  const width = Math.max(
    ((node.end - node.start) / total) * 100,
    MIN_BAR_WIDTH_PERCENT,
  );
  const isCollapsed = collapsed.has(node.id);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <>
      <div
        className={`span-row ${isSelected ? "span-row--selected" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => onSelect(node.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onSelect(node.id);
        }}
      >
        <div className="span-row-label" style={{ paddingLeft: depth * 16 }}>
          {hasChildren ? (
            <button
              type="button"
              className="span-row-caret"
              onClick={(event) => {
                event.stopPropagation();
                onToggleCollapse(node.id);
              }}
              aria-label={isCollapsed ? "Expand" : "Collapse"}
            >
              {isCollapsed ? "▸" : "▾"}
            </button>
          ) : (
            <span className="span-row-caret span-row-caret--placeholder" />
          )}
          <span className={`span-kind-dot span-kind-dot--${node.kind}`} aria-hidden="true" />
          <span className="span-row-name" title={node.label}>
            {node.label}
          </span>
        </div>
        <div className="span-row-track">
          <div
            className={`span-bar span-bar--${node.kind} span-bar--${node.status}`}
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        </div>
        <div className="span-row-duration">
          {formatDuration(node.end - node.start)}
        </div>
      </div>
      {!isCollapsed
        ? node.children.map((child) => (
            <SpanRow
              key={child.id}
              node={child}
              depth={depth + 1}
              extent={extent}
              selectedId={selectedId}
              collapsed={collapsed}
              onSelect={onSelect}
              onToggleCollapse={onToggleCollapse}
            />
          ))
        : null}
    </>
  );
}

function findSpan(roots: SpanNode[], id: string): SpanNode | null {
  for (const root of roots) {
    if (root.id === id) return root;
    const found = findSpan(root.children, id);
    if (found) return found;
  }
  return null;
}

export function AgentSpanTree({ columns }: { columns: AgentTraceColumn[] }) {
  const roots = useMemo(() => buildSpanTree(columns), [columns]);
  const extent = useMemo(() => spanTreeExtent(roots), [roots]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (roots.length === 0) {
    return <div className="muted agent-trace-empty">No spans recorded for this run.</div>;
  }

  const selected = selectedId ? findSpan(roots, selectedId) : null;

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="span-tree">
      <div className="span-tree-header">
        <span className="span-tree-legend">
          <span className="span-kind-dot span-kind-dot--agent" /> agent
          <span className="span-kind-dot span-kind-dot--llm" /> llm
          <span className="span-kind-dot span-kind-dot--tool" /> tool
        </span>
        <span className="muted span-tree-total">
          total {formatDuration(extent.max - extent.min)}
        </span>
      </div>
      <div className="span-tree-rows">
        {roots.map((root) => (
          <SpanRow
            key={root.id}
            node={root}
            depth={0}
            extent={extent}
            selectedId={selectedId}
            collapsed={collapsed}
            onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
            onToggleCollapse={toggleCollapse}
          />
        ))}
      </div>
      {selected ? (
        <div className="span-detail">
          <div className="span-detail-header">
            <span className={`span-kind-dot span-kind-dot--${selected.kind}`} />
            <strong>{selected.label}</strong>
            <span className={`agent-trace-status agent-trace-status--${selected.status}`}>
              {selected.status}
            </span>
            <span className="muted">{formatDuration(selected.end - selected.start)}</span>
          </div>
          {selected.detail ? (
            <pre className="span-detail-body">{selected.detail}</pre>
          ) : (
            <div className="muted span-detail-empty">No payload preview for this span.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
