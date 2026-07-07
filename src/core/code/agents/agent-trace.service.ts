import { invoke } from "@/core/platform/tauri";
import type { LlmToolCall, LlmToolDefinition } from "@/core/llm/llm.types";
import type {
  AgentTraceCallbacks,
  AgentTraceColumn,
  TracedMessage,
} from "./agent-trace.types";

/** Row shapes mirroring the Rust TraceColumn / TraceMessage models. */
export interface TraceColumnRow {
  id: string;
  runId: string;
  sessionId: string;
  kind: string;
  label: string;
  status: string;
  parentColumnId?: string | null;
  toolsJson?: string | null;
  startedAt: string;
  endedAt?: string | null;
}

export interface TraceMessageRow {
  id: string;
  runId: string;
  columnId: string;
  iteration: number;
  idx: number;
  role: string;
  content?: string | null;
  toolCallsJson?: string | null;
  toolCallId?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface TraceRun {
  columns: TraceColumnRow[];
  messages: TraceMessageRow[];
}

export async function getTraceByRun(runId: string): Promise<TraceRun> {
  return invoke<TraceRun>("trace_get_by_run", { runId });
}

export async function pruneTraces(keepRuns: number): Promise<void> {
  await invoke("trace_prune", { keepRuns });
}

function parseJson<T>(raw: string | null | undefined): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/** Rebuilds the in-memory trace panel structure from persisted rows. */
export function traceRunToColumns(trace: TraceRun): AgentTraceColumn[] {
  const columns = trace.columns.map((column): AgentTraceColumn => {
    const status =
      column.status === "running" || column.status === "done" || column.status === "error"
        ? column.status
        : "done";
    return {
      id: column.id,
      kind: column.kind === "main" ? "main" : "sub",
      label: column.label,
      status,
      tools: parseJson<LlmToolDefinition[]>(column.toolsJson) ?? [],
      messages: [],
      startedAt: Date.parse(column.startedAt),
      endedAt: column.endedAt ? Date.parse(column.endedAt) : undefined,
    };
  });

  const byId = new Map(columns.map((column) => [column.id, column]));
  for (const row of trace.messages) {
    const column = byId.get(row.columnId);
    if (!column) continue;
    column.messages.push({
      id: row.id,
      iteration: row.iteration,
      index: row.idx,
      role: row.role as TracedMessage["role"],
      content: row.content ?? undefined,
      toolCalls: parseJson<LlmToolCall[]>(row.toolCallsJson),
      toolCallId: row.toolCallId ?? undefined,
      timestamp: Date.parse(row.createdAt),
      updatedAt: row.updatedAt ? Date.parse(row.updatedAt) : undefined,
    });
  }
  return columns;
}

const STREAMING_FLUSH_INTERVAL_MS = 2000;

interface PendingMessage {
  row: TraceMessageRow;
  dirty: boolean;
}

export interface TracePersister {
  callbacks: AgentTraceCallbacks;
  /** Flushes any buffered streaming updates. Call when the run ends (success or error). */
  finish(): Promise<void>;
}

/**
 * Wraps UI trace callbacks with an append-only SQLite persister.
 *
 * Message creations, column starts and column ends are written immediately.
 * Streaming content patches (which fire per token) are buffered in memory and
 * flushed on an interval, so a crash mid-run loses at most a few seconds.
 */
export function createTracePersister(input: {
  runId: string;
  sessionId: string;
  ui: AgentTraceCallbacks;
}): TracePersister {
  const { runId, sessionId, ui } = input;
  const pending = new Map<string, PendingMessage>();
  let flushTimer: ReturnType<typeof setInterval> | null = null;
  // All DB writes go through this chain so streaming flushes can never land
  // out of order with message inserts or column status updates.
  let writeChain: Promise<void> = Promise.resolve();

  function reportError(err: unknown) {
    console.error("[agent-trace] persistence failed:", err);
  }

  function enqueue(task: () => Promise<void>): void {
    writeChain = writeChain.then(task).catch(reportError);
  }

  async function flushDirty(): Promise<void> {
    const rows = [...pending.values()]
      .filter((entry) => entry.dirty)
      .map((entry) => ({ ...entry.row }));
    if (rows.length === 0) return;
    for (const entry of pending.values()) {
      entry.dirty = false;
    }
    await invoke("trace_message_upsert_batch", { inputs: rows });
  }

  function ensureTimer() {
    if (flushTimer) return;
    flushTimer = setInterval(() => {
      enqueue(flushDirty);
    }, STREAMING_FLUSH_INTERVAL_MS);
  }

  function stopTimer() {
    if (!flushTimer) return;
    clearInterval(flushTimer);
    flushTimer = null;
  }

  const callbacks: AgentTraceCallbacks = {
    onColumnStart(column) {
      ui.onColumnStart(column);
      const row: TraceColumnRow = {
        id: column.id,
        runId,
        sessionId,
        kind: column.kind,
        label: column.label,
        status: "running",
        parentColumnId: column.kind === "sub" ? "main" : null,
        toolsJson: JSON.stringify(column.tools),
        startedAt: new Date().toISOString(),
        endedAt: null,
      };
      enqueue(() => invoke("trace_column_upsert", { input: row }));
    },
    onColumnMessage(columnId, message) {
      ui.onColumnMessage(columnId, message);
      const row: TraceMessageRow = {
        id: message.id,
        runId,
        columnId,
        iteration: message.iteration,
        idx: message.index,
        role: message.role,
        content: message.content ?? null,
        toolCallsJson: message.toolCalls ? JSON.stringify(message.toolCalls) : null,
        toolCallId: message.toolCallId ?? null,
        createdAt: new Date(message.timestamp).toISOString(),
      };
      pending.set(message.id, { row, dirty: true });
      enqueue(flushDirty);
    },
    onColumnMessageUpdate(columnId, messageId, patch) {
      ui.onColumnMessageUpdate(columnId, messageId, patch);
      const entry = pending.get(messageId);
      if (!entry) return;
      if (patch.content !== undefined) {
        entry.row.content = patch.content ?? null;
      }
      if (patch.toolCalls !== undefined) {
        entry.row.toolCallsJson = patch.toolCalls ? JSON.stringify(patch.toolCalls) : null;
      }
      entry.dirty = true;
      ensureTimer();
    },
    onColumnEnd(columnId, status) {
      ui.onColumnEnd(columnId, status);
      enqueue(flushDirty);
      // kind/label/tools only apply on first insert; the upsert keeps existing
      // values and just updates status/ended_at.
      const row: TraceColumnRow = {
        id: columnId,
        runId,
        sessionId,
        kind: "sub",
        label: "",
        status,
        parentColumnId: null,
        toolsJson: null,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };
      enqueue(() => invoke("trace_column_upsert", { input: row }));
    },
  };

  return {
    callbacks,
    async finish() {
      stopTimer();
      enqueue(flushDirty);
      await writeChain;
    },
  };
}
