import type { LlmProvider } from "@/core/llm/llm.types";
import type { Session, CodeMode } from "@/core/session/session.types";
import type { CodeProject } from "@/core/code/agent.types";

export interface ExploreTask {
  task: string;
  startingPaths?: string[];
}

export interface ToolTrace {
  toolName: string;
  content: string;
  toolPayload?: string;
}

export interface AgentProgress {
  phase:
    | "delegating"
    | "reading"
    | "explore_result"
    | "thinking"
    | "searching"
    | "editing"
    | "running_command";
  toolTrace?: ToolTrace;
}

export interface AgentContext {
  session: Session;
  project: CodeProject;
  runId: string;
  runMode: CodeMode;
  onProgress?: (update: AgentProgress) => Promise<void>;
  /** Optional override for eval harnesses and tests. */
  llm?: LlmProvider;
}

export interface JsonSchema extends Record<string, unknown> {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: JsonSchema;
  execute(args: unknown, ctx: AgentContext): Promise<string>;
}

export {
  countLines,
  summarizeForDisplay,
  truncateFileContent,
} from "./tools/output-budget";
