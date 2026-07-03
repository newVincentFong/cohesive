import { useState } from "react";
import type { TracedMessage } from "@/core/code/agents/agent-trace.types";
import { MarkdownMessage } from "@/components/message/MarkdownMessage";

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

function ExpandableMarkdown({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > LONG_CONTENT_THRESHOLD;

  return (
    <>
      <div className={isLong && !expanded ? "tool-message-content--collapsed" : undefined}>
        <MarkdownMessage content={content} mode="static" />
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

function isLastStreamingAssistant(
  message: TracedMessage,
  messages: TracedMessage[],
  columnRunning: boolean,
): boolean {
  if (!columnRunning || message.role !== "assistant") {
    return false;
  }
  const assistants = messages.filter((item) => item.role === "assistant");
  return assistants[assistants.length - 1]?.id === message.id;
}

export function AgentLoopMessage({
  message,
  columnRunning = false,
  allMessages = [],
}: {
  message: TracedMessage;
  columnRunning?: boolean;
  allMessages?: TracedMessage[];
}) {
  const [systemExpanded, setSystemExpanded] = useState(false);
  const isAnimating = isLastStreamingAssistant(message, allMessages, columnRunning);

  if (message.role === "system") {
    const preview = message.content?.slice(0, SYSTEM_PREVIEW_LENGTH) ?? "";
    const isLong = (message.content?.length ?? 0) > SYSTEM_PREVIEW_LENGTH;

    return (
      <div className="agent-loop-message agent-loop-message--system">
        <div className="agent-loop-message-role">system</div>
        {systemExpanded || !isLong ? (
          <MarkdownMessage content={message.content ?? ""} mode="static" />
        ) : (
          <div className="agent-loop-message-content">{`${preview}…`}</div>
        )}
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
        <MarkdownMessage content={message.content ?? ""} mode="static" />
      </div>
    );
  }

  if (message.role === "assistant") {
    return (
      <div className="agent-loop-message agent-loop-message--assistant">
        <div className="agent-loop-message-role">assistant</div>
        {message.content ? (
          <MarkdownMessage content={message.content} isAnimating={isAnimating} />
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
      {message.content ? <ExpandableMarkdown content={message.content} /> : null}
    </div>
  );
}
