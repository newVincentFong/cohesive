import type { Message } from "@/core/message/message.types";
import type { LlmMessage } from "@/core/llm/llm.types";
import type { Session } from "@/core/session/session.types";
import type { CodeProject } from "@/core/code/agent.types";
import { agentToolsToLlmDefinitions, runAgentLoop, type AgentLoopMessageEvent } from "./agent-loop";
import { getExploreSubAgentTools, runExploreSubAgent } from "./explore-subagent";
import type { AgentContext, AgentProgress, AgentTool, ExploreTask } from "./agent.types";
import type { AgentTraceCallbacks } from "./agent-trace.types";
import { createTracedMessage } from "./agent-trace.types";
import { EXPLORE_MAIN_AGENT_PROMPT } from "@/core/code/prompts/explore.prompts";

const MAIN_AGENT_MAX_ITERATIONS = 10;
const MAIN_COLUMN_ID = "main";

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

function createLoopMessageHandler(
  onTrace: AgentTraceCallbacks | undefined,
  columnId: string,
): ((event: AgentLoopMessageEvent) => void | Promise<void>) | undefined {
  if (!onTrace) return undefined;
  return async (event) => {
    onTrace.onColumnMessage(columnId, createTracedMessage(event));
  };
}

function createExploreCodebaseTool(
  onProgress: (update: AgentProgress) => Promise<void>,
  onTrace?: AgentTraceCallbacks,
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

      const subId = crypto.randomUUID();
      onTrace?.onColumnStart({
        id: subId,
        kind: "sub",
        label: task.task,
        tools: agentToolsToLlmDefinitions(getExploreSubAgentTools()),
      });

      try {
        const summary = await runExploreSubAgent({
          task,
          ctx: agentCtx,
          onRead: async (trace) => {
            await onProgress({ phase: "reading", toolTrace: trace });
          },
          onLoopMessage: createLoopMessageHandler(onTrace, subId),
        });

        onTrace?.onColumnEnd(subId, "done");

        await onProgress({
          phase: "explore_result",
          toolTrace: {
            toolName: "explore_codebase_result",
            content: summary,
            toolPayload: JSON.stringify({ task: task.task }),
          },
        });

        return summary;
      } catch (err) {
        onTrace?.onColumnEnd(subId, "error");
        throw err;
      }
    },
  };
}

export async function runExploreAgent(input: {
  session: Session;
  project: CodeProject;
  userMessage: string;
  history: Message[];
  onProgress: (update: AgentProgress) => Promise<void>;
  onTrace?: AgentTraceCallbacks;
}): Promise<string> {
  const ctx: AgentContext = {
    session: input.session,
    project: input.project,
    onProgress: input.onProgress,
  };

  const mainTools = [createExploreCodebaseTool(input.onProgress, input.onTrace)];

  input.onTrace?.onColumnStart({
    id: MAIN_COLUMN_ID,
    kind: "main",
    label: "Main agent",
    tools: agentToolsToLlmDefinitions(mainTools),
  });

  const historyMessages = historyToLlmMessages(input.history);

  try {
    const result = await runAgentLoop({
      systemPrompt: EXPLORE_MAIN_AGENT_PROMPT,
      messages: [...historyMessages, { role: "user", content: input.userMessage }],
      tools: mainTools,
      maxIterations: MAIN_AGENT_MAX_ITERATIONS,
      temperature: 0.4,
      ctx,
      onLoopMessage: createLoopMessageHandler(input.onTrace, MAIN_COLUMN_ID),
    });

    input.onTrace?.onColumnEnd(MAIN_COLUMN_ID, "done");
    return result.content;
  } catch (err) {
    input.onTrace?.onColumnEnd(MAIN_COLUMN_ID, "error");
    throw err;
  }
}
