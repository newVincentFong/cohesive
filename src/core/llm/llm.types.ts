export interface LlmToolFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmToolDefinition {
  type: "function";
  function: LlmToolFunction;
}

export interface LlmToolCallFunction {
  name: string;
  arguments: string;
}

export interface LlmToolCall {
  id: string;
  type: "function";
  function: LlmToolCallFunction;
}

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  toolCalls?: LlmToolCall[];
  toolCallId?: string;
}

export interface LlmCompletionInput {
  messages: LlmMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: LlmToolDefinition[];
  toolChoice?: string | Record<string, unknown>;
}

export interface LlmUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface LlmCompletionResult {
  content: string;
  model: string;
  usage?: LlmUsage;
  toolCalls?: LlmToolCall[];
  finishReason?: string;
}

export interface LlmStreamChunk {
  delta: string;
  done: boolean;
  usage?: LlmUsage;
}

export interface LlmProvider {
  complete(input: LlmCompletionInput): Promise<LlmCompletionResult>;
  stream(input: LlmCompletionInput): AsyncIterable<LlmStreamChunk>;
}
