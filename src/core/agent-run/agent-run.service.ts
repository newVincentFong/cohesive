import type {
  AgentRun,
  CreateAgentRunInput,
  UpdateAgentRunInput,
} from "./agent-run.types";
import { invoke } from "@/core/platform/tauri";

export async function createAgentRun(input: CreateAgentRunInput): Promise<AgentRun> {
  return invoke<AgentRun>("agent_run_create", { input });
}

export async function updateAgentRun(
  id: string,
  patch: UpdateAgentRunInput,
): Promise<AgentRun> {
  return invoke<AgentRun>("agent_run_update", { id, patch });
}

export async function getAgentRun(id: string): Promise<AgentRun> {
  return invoke<AgentRun>("agent_run_get", { id });
}

export async function listAgentRuns(sessionId: string): Promise<AgentRun[]> {
  return invoke<AgentRun[]>("agent_run_list", { sessionId });
}
