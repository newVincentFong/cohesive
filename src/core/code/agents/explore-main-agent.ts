import type { Message } from "@/core/message/message.types";
import type { LlmMessage } from "@/core/llm/llm.types";
import type { Session, CodeMode } from "@/core/session/session.types";
import type { CodeProject } from "@/core/code/agent.types";
import { agentToolsToLlmDefinitions, runAgentLoop, type AgentLoopMessageEvent, type AgentLoopMessageUpdateEvent } from "./agent-loop";
import type { AgentContext, AgentProgress } from "./agent.types";
import type { AgentTraceCallbacks } from "./agent-trace.types";
import { createTracedMessage } from "./agent-trace.types";
import { EXPLORE_MAIN_AGENT_PROMPT } from "@/core/code/prompts/explore.prompts";
import { getToolsForRole } from "./tools";

const MAIN_AGENT_MAX_ITERATIONS = 10;
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

export async function runExploreAgent(input: {
  session: Session;
  project: CodeProject;
  userMessage: string;
  history: Message[];
  runId: string;
  runMode: CodeMode;
  onProgress: (update: AgentProgress) => Promise<void>;
  onTrace?: AgentTraceCallbacks;
  onAnswerDelta?: (content: string) => void | Promise<void>;
  llm?: AgentContext["llm"];
}): Promise<{ content: string; messages: LlmMessage[] }> {
  const ctx: AgentContext = {
    session: input.session,
    project: input.project,
    runId: input.runId,
    runMode: input.runMode,
    onProgress: input.onProgress,
    llm: input.llm,
  };

  const mainTools = getToolsForRole("explore-main", input.runMode, {
    onProgress: input.onProgress,
    onTraceCallbacks: input.onTrace,
  });

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
      onLoopMessageUpdate: createLoopMessageUpdateHandler(input.onTrace, MAIN_COLUMN_ID),
      onContentDelta: async (_delta, content) => {
        await input.onAnswerDelta?.(content);
      },
    });

    input.onTrace?.onColumnEnd(MAIN_COLUMN_ID, "done");
    return { content: result.content, messages: result.messages };
  } catch (err) {
    input.onTrace?.onColumnEnd(MAIN_COLUMN_ID, "error");
    throw err;
  }
}
