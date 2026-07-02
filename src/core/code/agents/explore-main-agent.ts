import type { Message } from "@/core/message/message.types";
import type { LlmMessage } from "@/core/llm/llm.types";
import type { Session } from "@/core/session/session.types";
import type { CodeProject } from "@/core/code/agent.types";
import { runAgentLoop } from "./agent-loop";
import { runExploreSubAgent } from "./explore-subagent";
import type { AgentContext, AgentProgress, AgentTool, ExploreTask } from "./agent.types";
import { EXPLORE_MAIN_AGENT_PROMPT } from "@/core/code/prompts/explore.prompts";

const MAIN_AGENT_MAX_ITERATIONS = 10;

function parseExploreTask(args: unknown): ExploreTask {
  if (typeof args !== "object" || args === null) {
    return { task: "Explore the codebase" };
  }
  const record = args as Record<string, unknown>;
  const task = typeof record.task === "string" ? record.task : "Explore the codebase";
  const startingPaths = Array.isArray(record.startingPaths)
    ? record.startingPaths.filter((item): item is string => typeof item === "string")
    : undefined;
  return { task, startingPaths };
}

function historyToLlmMessages(history: Message[]): LlmMessage[] {
  return history
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content,
    }));
}

function createExploreCodebaseTool(
  onProgress: (update: AgentProgress) => Promise<void>,
): AgentTool {
  return {
    name: "explore_codebase",
    description:
      "Delegate a focused read-only exploration task to a sub-agent. Returns a structured summary of findings.",
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "What to investigate, e.g. 'How session CRUD is implemented'",
        },
        startingPaths: {
          type: "array",
          items: { type: "string" },
          description: "Optional relative file paths to start reading from",
        },
      },
      required: ["task"],
    },
    execute: async (args, agentCtx) => {
      const task = parseExploreTask(args);
      const pathsHint =
        task.startingPaths && task.startingPaths.length > 0
          ? `\nPaths: ${task.startingPaths.join(", ")}`
          : "";

      await onProgress({
        phase: "delegating",
        toolTrace: {
          toolName: "explore_codebase",
          content: `Exploring: ${task.task}${pathsHint}`,
          toolPayload: JSON.stringify(task),
        },
      });

      const summary = await runExploreSubAgent({
        task,
        ctx: agentCtx,
        onRead: async (trace) => {
          await onProgress({ phase: "reading", toolTrace: trace });
        },
      });

      await onProgress({
        phase: "explore_result",
        toolTrace: {
          toolName: "explore_codebase_result",
          content: summary,
          toolPayload: JSON.stringify({ task: task.task }),
        },
      });

      return summary;
    },
  };
}

export async function runExploreAgent(input: {
  session: Session;
  project: CodeProject;
  userMessage: string;
  history: Message[];
  onProgress: (update: AgentProgress) => Promise<void>;
}): Promise<string> {
  const ctx: AgentContext = {
    session: input.session,
    project: input.project,
    onProgress: input.onProgress,
  };

  const historyMessages = historyToLlmMessages(input.history);
  const result = await runAgentLoop({
    systemPrompt: EXPLORE_MAIN_AGENT_PROMPT,
    messages: [...historyMessages, { role: "user", content: input.userMessage }],
    tools: [createExploreCodebaseTool(input.onProgress)],
    maxIterations: MAIN_AGENT_MAX_ITERATIONS,
    temperature: 0.4,
    ctx,
  });

  return result.content;
}
