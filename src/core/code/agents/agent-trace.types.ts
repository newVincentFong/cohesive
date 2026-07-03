import type { LlmMessage, LlmToolCall, LlmToolDefinition } from "@/core/llm/llm.types";

export interface AgentTraceColumn {
  id: string;
  kind: "main" | "sub";
  label: string;
  status: "running" | "done" | "error";
  tools: LlmToolDefinition[];
  messages: TracedMessage[];
}

export interface TracedMessage {
  id: string;
  iteration: number;
  index: number;
  role: LlmMessage["role"];
  content?: string;
  toolCalls?: LlmToolCall[];
  toolCallId?: string;
  timestamp: number;
}

export interface AgentTraceCallbacks {
  onColumnStart(column: Pick<AgentTraceColumn, "id" | "kind" | "label" | "tools">): void;
  onColumnMessage(columnId: string, message: TracedMessage): void;
  onColumnEnd(columnId: string, status: "done" | "error"): void;
}

export function createTracedMessage(
  event: { message: LlmMessage; iteration: number; index: number },
): TracedMessage {
  return {
    id: crypto.randomUUID(),
    iteration: event.iteration,
    index: event.index,
    role: event.message.role,
    content: event.message.content,
    toolCalls: event.message.toolCalls,
    toolCallId: event.message.toolCallId,
    timestamp: Date.now(),
  };
}
