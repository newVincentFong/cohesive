import { useEffect, useRef } from "react";
import type { AgentTraceColumn } from "@/core/code/agents/agent-trace.types";
import { AgentLoopMessage } from "./AgentLoopMessage";

function ColumnStatusBadge({ status }: { status: AgentTraceColumn["status"] }) {
  return <span className={`agent-trace-status agent-trace-status--${status}`}>{status}</span>;
}

function AgentTraceColumnView({ column }: { column: AgentTraceColumn }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [column.messages.length]);

  const title = column.kind === "main" ? "Main agent" : `Sub · ${column.label}`;

  return (
    <div className="agent-trace-column">
      <div className="agent-trace-column-header">
        <span className="agent-trace-column-title">{title}</span>
        <ColumnStatusBadge status={column.status} />
      </div>
      <div ref={scrollRef} className="agent-trace-column-messages">
        {column.messages.length === 0 ? (
          <div className="muted agent-trace-empty">Waiting for messages…</div>
        ) : (
          column.messages.map((message) => (
            <AgentLoopMessage key={message.id} message={message} />
          ))
        )}
      </div>
    </div>
  );
}

export function AgentTracePanel({ columns }: { columns: AgentTraceColumn[] }) {
  if (columns.length === 0) {
    return (
      <div className="agent-trace-panel">
        <h3 className="section-title">Agent trace</h3>
        <div className="muted agent-trace-empty">Send a message in explore mode to start tracing.</div>
      </div>
    );
  }

  return (
    <div className="agent-trace-panel">
      <h3 className="section-title">Agent trace</h3>
      <div className="agent-trace-columns">
        {columns.map((column) => (
          <AgentTraceColumnView key={column.id} column={column} />
        ))}
      </div>
    </div>
  );
}
