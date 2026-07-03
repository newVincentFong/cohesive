import { useEffect, useRef, useState } from "react";
import type { AgentTraceColumn } from "@/core/code/agents/agent-trace.types";
import type { LlmToolDefinition } from "@/core/llm/llm.types";
import { AgentLoopMessage } from "./AgentLoopMessage";

function ColumnStatusBadge({ status }: { status: AgentTraceColumn["status"] }) {
  return <span className={`agent-trace-status agent-trace-status--${status}`}>{status}</span>;
}

function AgentTraceToolsSection({ tools }: { tools: LlmToolDefinition[] }) {
  const [expanded, setExpanded] = useState(true);

  if (tools.length === 0) {
    return null;
  }

  return (
    <div className="agent-trace-tools-section">
      <button
        type="button"
        className="agent-trace-tools-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        Tools ({tools.length})
        <span className="agent-trace-tools-chevron">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded ? (
        <div className="agent-trace-tools-list">
          {tools.map((tool) => (
            <div key={tool.function.name} className="agent-trace-tool-item">
              <div className="agent-trace-tool-name">{tool.function.name}</div>
              <div className="agent-trace-tool-description">{tool.function.description}</div>
              <pre className="agent-trace-tool-parameters">
                {JSON.stringify(tool.function.parameters, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AgentTraceColumnView({ column }: { column: AgentTraceColumn }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [column.messages]);

  const title = column.kind === "main" ? "Main agent" : `Sub · ${column.label}`;

  return (
    <div className="agent-trace-column">
      <div className="agent-trace-column-header">
        <span className="agent-trace-column-title">{title}</span>
        <ColumnStatusBadge status={column.status} />
      </div>
      <AgentTraceToolsSection tools={column.tools} />
      <div ref={scrollRef} className="agent-trace-column-messages">
        {column.messages.length === 0 ? (
          <div className="muted agent-trace-empty">Waiting for messages…</div>
        ) : (
          column.messages.map((message) => (
            <AgentLoopMessage
              key={message.id}
              message={message}
              columnRunning={column.status === "running"}
              allMessages={column.messages}
            />
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
