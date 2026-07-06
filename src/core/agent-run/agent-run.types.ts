import type { CodeMode } from "../session/session.types";

export type AgentRunStatus = "running" | "done" | "error";

export interface AgentRun {
  id: string;
  sessionId: string;
  parentMessageId?: string | null;
  userMessageId: string;
  assistantMessageId?: string;
  mode: CodeMode;
  status: AgentRunStatus;
  toolsetSnapshotJson?: string;
  permissionSnapshotJson?: string;
  createdAt: string;
  finishedAt?: string;
}

export interface CreateAgentRunInput {
  sessionId: string;
  parentMessageId?: string | null;
  userMessageId: string;
  mode: CodeMode;
  toolsetSnapshotJson?: string;
  permissionSnapshotJson?: string;
}

export interface UpdateAgentRunInput {
  assistantMessageId?: string;
  status?: AgentRunStatus;
  finishedAt?: string;
}
