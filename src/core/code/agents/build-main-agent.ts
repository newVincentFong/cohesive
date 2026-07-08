import type { Message } from "@/core/message/message.types";
import type { LlmMessage } from "@/core/llm/llm.types";
import type { Session, CodeMode } from "@/core/session/session.types";
import type { CodeProject } from "@/core/code/agent.types";
import { agentToolsToLlmDefinitions, runAgentLoop, type AgentLoopMessageEvent, type AgentLoopMessageUpdateEvent } from "./agent-loop";
import type { AgentContext, AgentProgress } from "./agent.types";
import type { AgentTraceCallbacks } from "./agent-trace.types";
import { createTracedMessage } from "./agent-trace.types";
import { BUILD_MAIN_AGENT_PROMPT } from "@/core/code/prompts/build.prompts";
import { getToolsForRole } from "./tools";

const MAIN_AGENT_MAX_ITERATIONS = 25;
const MAIN_COLUMN_ID = "main";

function historyToLlmMessages(history: Message[]): LlmMessage[] {
  return history
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content,
    }));
}

function createLoopMessageUpdateHandler(
  onTrace: AgentTraceCallbacks | undefined,
  columnId: string,
): ((event: AgentLoopMessageUpdateEvent) => void | Promise<void>) | undefined {
  if (!onTrace) return undefined;
  return async (event) => {
    onTrace.onColumnMessageUpdate(columnId, event.messageId, {
      content: event.message.content,
      toolCalls: event.message.toolCalls,
    });
  };
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

export async function runBuildAgent(input: {
  session: Session;
  project: CodeProject;
  userMessage: string;
  history: Message[];
  runId: string;
  runMode: CodeMode;
  onProgress: (update: AgentProgress) => Promise<void>;
  onTrace?: AgentTraceCallbacks;
  onAnswerDelta?: (content: string) => void | Promise<void>;
}): Promise<string> {
  const ctx: AgentContext = {
    session: input.session,
    project: input.project,
    runId: input.runId,
    runMode: input.runMode,
    onProgress: input.onProgress,
  };

  const mainTools = getToolsForRole("build-main", input.runMode, {
    onProgress: input.onProgress,
    onTraceCallbacks: input.onTrace,
    onTrace: async (trace) => {
      const phase = phaseForTool(trace.toolName);
      if (phase) {
        await input.onProgress({ phase, toolTrace: trace });
      }
    },
  });

  input.onTrace?.onColumnStart({
    id: MAIN_COLUMN_ID,
    kind: "main",
    label: "Build agent",
    tools: agentToolsToLlmDefinitions(mainTools),
  });

  const historyMessages = historyToLlmMessages(input.history);

  try {
    const result = await runAgentLoop({
      systemPrompt: BUILD_MAIN_AGENT_PROMPT,
      messages: [...historyMessages, { role: "user", content: input.userMessage }],
      tools: mainTools,
      maxIterations: MAIN_AGENT_MAX_ITERATIONS,
      temperature: 0.3,
      ctx,
      onLoopMessage: createLoopMessageHandler(input.onTrace, MAIN_COLUMN_ID),
      onLoopMessageUpdate: createLoopMessageUpdateHandler(input.onTrace, MAIN_COLUMN_ID),
      onContentDelta: async (_delta, content) => {
        await input.onAnswerDelta?.(content);
      },
    });

    input.onTrace?.onColumnEnd(MAIN_COLUMN_ID, "done");
    return result.content;
  } catch (err) {
    input.onTrace?.onColumnEnd(MAIN_COLUMN_ID, "error");
    throw err;
  }
}

function phaseForTool(toolName: string): AgentProgress["phase"] | undefined {
  switch (toolName) {
    case "read_file":
      return "reading";
    case "grep":
    case "glob":
      return "searching";
    case "edit_file":
    case "write_file":
      return "editing";
    case "run_command":
      return "running_command";
    default:
      return undefined;
  }
}
