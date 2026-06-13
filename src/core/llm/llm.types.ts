export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCompletionInput {
  messages: LlmMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
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
