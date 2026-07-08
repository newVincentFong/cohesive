import type { LlmMessage } from "@/core/llm/llm.types";
import { runAgentLoop, type AgentLoopMessageEvent, type AgentLoopMessageUpdateEvent } from "./agent-loop";
import type { AgentContext, ExploreTask, ToolTrace } from "./agent.types";
import { EXPLORE_SUB_AGENT_PROMPT } from "@/core/code/prompts/explore.prompts";
import { getToolsForRole } from "./tools";

const SUB_AGENT_MAX_ITERATIONS = 15;

function buildSubAgentUserMessage(task: ExploreTask): string {
  const paths =
    task.startingPaths && task.startingPaths.length > 0
      ? `\nStarting paths:\n${task.startingPaths.map((path) => `- ${path}`).join("\n")}`
      : "";
  return `Explore task:\n${task.task}${paths}`;
}

export function getExploreSubAgentTools(
  onTrace?: (trace: ToolTrace) => Promise<void>,
) {
  return getToolsForRole("explore-sub", "explore", { onTrace });
}

export async function runExploreSubAgent(input: {
  task: ExploreTask;
  ctx: AgentContext;
  onRead?: (trace: ToolTrace) => Promise<void>;
  onSearch?: (trace: ToolTrace) => Promise<void>;
  onLoopMessage?: (event: AgentLoopMessageEvent) => void | Promise<void>;
  onLoopMessageUpdate?: (event: AgentLoopMessageUpdateEvent) => void | Promise<void>;
}): Promise<string> {
  const messages: LlmMessage[] = [
    { role: "user", content: buildSubAgentUserMessage(input.task) },
  ];

  const onToolTrace = async (trace: ToolTrace) => {
    if (trace.toolName === "read_file") {
      await input.onRead?.(trace);
      return;
    }
    if (trace.toolName === "grep" || trace.toolName === "glob") {
      await input.onSearch?.(trace);
      return;
    }
    await input.onRead?.(trace);
  };

  const result = await runAgentLoop({
    systemPrompt: EXPLORE_SUB_AGENT_PROMPT,
    messages,
    tools: getToolsForRole("explore-sub", input.ctx.runMode, { onTrace: onToolTrace }),
    maxIterations: SUB_AGENT_MAX_ITERATIONS,
    temperature: 0.2,
    ctx: input.ctx,
    onLoopMessage: input.onLoopMessage,
    onLoopMessageUpdate: input.onLoopMessageUpdate,
  });

  return result.content;
}
