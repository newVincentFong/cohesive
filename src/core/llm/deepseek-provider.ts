import type {
  LlmCompletionInput,
  LlmCompletionResult,
  LlmStreamChunk,
  LlmProvider,
} from "./llm.types";
import { invoke } from "@/core/platform/tauri";

export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro";

export class DeepSeekProvider implements LlmProvider {
  constructor(private readonly model: string = DEFAULT_DEEPSEEK_MODEL) {}

  async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
    return invoke<LlmCompletionResult>("llm_complete", {
      input: { ...input, model: input.model ?? this.model },
    });
  }

  async *stream(input: LlmCompletionInput): AsyncIterable<LlmStreamChunk> {
    const chunks = await invoke<LlmStreamChunk[]>("llm_stream", {
      input: { ...input, model: input.model ?? this.model },
    });
    for (const chunk of chunks) {
      yield chunk;
    }
  }
}

export function createLlmProvider(): LlmProvider {
  return new DeepSeekProvider();
}
