import type { LlmMessage } from "@/core/llm/llm.types";
import type { CodeMode } from "@/core/session/session.types";
import type { LlmCallRecord } from "./llm";

export interface EvalMetrics {
  durationMs: number;
  llmCalls: number;
  maxPromptChars: number;
  totalPromptChars: number;
  toolCalls: number;
  iterations: number;
}

export interface EvalCaseResult {
  caseId: string;
  passed: boolean;
  answer: string;
  messages: LlmMessage[];
  metrics: EvalMetrics;
  llmRecords: LlmCallRecord[];
  assertionResults: AssertionResult[];
  error?: string;
}

export interface AssertionResult {
  name: string;
  passed: boolean;
  message?: string;
}

export interface EvalContext {
  projectPath: string;
  answer: string;
  messages: LlmMessage[];
  metrics: EvalMetrics;
  llmRecords: LlmCallRecord[];
}

export type Assertion =
  | {
      type: "answerContains";
      text: string;
      caseInsensitive?: boolean;
      name?: string;
    }
  | {
      type: "answerMatches";
      pattern: RegExp;
      name?: string;
    }
  | {
      type: "fileContains";
      relativePath: string;
      text: string;
      name?: string;
    }
  | {
      type: "fileEquals";
      relativePath: string;
      expected: string;
      name?: string;
    }
  | {
      type: "fileNotContains";
      relativePath: string;
      text: string;
      name?: string;
    }
  | {
      type: "toolSequence";
      tools: string[];
      name?: string;
    }
  | {
      type: "toolUsed";
      tool: string;
      name?: string;
    }
  | {
      type: "metricsUnder";
      maxIterations?: number;
      maxLlmCalls?: number;
      maxPromptChars?: number;
      maxDurationMs?: number;
      name?: string;
    }
  | {
      type: "custom";
      name: string;
      check: (ctx: EvalContext) => boolean | Promise<boolean>;
      message?: string;
    };

export async function runAssertions(
  assertions: Assertion[],
  ctx: EvalContext,
): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];

  for (const assertion of assertions) {
    const name = assertionName(assertion);
    try {
      const passed = await evaluateAssertion(assertion, ctx);
      results.push({
        name,
        passed,
        message: passed ? undefined : failureMessage(assertion, ctx),
      });
    } catch (err) {
      results.push({
        name,
        passed: false,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

function assertionName(assertion: Assertion): string {
  if ("name" in assertion && assertion.name) {
    return assertion.name;
  }
  switch (assertion.type) {
    case "answerContains":
      return `answerContains("${assertion.text}")`;
    case "answerMatches":
      return `answerMatches(${assertion.pattern})`;
    case "fileContains":
      return `fileContains(${assertion.relativePath})`;
    case "fileEquals":
      return `fileEquals(${assertion.relativePath})`;
    case "fileNotContains":
      return `fileNotContains(${assertion.relativePath})`;
    case "toolSequence":
      return `toolSequence(${assertion.tools.join(" → ")})`;
    case "toolUsed":
      return `toolUsed(${assertion.tool})`;
    case "metricsUnder":
      return "metricsUnder";
    case "custom":
      return assertion.name;
    default:
      return "unknown";
  }
}

async function evaluateAssertion(assertion: Assertion, ctx: EvalContext): Promise<boolean> {
  switch (assertion.type) {
    case "answerContains": {
      const haystack = assertion.caseInsensitive ? ctx.answer.toLowerCase() : ctx.answer;
      const needle = assertion.caseInsensitive ? assertion.text.toLowerCase() : assertion.text;
      return haystack.includes(needle);
    }
    case "answerMatches":
      return assertion.pattern.test(ctx.answer);
    case "fileContains":
    case "fileEquals":
    case "fileNotContains": {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const content = await readFile(join(ctx.projectPath, assertion.relativePath), "utf8");
      if (assertion.type === "fileEquals") {
        return content === assertion.expected;
      }
      if (assertion.type === "fileNotContains") {
        return !content.includes(assertion.text);
      }
      return content.includes(assertion.text);
    }
    case "toolSequence": {
      const actual = extractToolNames(ctx.messages);
      if (actual.length !== assertion.tools.length) return false;
      return assertion.tools.every((tool, index) => actual[index] === tool);
    }
    case "toolUsed":
      return extractToolNames(ctx.messages).includes(assertion.tool);
    case "metricsUnder": {
      if (assertion.maxIterations !== undefined && ctx.metrics.iterations > assertion.maxIterations) {
        return false;
      }
      if (assertion.maxLlmCalls !== undefined && ctx.metrics.llmCalls > assertion.maxLlmCalls) {
        return false;
      }
      if (
        assertion.maxPromptChars !== undefined &&
        ctx.metrics.maxPromptChars > assertion.maxPromptChars
      ) {
        return false;
      }
      if (assertion.maxDurationMs !== undefined && ctx.metrics.durationMs > assertion.maxDurationMs) {
        return false;
      }
      return true;
    }
    case "custom":
      return Boolean(await assertion.check(ctx));
    default:
      return false;
  }
}

function failureMessage(assertion: Assertion, ctx: EvalContext): string {
  switch (assertion.type) {
    case "answerContains":
      return `Answer did not contain "${assertion.text}". Got: ${truncate(ctx.answer, 200)}`;
    case "answerMatches":
      return `Answer did not match ${assertion.pattern}. Got: ${truncate(ctx.answer, 200)}`;
    case "toolSequence":
      return `Expected tools [${assertion.tools.join(", ")}], got [${extractToolNames(ctx.messages).join(", ")}]`;
    case "toolUsed":
      return `Tool "${assertion.tool}" was not used. Used: [${extractToolNames(ctx.messages).join(", ")}]`;
    case "metricsUnder":
      return `Metrics exceeded limits: ${JSON.stringify(ctx.metrics)}`;
    case "custom":
      return assertion.message ?? `Custom assertion "${assertion.name}" failed`;
    default:
      return `Assertion ${assertion.type} failed`;
  }
}

export function extractToolNames(messages: LlmMessage[]): string[] {
  const names: string[] = [];
  for (const message of messages) {
    for (const call of message.toolCalls ?? []) {
      names.push(call.function.name);
    }
  }
  return names;
}

export function countIterations(messages: LlmMessage[]): number {
  const assistantWithTools = messages.filter(
    (message) => message.role === "assistant" && (message.toolCalls?.length ?? 0) > 0,
  );
  const finalAssistant = messages.some(
    (message) => message.role === "assistant" && !(message.toolCalls?.length ?? 0),
  );
  return assistantWithTools.length + (finalAssistant ? 1 : 0);
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

export function buildMetrics(input: {
  durationMs: number;
  llmRecords: LlmCallRecord[];
  messages: LlmMessage[];
}): EvalMetrics {
  const promptChars = input.llmRecords.map((record) => record.promptChars);
  return {
    durationMs: input.durationMs,
    llmCalls: input.llmRecords.length,
    maxPromptChars: promptChars.length > 0 ? Math.max(...promptChars) : 0,
    totalPromptChars: promptChars.reduce((sum, value) => sum + value, 0),
    toolCalls: extractToolNames(input.messages).length,
    iterations: countIterations(input.messages),
  };
}

export function isLiveEvalEnabled(mode: CodeMode | "unit"): boolean {
  return mode !== "unit" && process.env.EVAL_SKIP_LIVE !== "1";
}
