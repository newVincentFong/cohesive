import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import { EvalLlmProvider } from "../harness/llm";
import { fixturePath, runEvalCaseWithRepeats } from "../harness/run-case";
import { generateHaystackIntoFixtures, NEEDLE } from "../fixtures/haystack.gen";

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

describeLive("long-context evals (live LLM)", () => {
  beforeAll(async () => {
    await generateHaystackIntoFixtures();
  });

  it("needle-in-haystack: finds buried secret without blowing context budget", async () => {
    const llm = new EvalLlmProvider();
    const result = await runEvalCaseWithRepeats(
      {
        caseId: "longcontext-needle",
        fixturePath: fixturePath("haystack"),
        mode: "explore",
        userMessage:
          `Find the NEEDLE_SECRET_TOKEN value in src/haystack.ts. Reply with just the token value.`,
        llm,
        assertions: [
          { type: "answerContains", text: "eval-needle-42" },
          {
            type: "metricsUnder",
            maxPromptChars: 80_000,
            name: "context budget",
          },
          {
            type: "custom",
            name: "needle constant exists",
            check: async (ctx) => {
              const { readFile } = await import("node:fs/promises");
              const haystack = await readFile(join(ctx.projectPath, "src/haystack.ts"), "utf8");
              return haystack.includes(NEEDLE);
            },
          },
        ],
      },
      1,
    );
    expect(result.passed).toBe(true);
  }, 300_000);

  it("many-files: summarizes module layout with bounded context", async () => {
    const llm = new EvalLlmProvider();
    const result = await runEvalCaseWithRepeats(
      {
        caseId: "longcontext-many-files",
        fixturePath: fixturePath("haystack"),
        mode: "explore",
        userMessage:
          "How many module files exist under src/modules and what naming pattern do they follow?",
        llm,
        assertions: [
          { type: "answerContains", text: "module" },
          {
            type: "metricsUnder",
            maxPromptChars: 90_000,
            maxLlmCalls: 15,
          },
        ],
      },
      1,
    );
    expect(result.passed).toBe(true);
  }, 300_000);
});
