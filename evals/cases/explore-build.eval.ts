import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EvalLlmProvider } from "../harness/llm";
import { fixturePath, runEvalCaseWithRepeats } from "../harness/run-case";
import { buildReport, formatReportSummary, writeEvalReport } from "../harness/report";

async function hasApiKey(): Promise<boolean> {
  try {
    await access(join(homedir(), ".cohesive", "api-key"));
    return true;
  } catch {
    return false;
  }
}

const liveEval = await hasApiKey();
const describeLive = liveEval && process.env.EVAL_SKIP_LIVE !== "1" ? describe : describe.skip;

describeLive("explore + build evals (live LLM)", () => {
  it("explore: locates removeTodo definition", async () => {
    const llm = new EvalLlmProvider();
    const result = await runEvalCaseWithRepeats(
      {
        caseId: "explore-removeTodo-location",
        fixturePath: fixturePath("todo-app"),
        mode: "explore",
        userMessage:
          "Where is the removeTodo method defined? Reply with the relative file path only.",
        llm,
        assertions: [
          { type: "answerContains", text: "todo-service.ts", caseInsensitive: true },
        ],
      },
      1,
    );
    expect(result.passed).toBe(true);
  }, 180_000);

  it("explore: explains todo persistence across files", async () => {
    const llm = new EvalLlmProvider();
    const result = await runEvalCaseWithRepeats(
      {
        caseId: "explore-storage-flow",
        fixturePath: fixturePath("todo-app"),
        mode: "explore",
        userMessage:
          "How are todos stored in memory? Mention the storage class and the service that uses it.",
        llm,
        assertions: [
          { type: "answerContains", text: "MemoryStore", caseInsensitive: true },
          { type: "answerContains", text: "TodoService", caseInsensitive: true },
        ],
      },
      1,
    );
    expect(result.passed).toBe(true);
  }, 180_000);

  it("build: fixes off-by-one bug in removeTodo", async () => {
    const llm = new EvalLlmProvider();
    const result = await runEvalCaseWithRepeats(
      {
        caseId: "build-fix-removeTodo",
        fixturePath: fixturePath("todo-app"),
        mode: "build",
        userMessage:
          "Fix the off-by-one bug in removeTodo in src/todo-service.ts. The guard should reject index >= todos.length, not index > todos.length.",
        llm,
        assertions: [
          {
            type: "fileContains",
            relativePath: "src/todo-service.ts",
            text: "index >= todos.length",
          },
          {
            type: "fileNotContains",
            relativePath: "src/todo-service.ts",
            text: "index > todos.length",
          },
        ],
      },
      1,
    );
    expect(result.passed).toBe(true);
  }, 240_000);

  it("build: renames LEGACY_STATUS_LABEL across the codebase", async () => {
    const llm = new EvalLlmProvider();
    const result = await runEvalCaseWithRepeats(
      {
        caseId: "build-rename-status-label",
        fixturePath: fixturePath("todo-app"),
        mode: "build",
        userMessage:
          "Rename the constant LEGACY_STATUS_LABEL to ACTIVE_STATUS_LABEL everywhere it is defined and used.",
        llm,
        assertions: [
          {
            type: "fileContains",
            relativePath: "src/constants/status.ts",
            text: "ACTIVE_STATUS_LABEL",
          },
          {
            type: "fileContains",
            relativePath: "src/ui/status-badge.ts",
            text: "ACTIVE_STATUS_LABEL",
          },
          {
            type: "fileContains",
            relativePath: "src/filters/default-filter.ts",
            text: "ACTIVE_STATUS_LABEL",
          },
          {
            type: "fileNotContains",
            relativePath: "src/constants/status.ts",
            text: "LEGACY_STATUS_LABEL",
          },
        ],
      },
      1,
    );
    expect(result.passed).toBe(true);
  }, 300_000);

  it("build: resolves ambiguous edit with enough context", async () => {
    const llm = new EvalLlmProvider();
    const result = await runEvalCaseWithRepeats(
      {
        caseId: "build-ambiguous-edit",
        fixturePath: fixturePath("todo-app"),
        mode: "build",
        userMessage:
          "In src/config/ambiguous.ts, change only configA's DUPLICATE_MARKER value from alpha to gamma. Do not change configB.",
        llm,
        assertions: [
          {
            type: "fileContains",
            relativePath: "src/config/ambiguous.ts",
            text: 'DUPLICATE_MARKER gamma',
          },
          {
            type: "fileContains",
            relativePath: "src/config/ambiguous.ts",
            text: 'DUPLICATE_MARKER beta',
          },
        ],
      },
      1,
    );
    expect(result.passed).toBe(true);
  }, 240_000);

  it("build: completes simple task within iteration budget", async () => {
    const llm = new EvalLlmProvider();
    const result = await runEvalCaseWithRepeats(
      {
        caseId: "build-efficiency",
        fixturePath: fixturePath("todo-app"),
        mode: "build",
        userMessage: "Add a short comment above removeTodo explaining it uses zero-based indexing.",
        llm,
        assertions: [
          {
            type: "fileContains",
            relativePath: "src/todo-service.ts",
            text: "zero-based",
            name: "comment added",
          },
          { type: "metricsUnder", maxIterations: 12, maxLlmCalls: 12 },
        ],
      },
      1,
    );
    expect(result.passed).toBe(true);
  }, 240_000);

  it("writes an eval report after the live suite slice", async () => {
    const report = buildReport("live-smoke", new Date().toISOString(), []);
    const path = await writeEvalReport(report);
    expect(path).toContain("evals/results");
    expect(formatReportSummary(report)).toContain("Passed");
  });
});
