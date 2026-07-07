import type { AgentTraceColumn, TracedMessage } from "./agent-trace.types";

export type SpanKind = "agent" | "llm" | "tool";

export interface SpanNode {
  id: string;
  kind: SpanKind;
  label: string;
  status: "running" | "done" | "error";
  /** Epoch ms. */
  start: number;
  /** Epoch ms. Equals `start` for zero-duration spans. */
  end: number;
  children: SpanNode[];
  /** Short preview of the span payload for the detail view. */
  detail?: string;
}

const DETAIL_PREVIEW_LENGTH = 1200;

function preview(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return text.length > DETAIL_PREVIEW_LENGTH
    ? `${text.slice(0, DETAIL_PREVIEW_LENGTH)}…`
    : text;
}

function messageEnd(message: TracedMessage): number {
  return Math.max(message.updatedAt ?? message.timestamp, message.timestamp);
}

function toolCallLabel(
  message: TracedMessage,
  column: AgentTraceColumn,
): string {
  if (!message.toolCallId) return "tool result";
  for (const candidate of column.messages) {
    const match = candidate.toolCalls?.find((call) => call.id === message.toolCallId);
    if (match) return match.function.name;
  }
  return "tool result";
}

function buildColumnSpan(column: AgentTraceColumn): SpanNode {
  const loopMessages = column.messages.filter((message) => message.iteration >= 0);
  const firstStart = loopMessages[0]?.timestamp ?? column.startedAt ?? Date.now();
  const children: SpanNode[] = [];
  // Tracks where the previous span ended so tool spans (whose messages are
  // emitted only after the tool finishes) can start when execution began.
  let cursor = firstStart;

  for (const message of loopMessages) {
    if (message.role === "assistant") {
      const end = messageEnd(message);
      const calls = message.toolCalls?.map((call) => call.function.name) ?? [];
      children.push({
        id: message.id,
        kind: "llm",
        label: calls.length > 0 ? `LLM · calls ${calls.join(", ")}` : "LLM · final answer",
        status: "done",
        start: message.timestamp,
        end,
        children: [],
        detail: preview(message.content),
      });
      cursor = end;
    } else if (message.role === "tool") {
      children.push({
        id: message.id,
        kind: "tool",
        label: toolCallLabel(message, column),
        status: message.content?.startsWith("Error") ? "error" : "done",
        start: Math.min(cursor, message.timestamp),
        end: message.timestamp,
        children: [],
        detail: preview(message.content),
      });
      cursor = message.timestamp;
    }
  }

  const start = column.startedAt ?? firstStart;
  const lastChildEnd = children.reduce((max, child) => Math.max(max, child.end), start);
  const end =
    column.status === "running" ? Date.now() : column.endedAt ?? lastChildEnd;

  return {
    id: column.id,
    kind: "agent",
    label: column.kind === "main" ? "Main agent" : `Sub · ${column.label}`,
    status: column.status,
    start,
    end: Math.max(end, start),
    children,
  };
}

/**
 * Derives a span tree from trace columns. Sub-agent spans are nested inside
 * the main agent's tool span that delegated to them (matched by time
 * containment), falling back to the main agent span.
 */
export function buildSpanTree(columns: AgentTraceColumn[]): SpanNode[] {
  const mainColumns = columns.filter((column) => column.kind === "main");
  const subColumns = columns.filter((column) => column.kind !== "main");

  const roots = mainColumns.map(buildColumnSpan);
  const subSpans = subColumns.map(buildColumnSpan);

  for (const subSpan of subSpans) {
    let attached = false;
    for (const root of roots) {
      const host = root.children.find(
        (child) =>
          child.kind === "tool" &&
          subSpan.start >= child.start - 50 &&
          subSpan.start <= child.end + 50,
      );
      if (host) {
        host.children.push(subSpan);
        // The delegating tool span should visually contain its sub-agent.
        host.end = Math.max(host.end, subSpan.end);
        attached = true;
        break;
      }
    }
    if (!attached) {
      if (roots.length > 0) {
        roots[0].children.push(subSpan);
        roots[0].children.sort((a, b) => a.start - b.start);
      } else {
        roots.push(subSpan);
      }
    }
  }

  return roots;
}

export function spanTreeExtent(roots: SpanNode[]): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const visit = (node: SpanNode) => {
    min = Math.min(min, node.start);
    max = Math.max(max, node.end);
    node.children.forEach(visit);
  };
  roots.forEach(visit);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    const now = Date.now();
    return { min: now, max: now + 1 };
  }
  return { min, max: Math.max(max, min + 1) };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}
