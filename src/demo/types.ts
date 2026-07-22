import type { CodeMode } from "@/core/session/session.types";
import type { MessageRole } from "@/core/message/message.types";

export type DemoScriptId = "explore" | "build" | "trace";

export type DemoStep =
  | { op: "wait"; ms: number }
  | { op: "moveTo"; target: string; ms?: number }
  | { op: "click"; target: string; ms?: number }
  | { op: "type"; target: string; text: string; cps?: number }
  | { op: "waitFor"; target: string; timeoutMs?: number }
  | { op: "setMode"; mode: CodeMode }
  | { op: "replay"; clip: string; animate?: boolean; speed?: number }
  | { op: "clearComposer" };

export interface DemoScript {
  id: DemoScriptId;
  label: string;
  steps: DemoStep[];
}

export interface DemoReplayMessage {
  role: MessageRole;
  content: string;
  toolName?: string;
  toolPayload?: string;
}

export interface DemoReplayTraceColumn {
  id: string;
  kind: "main" | "sub";
  label: string;
  status: "running" | "done" | "error";
  tools?: Array<{
    type: "function";
    function: { name: string; description: string; parameters: unknown };
  }>;
  startedOffsetMs?: number;
  endedOffsetMs?: number;
}

export interface DemoReplayTraceMessage {
  id: string;
  columnId: string;
  iteration: number;
  index: number;
  role: string;
  content?: string;
  toolCalls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  toolCallId?: string;
  offsetMs?: number;
}

export interface DemoReplay {
  title: string;
  mode: CodeMode;
  messages: DemoReplayMessage[];
  trace?: {
    columns: DemoReplayTraceColumn[];
    messages: DemoReplayTraceMessage[];
  };
}

export interface DemoCursorState {
  x: number;
  y: number;
  visible: boolean;
  pressing: boolean;
}

export const DEMO_REFRESH_EVENT = "cohesive-demo-refresh";
export const DEMO_WINDOW_WIDTH = 1440;
export const DEMO_WINDOW_HEIGHT = 900;
