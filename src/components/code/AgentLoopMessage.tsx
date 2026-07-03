import { useState } from "react";
import type { TracedMessage } from "@/core/code/agents/agent-trace.types";

const LONG_CONTENT_THRESHOLD = 600;
const SYSTEM_PREVIEW_LENGTH = 120;

function ToolCallsBlock({ toolCalls }: { toolCalls: NonNullable<TracedMessage["toolCalls"]> }) {
  return (
    <div className="agent-loop-toolcalls">
      {toolCalls.map((toolCall) => (
        <pre key={toolCall.id}>
          {toolCall.function.name}(
          {toolCall.function.arguments})
        </pre>
      ))}
    </div>
  );
}

function ExpandableContent({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > LONG_CONTENT_THRESHOLD;

  return (
    <>
      <div className="agent-loop-message-content">
        {isLong && !expanded ? `${content.slice(0, LONG_CONTENT_THRESHOLD)}…` : content}
      </div>
      {isLong ? (
        <button
          type="button"
          className="secondary-button tool-message-toggle"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </>
  );
}

export function AgentLoopMessage({ message }: { message: TracedMessage }) {
  const [systemExpanded, setSystemExpanded] = useState(false);

  if (message.role === "system") {
    const preview = message.content?.slice(0, SYSTEM_PREVIEW_LENGTH) ?? "";
    const isLong = (message.content?.length ?? 0) > SYSTEM_PREVIEW_LENGTH;

    return (
      <div className="agent-loop-message agent-loop-message--system">
        <div className="agent-loop-message-role">system</div>
        <div className="agent-loop-message-content">
          {systemExpanded || !isLong ? message.content : `${preview}…`}
        </div>
        {isLong ? (
          <button
            type="button"
            className="secondary-button tool-message-toggle"
            onClick={() => setSystemExpanded(!systemExpanded)}
          >
            {systemExpanded ? "Collapse" : "Expand"}
          </button>
        ) : null}
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="agent-loop-message agent-loop-message--user">
        <div className="agent-loop-message-role">user</div>
        <div className="agent-loop-message-content">{message.content}</div>
      </div>
    );
  }

  if (message.role === "assistant") {
    return (
      <div className="agent-loop-message agent-loop-message--assistant">
        <div className="agent-loop-message-role">assistant</div>
        {message.content ? (
          <div className="agent-loop-message-content">{message.content}</div>
        ) : null}
        {message.toolCalls && message.toolCalls.length > 0 ? (
          <ToolCallsBlock toolCalls={message.toolCalls} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="agent-loop-message agent-loop-message--tool">
      <div className="agent-loop-message-role">
        tool
        {message.toolCallId ? ` · ${message.toolCallId.slice(0, 8)}` : ""}
      </div>
      {message.content ? <ExpandableContent content={message.content} /> : null}
    </div>
  );
}
