import { createLlmProvider } from "@/core/llm/deepseek-provider";
import type {
  LlmMessage,
  LlmToolCall,
  LlmToolDefinition,
} from "@/core/llm/llm.types";
import type { AgentContext, AgentTool } from "./agent.types";

export interface AgentLoopConfig {
  systemPrompt: string;
  messages: LlmMessage[];
  tools: AgentTool[];
  maxIterations: number;
  temperature?: number;
  ctx: AgentContext;
  onToolCall?: (toolName: string, args: unknown) => Promise<void>;
}

export interface AgentLoopResult {
  content: string;
  messages: LlmMessage[];
}

function toLlmTools(tools: AgentTool[]): LlmToolDefinition[] {
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

export async function runAgentLoop(config: AgentLoopConfig): Promise<AgentLoopResult> {
  const llm = createLlmProvider();
  const messages: LlmMessage[] = [
    { role: "system", content: config.systemPrompt },
    ...config.messages,
  ];

  for (let iteration = 0; iteration < config.maxIterations; iteration += 1) {
    const result = await llm.complete({
      messages,
      tools: toLlmTools(config.tools),
      toolChoice: "auto",
      temperature: config.temperature ?? 0.3,
    });

    const toolCalls = result.toolCalls ?? [];
    if (toolCalls.length === 0) {
      const content =
        result.content.trim() ||
        "I could not produce a response. Please try rephrasing your question.";
      messages.push({ role: "assistant", content });
      return { content, messages: messages.slice(1) };
    }

    const assistantMessage: LlmMessage = {
      role: "assistant",
      content: result.content || undefined,
      toolCalls,
    };
    messages.push(assistantMessage);

    for (const toolCall of toolCalls) {
      const output = await dispatchToolCall(toolCall, config);
      messages.push({
        role: "tool",
        toolCallId: toolCall.id,
        content: output,
      });
    }
  }

  const timeoutMessage =
    "Exploration reached the iteration limit. Summarize what was found so far or ask a narrower question.";
  messages.push({ role: "assistant", content: timeoutMessage });
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
