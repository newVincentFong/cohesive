import type { Session } from "@/core/session/session.types";
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
  phase: "delegating" | "reading" | "explore_result" | "thinking";
  toolTrace?: ToolTrace;
}

export interface AgentContext {
  session: Session;
  project: CodeProject;
  onProgress?: (update: AgentProgress) => Promise<void>;
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

export function truncateFileContent(content: string, maxChars = 12_000): string {
  if (content.length <= maxChars) {
    return content;
  }
  const headSize = Math.floor(maxChars * 0.6);
  const tailSize = maxChars - headSize - 80;
  const head = content.slice(0, headSize);
  const tail = content.slice(content.length - tailSize);
  return `${head}\n\n... [truncated ${content.length - maxChars} chars] ...\n\n${tail}`;
}

export function summarizeForDisplay(content: string, maxLen = 400): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) {
    return oneLine;
  }
  return `${oneLine.slice(0, maxLen)}…`;
}

export function countLines(content: string): number {
  if (!content) return 0;
  return content.split("\n").length;
}
