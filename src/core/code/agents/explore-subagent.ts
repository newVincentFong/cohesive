import { readProjectFile } from "@/core/code/agent.service";
import type { LlmMessage } from "@/core/llm/llm.types";
import { runAgentLoop, type AgentLoopMessageEvent } from "./agent-loop";
import type {
  AgentContext,
  AgentTool,
  ExploreTask,
  ToolTrace,
} from "./agent.types";
import {
  countLines,
  summarizeForDisplay,
  truncateFileContent,
} from "./agent.types";
import { EXPLORE_SUB_AGENT_PROMPT } from "@/core/code/prompts/explore.prompts";

const SUB_AGENT_MAX_ITERATIONS = 15;

function createReadFileTool(onRead?: (trace: ToolTrace) => Promise<void>): AgentTool {
  return {
    name: "read_file",
    description:
      "Read a text file from the project by relative path. Use this to inspect source code and configuration.",
    parameters: {
      type: "object",
      properties: {
        relativePath: {
          type: "string",
          description: "Path relative to the project root, e.g. src/App.tsx",
        },
      },
      required: ["relativePath"],
    },
    execute: async (args, ctx) => {
      const relativePath =
        typeof args === "object" &&
        args !== null &&
        "relativePath" in args &&
        typeof (args as { relativePath: unknown }).relativePath === "string"
          ? (args as { relativePath: string }).relativePath
          : "";

      if (!relativePath.trim()) {
        return "Error: relativePath is required";
      }

      try {
        const rawContent = await readProjectFile({
          sessionId: ctx.session.id,
          projectPath: ctx.project.path,
          mode: "explore",
          relativePath: relativePath.trim(),
        });
        const lineCount = countLines(rawContent);
        const displaySummary = summarizeForDisplay(rawContent, 500);
        const trace: ToolTrace = {
          toolName: "read_file",
          content: `Read ${relativePath.trim()} (${lineCount} lines)\nSummary: ${displaySummary}`,
          toolPayload: JSON.stringify({ relativePath: relativePath.trim(), lineCount }),
        };

        if (onRead) {
          await onRead(trace);
        }

        return truncateFileContent(rawContent);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const trace: ToolTrace = {
          toolName: "read_file",
          content: `Failed to read ${relativePath.trim()}: ${message}`,
          toolPayload: JSON.stringify({ relativePath: relativePath.trim(), error: message }),
        };
        if (onRead) {
          await onRead(trace);
        }
        return `Error reading file: ${message}`;
      }
    },
  };
}

function buildSubAgentUserMessage(task: ExploreTask): string {
  const paths =
    task.startingPaths && task.startingPaths.length > 0
      ? `\nStarting paths:\n${task.startingPaths.map((path) => `- ${path}`).join("\n")}`
      : "";
  return `Explore task:\n${task.task}${paths}`;
}

export async function runExploreSubAgent(input: {
  task: ExploreTask;
  ctx: AgentContext;
  onRead?: (trace: ToolTrace) => Promise<void>;
  onLoopMessage?: (event: AgentLoopMessageEvent) => void | Promise<void>;
}): Promise<string> {
  const messages: LlmMessage[] = [
    { role: "user", content: buildSubAgentUserMessage(input.task) },
  ];

  const result = await runAgentLoop({
    systemPrompt: EXPLORE_SUB_AGENT_PROMPT,
    messages,
    tools: [createReadFileTool(input.onRead)],
    maxIterations: SUB_AGENT_MAX_ITERATIONS,
    temperature: 0.2,
    ctx: input.ctx,
    onLoopMessage: input.onLoopMessage,
  });

  return result.content;
}
