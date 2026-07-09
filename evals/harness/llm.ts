import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  LlmCompletionInput,
  LlmCompletionResult,
  LlmProvider,
  LlmStreamChunk,
  LlmToolCall,
} from "@/core/llm/llm.types";
import { DEFAULT_DEEPSEEK_MODEL } from "@/core/llm/deepseek-provider";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

export interface LlmCallRecord {
  index: number;
  input: LlmCompletionInput;
  result: LlmCompletionResult;
  promptChars: number;
  durationMs: number;
}

export interface ScriptedStepResult {
  content?: string;
  toolCalls?: LlmToolCall[];
}

export type ScriptedStep =
  | ScriptedStepResult
  | ((
      input: LlmCompletionInput,
      callIndex: number,
    ) => ScriptedStepResult | Promise<ScriptedStepResult>);

async function readApiKey(): Promise<string> {
  const path = join(homedir(), ".cohesive", "api-key");
  try {
    const key = (await readFile(path, "utf8")).trim();
    if (!key) {
      throw new Error("API key file is empty");
    }
    return key;
  } catch {
    throw new Error(
      `DeepSeek API key not found at ${path}. Set it via the Cohesive settings UI or create the file manually.`,
    );
  }
}

function estimatePromptChars(messages: LlmCompletionInput["messages"]): number {
  return messages.reduce((total, message) => {
    const contentLen = message.content?.length ?? 0;
    const toolCallsLen = message.toolCalls
      ? JSON.stringify(message.toolCalls).length
      : 0;
    return total + contentLen + toolCallsLen + 20;
  }, 0);
}

function toOpenAiMessages(messages: LlmCompletionInput["messages"]) {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool" as const,
        content: message.content ?? "",
        tool_call_id: message.toolCallId,
      };
    }
    if (message.role === "assistant" && message.toolCalls?.length) {
      return {
        role: "assistant" as const,
        content: message.content ?? null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: call.type,
          function: call.function,
        })),
      };
    }
    return {
      role: message.role,
      content: message.content ?? "",
    };
  });
}

function parseToolCalls(raw: unknown): LlmToolCall[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((item) => {
    const call = item as {
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    };
    return {
      id: call.id,
      type: "function",
      function: {
        name: call.function.name,
        arguments: call.function.arguments,
      },
    };
  });
}

export class ScriptedLlmProvider implements LlmProvider {
  private stepIndex = 0;
  public readonly calls: LlmCompletionInput[] = [];

  constructor(private readonly steps: ScriptedStep[]) {}

  async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
    return this.streamWithHandler(input, () => {});
  }

  async *stream(input: LlmCompletionInput): AsyncIterable<LlmStreamChunk> {
    const pending: LlmStreamChunk[] = [];
    const result = await this.streamWithHandler(input, (chunk) => {
      pending.push(chunk);
    });
    for (const chunk of pending) {
      yield chunk;
    }
    if (!result.content) {
      yield { delta: "", done: true, usage: result.usage };
    }
  }

  async streamWithHandler(
    input: LlmCompletionInput,
    onChunk: (chunk: LlmStreamChunk) => void,
  ): Promise<LlmCompletionResult> {
    this.calls.push(structuredClone(input));
    const stepDef = this.steps[this.stepIndex];
    this.stepIndex += 1;

    const resolved =
      typeof stepDef === "function"
        ? await stepDef(input, this.stepIndex - 1)
        : (stepDef ?? { content: "Done." });

    const content = resolved.content ?? "";
    if (content) {
      onChunk({ delta: content, done: false });
    }
    onChunk({ delta: "", done: true });

    return {
      content,
      model: "scripted",
      toolCalls: resolved.toolCalls,
      finishReason: resolved.toolCalls?.length ? "tool_calls" : "stop",
    };
  }
}

export class EvalLlmProvider implements LlmProvider {
  public readonly records: LlmCallRecord[] = [];
  private callIndex = 0;

  constructor(
    private readonly model: string = DEFAULT_DEEPSEEK_MODEL,
    private readonly apiKey?: string,
  ) {}

  async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
    return this.streamWithHandler(input, () => {});
  }

  async *stream(input: LlmCompletionInput): AsyncIterable<LlmStreamChunk> {
    const pending: LlmStreamChunk[] = [];
    const result = await this.streamWithHandler(input, (chunk) => {
      pending.push(chunk);
    });
    for (const chunk of pending) {
      yield chunk;
    }
    if (!pending.some((chunk) => chunk.done)) {
      yield { delta: "", done: true, usage: result.usage };
    }
  }

  async streamWithHandler(
    input: LlmCompletionInput,
    onChunk: (chunk: LlmStreamChunk) => void,
  ): Promise<LlmCompletionResult> {
    const started = Date.now();
    const key = this.apiKey ?? (await readApiKey());
    const promptChars = estimatePromptChars(input.messages);

    const body = {
      model: input.model ?? this.model,
      messages: toOpenAiMessages(input.messages),
      temperature: input.temperature ?? 0.3,
      max_tokens: input.maxTokens,
      tools: input.tools?.map((tool) => ({
        type: tool.type,
        function: tool.function,
      })),
      tool_choice: input.toolChoice ?? "auto",
      stream: false,
    };

    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DeepSeek API error ${response.status}: ${text}`);
    }

    const payload = (await response.json()) as {
      model: string;
      choices: Array<{
        message: {
          content?: string | null;
          tool_calls?: unknown;
        };
        finish_reason?: string;
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const choice = payload.choices[0];
    const content = choice?.message.content ?? "";
    const toolCalls = parseToolCalls(choice?.message.tool_calls);

    if (content) {
      onChunk({ delta: content, done: false });
    }
    onChunk({
      delta: "",
      done: true,
      usage: payload.usage
        ? {
            promptTokens: payload.usage.prompt_tokens,
            completionTokens: payload.usage.completion_tokens,
            totalTokens: payload.usage.total_tokens,
          }
        : undefined,
    });

    const result: LlmCompletionResult = {
      content,
      model: payload.model,
      toolCalls,
      finishReason: choice?.finish_reason,
      usage: payload.usage
        ? {
            promptTokens: payload.usage.prompt_tokens,
            completionTokens: payload.usage.completion_tokens,
            totalTokens: payload.usage.total_tokens,
          }
        : undefined,
    };

    this.records.push({
      index: this.callIndex,
      input: structuredClone(input),
      result: structuredClone(result),
      promptChars,
      durationMs: Date.now() - started,
    });
    this.callIndex += 1;

    return result;
  }
}

export function hasEvalApiKey(): boolean {
  try {
    const path = join(homedir(), ".cohesive", "api-key");
    return Boolean(path);
  } catch {
    return false;
  }
}
