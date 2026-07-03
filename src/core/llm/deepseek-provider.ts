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

  async streamWithHandler(
    input: LlmCompletionInput,
    onChunk: (chunk: LlmStreamChunk) => void,
  ): Promise<LlmCompletionResult> {
    const streamId = crypto.randomUUID();
    const eventName = `llm-stream-${streamId}`;
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen<LlmStreamChunk>(eventName, (event) => {
      onChunk(event.payload);
    });

    try {
      return await invoke<LlmCompletionResult>("llm_stream", {
        input: { ...input, model: input.model ?? this.model },
        streamId,
      });
    } finally {
      unlisten();
    }
  }

  async *stream(input: LlmCompletionInput): AsyncIterable<LlmStreamChunk> {
    const pending: LlmStreamChunk[] = [];
    let notify: (() => void) | undefined;
    let finished = false;
    let failure: Error | undefined;

    const completion = this.streamWithHandler(input, (chunk) => {
      pending.push(chunk);
      notify?.();
    }).then(
      () => {
        finished = true;
        notify?.();
      },
      (err) => {
        failure = err instanceof Error ? err : new Error(String(err));
        finished = true;
        notify?.();
      },
    );

    while (!finished || pending.length > 0) {
      if (pending.length === 0) {
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
        if (failure) {
          throw failure;
        }
        continue;
      }
      yield pending.shift()!;
    }

    await completion;
  }
}

export function createLlmProvider(): LlmProvider {
  return new DeepSeekProvider();
}
