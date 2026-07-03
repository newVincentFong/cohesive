import { createLlmProvider } from "@/core/llm/deepseek-provider";
import type {
  LlmMessage,
  LlmToolCall,
  LlmToolDefinition,
} from "@/core/llm/llm.types";
import type { AgentContext, AgentTool } from "./agent.types";

export interface AgentLoopMessageEvent {
  message: LlmMessage;
  iteration: number;
  index: number;
}

export interface AgentLoopConfig {
  systemPrompt: string;
  messages: LlmMessage[];
  tools: AgentTool[];
  maxIterations: number;
  temperature?: number;
  ctx: AgentContext;
  onToolCall?: (toolName: string, args: unknown) => Promise<void>;
  onLoopMessage?: (event: AgentLoopMessageEvent) => void | Promise<void>;
}

export interface AgentLoopResult {
  content: string;
  messages: LlmMessage[];
}

export function agentToolsToLlmDefinitions(tools: AgentTool[]): LlmToolDefinition[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function parseToolArgs(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}

async function emitLoopMessage(
  config: AgentLoopConfig,
  message: LlmMessage,
  iteration: number,
  indexRef: { value: number },
): Promise<void> {
  if (!config.onLoopMessage) return;
  const event: AgentLoopMessageEvent = {
    message,
    iteration,
    index: indexRef.value,
  };
  indexRef.value += 1;
  await config.onLoopMessage(event);
}

export async function runAgentLoop(config: AgentLoopConfig): Promise<AgentLoopResult> {
  const llm = createLlmProvider();
  const messages: LlmMessage[] = [
    { role: "system", content: config.systemPrompt },
    ...config.messages,
  ];
  const indexRef = { value: 0 };

  await emitLoopMessage(config, { role: "system", content: config.systemPrompt }, -1, indexRef);
  for (const message of config.messages) {
    await emitLoopMessage(config, message, -1, indexRef);
  }

  for (let iteration = 0; iteration < config.maxIterations; iteration += 1) {
    const result = await llm.complete({
      messages,
      tools: agentToolsToLlmDefinitions(config.tools),
      toolChoice: "auto",
      temperature: config.temperature ?? 0.3,
    });

    const toolCalls = result.toolCalls ?? [];
    if (toolCalls.length === 0) {
      const content =
        result.content.trim() ||
        "I could not produce a response. Please try rephrasing your question.";
      const assistantMessage: LlmMessage = { role: "assistant", content };
      messages.push(assistantMessage);
      await emitLoopMessage(config, assistantMessage, iteration, indexRef);
      return { content, messages: messages.slice(1) };
    }

    const assistantMessage: LlmMessage = {
      role: "assistant",
      content: result.content || undefined,
      toolCalls,
    };
    messages.push(assistantMessage);
    await emitLoopMessage(config, assistantMessage, iteration, indexRef);

    for (const toolCall of toolCalls) {
      const output = await dispatchToolCall(toolCall, config);
      const toolMessage: LlmMessage = {
        role: "tool",
        toolCallId: toolCall.id,
        content: output,
      };
      messages.push(toolMessage);
      await emitLoopMessage(config, toolMessage, iteration, indexRef);
    }
  }

  const timeoutMessage =
    "Exploration reached the iteration limit. Summarize what was found so far or ask a narrower question.";
  const timeoutAssistant: LlmMessage = { role: "assistant", content: timeoutMessage };
  messages.push(timeoutAssistant);
  await emitLoopMessage(config, timeoutAssistant, config.maxIterations, indexRef);
  return { content: timeoutMessage, messages: messages.slice(1) };
}

async function dispatchToolCall(
  toolCall: LlmToolCall,
  config: AgentLoopConfig,
): Promise<string> {
  const tool = config.tools.find((item) => item.name === toolCall.function.name);
  if (!tool) {
    return `Error: unknown tool "${toolCall.function.name}"`;
  }

  const args = parseToolArgs(toolCall.function.arguments);
  if (config.onToolCall) {
    await config.onToolCall(tool.name, args);
  }

  try {
    return await tool.execute(args, config.ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `Error executing ${tool.name}: ${message}`;
  }
}
