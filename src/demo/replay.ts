import { createMessage } from "@/core/message/message.service";
import { createAgentRun, updateAgentRun } from "@/core/agent-run/agent-run.service";
import { permissionsForMode } from "@/core/code/agent.types";
import { updateSession } from "@/core/session/session.service";
import { invoke } from "@/core/platform/tauri";
import type { TraceColumnRow, TraceMessageRow } from "@/core/code/agents/agent-trace.service";
import { DEMO_REFRESH_EVENT, type DemoReplay } from "./types";
import { sleep } from "./dom";
import exploreReplay from "./replays/explore.json";
import buildReplay from "./replays/build.json";
import traceReplay from "./replays/trace.json";

const REPLAYS: Record<string, DemoReplay> = {
  explore: exploreReplay as DemoReplay,
  build: buildReplay as DemoReplay,
  trace: traceReplay as DemoReplay,
};

export function getReplay(clip: string): DemoReplay {
  const replay = REPLAYS[clip];
  if (!replay) {
    throw new Error(`Unknown demo replay clip: ${clip}`);
  }
  return replay;
}

export function requestDemoSessionRefresh() {
  window.dispatchEvent(new CustomEvent(DEMO_REFRESH_EVENT));
}

/**
 * Seeds chat messages + optional agent run / trace for a demo clip.
 * Chains messages linearly so tool rows stay on the conversation path.
 */
export async function applyReplay(
  sessionId: string,
  clip: string,
  options: { animate?: boolean; speed?: number } = {},
): Promise<void> {
  const replay = getReplay(clip);
  const animate = options.animate ?? true;
  const speed = options.speed ?? 1.5;
  const pause = () => (animate ? sleep(Math.max(80, 420 / speed)) : Promise.resolve());

  await updateSession(sessionId, {
    title: replay.title,
    defaultMode: replay.mode,
  });
  requestDemoSessionRefresh();
  await pause();

  let parentId: string | null = null;
  let userMessageId: string | null = null;
  let agentRunId: string | null = null;
  const baseTime = Date.now();

  for (const message of replay.messages) {
    if (message.role === "user") {
      const created = await createMessage({
        sessionId,
        parentMessageId: parentId,
        role: "user",
        content: message.content,
      });
      parentId = created.id;
      userMessageId = created.id;

      const run = await createAgentRun({
        sessionId,
        parentMessageId: null,
        userMessageId: created.id,
        mode: replay.mode,
        permissionSnapshotJson: JSON.stringify(permissionsForMode(replay.mode)),
      });
      agentRunId = run.id;
    } else {
      if (!userMessageId || !agentRunId) {
        throw new Error("Demo replay: non-user message before user message");
      }
      const created = await createMessage({
        sessionId,
        parentMessageId: parentId,
        agentRunId,
        role: message.role,
        content: message.content,
        toolName: message.toolName,
        toolPayload: message.toolPayload,
      });
      parentId = created.id;
    }

    requestDemoSessionRefresh();
    await pause();
  }

  if (agentRunId && replay.trace) {
    for (const column of replay.trace.columns) {
      const row: TraceColumnRow = {
        id: column.id,
        runId: agentRunId,
        sessionId,
        kind: column.kind,
        label: column.label,
        status: column.status,
        parentColumnId: column.kind === "sub" ? "main" : null,
        toolsJson: column.tools ? JSON.stringify(column.tools) : null,
        startedAt: new Date(baseTime + (column.startedOffsetMs ?? 0)).toISOString(),
        endedAt:
          column.endedOffsetMs != null
            ? new Date(baseTime + column.endedOffsetMs).toISOString()
            : new Date(baseTime + 4000).toISOString(),
      };
      await invoke("trace_column_upsert", { input: row });
    }

    const traceRows: TraceMessageRow[] = replay.trace.messages.map((message) => ({
      id: message.id,
      runId: agentRunId!,
      columnId: message.columnId,
      iteration: message.iteration,
      idx: message.index,
      role: message.role,
      content: message.content ?? null,
      toolCallsJson: message.toolCalls ? JSON.stringify(message.toolCalls) : null,
      toolCallId: message.toolCallId ?? null,
      createdAt: new Date(baseTime + (message.offsetMs ?? 0)).toISOString(),
    }));

    if (traceRows.length > 0) {
      // Insert in small batches so the panel can refresh between groups when animating
      const chunkSize = animate ? 2 : traceRows.length;
      for (let i = 0; i < traceRows.length; i += chunkSize) {
        await invoke("trace_message_upsert_batch", {
          inputs: traceRows.slice(i, i + chunkSize),
        });
        requestDemoSessionRefresh();
        await pause();
      }
    }

    await updateAgentRun(agentRunId, { status: "done" });
    requestDemoSessionRefresh();
  } else if (agentRunId) {
    await updateAgentRun(agentRunId, { status: "done" });
    requestDemoSessionRefresh();
  }
}
