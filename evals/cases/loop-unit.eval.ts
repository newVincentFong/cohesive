import { describe, expect, it } from "vitest";
import { BUDGET } from "@/core/code/agents/tools/output-budget";
import { BUILD_MAIN_AGENT_PROMPT } from "@/core/code/prompts/build.prompts";
import { ScriptedLlmProvider, type ScriptedStep } from "../harness/llm";
import { fixturePath, runEvalCase } from "../harness/run-case";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

function toolCall(name: string, args: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    type: "function" as const,
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}

describe("loop unit evals (scripted LLM)", () => {
  it("returns error for unknown tool and continues to final answer", async () => {
    const steps: ScriptedStep[] = [
      {
        content: "",
        toolCalls: [toolCall("does_not_exist", {})],
      },
      { content: "Handled unknown tool gracefully." },
    ];

    const llm = new ScriptedLlmProvider(steps);
    const { cleanup, result } = await runEvalCase({
      caseId: "unknown-tool",
      fixturePath: fixturePath("todo-app"),
      mode: "loop",
      userMessage: "Test unknown tool handling",
      llm,
      systemPrompt: BUILD_MAIN_AGENT_PROMPT,
      maxIterations: 3,
      temperature: 0,
      assertions: [
        { type: "answerContains", text: "Handled unknown tool gracefully." },
      ],
    });
    await cleanup();
    expect(result.passed).toBe(true);
  });

  it("handles malformed tool args via schema validation", async () => {
    const steps: ScriptedStep[] = [
      {
        content: "",
        toolCalls: [toolCall("read_file", { relativePath: "" })],
      },
      { content: "Recovered from invalid read_file args." },
    ];

    const llm = new ScriptedLlmProvider(steps);
    const { cleanup, result } = await runEvalCase({
      caseId: "malformed-args",
      fixturePath: fixturePath("todo-app"),
      mode: "loop",
      userMessage: "Test malformed args",
      llm,
      systemPrompt: BUILD_MAIN_AGENT_PROMPT,
      maxIterations: 3,
      temperature: 0,
      assertions: [
        { type: "answerContains", text: "Recovered from invalid read_file args." },
      ],
    });
    await cleanup();
    expect(result.passed).toBe(true);
  });

  it("enforces read-before-edit guard", async () => {
    const steps: ScriptedStep[] = [
      {
        content: "",
        toolCalls: [
          toolCall("edit_file", {
            relativePath: "src/todo-service.ts",
            oldString: "index > todos.length",
            newString: "index >= todos.length",
          }),
        ],
      },
      { content: "Edit blocked as expected." },
    ];

    const llm = new ScriptedLlmProvider(steps);
    const { cleanup, result } = await runEvalCase({
      caseId: "edit-before-read",
      fixturePath: fixturePath("todo-app"),
      mode: "loop",
      userMessage: "Try editing without reading first",
      llm,
      systemPrompt: BUILD_MAIN_AGENT_PROMPT,
      maxIterations: 3,
      temperature: 0,
      role: "build-main",
      assertions: [{ type: "answerContains", text: "Edit blocked as expected." }],
    });
    await cleanup();
    expect(result.passed).toBe(true);
  });

  it("truncates read_file output according to BUDGET", async () => {
    const { cleanup, result, projectPath } = await runEvalCase({
      caseId: "read-truncation",
      fixturePath: fixturePath("todo-app"),
      mode: "loop",
      userMessage: "Read the large file",
      llm: new ScriptedLlmProvider([
        {
          content: "",
          toolCalls: [toolCall("read_file", { relativePath: "large.txt" })],
        },
        { content: "Read complete." },
      ]),
      systemPrompt: BUILD_MAIN_AGENT_PROMPT,
      maxIterations: 2,
      temperature: 0,
      role: "build-main",
      setup: async (fixtureProjectPath) => {
        const content = "LINE\n".repeat(Math.ceil(BUDGET.readFileMaxChars / 4));
        await writeFile(join(fixtureProjectPath, "large.txt"), content, "utf8");
      },
      assertions: [
        { type: "answerContains", text: "Read complete." },
        {
          type: "custom",
          name: "tool output truncated",
          check: (ctx) =>
            ctx.messages.some(
              (message) =>
                message.role === "tool" && message.content?.includes("[truncated"),
            ),
          message: "Expected truncated read_file tool output in loop messages",
        },
      ],
    });
    await cleanup();
    expect(result.passed).toBe(true);
    expect(projectPath).toBeTruthy();
  });

  it("returns timeout message when iteration limit is reached", async () => {
    const infiniteToolLoop: ScriptedStep[] = Array.from({ length: 10 }, () => ({
      content: "",
      toolCalls: [toolCall("glob", { pattern: "**/*.ts" })],
    }));

    const llm = new ScriptedLlmProvider(infiniteToolLoop);
    const { cleanup, result } = await runEvalCase({
      caseId: "iteration-limit",
      fixturePath: fixturePath("todo-app"),
      mode: "loop",
      userMessage: "Keep searching forever",
      llm,
      systemPrompt: BUILD_MAIN_AGENT_PROMPT,
      maxIterations: 3,
      temperature: 0,
      role: "build-main",
      assertions: [
        {
          type: "answerContains",
          text: "iteration limit",
          caseInsensitive: true,
        },
      ],
    });
    await cleanup();
    expect(result.passed).toBe(true);
  });
});
