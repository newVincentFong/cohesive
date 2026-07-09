import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBuildAgent } from "@/core/code/agents/build-main-agent";
import { runExploreAgent } from "@/core/code/agents/explore-main-agent";
import { runAgentLoop } from "@/core/code/agents/agent-loop";
import { getToolsForRole } from "@/core/code/agents/tools";
import type { AgentContext } from "@/core/code/agents/agent.types";
import type { CodeProject } from "@/core/code/agent.types";
import type { LlmMessage, LlmProvider } from "@/core/llm/llm.types";
import type { Session } from "@/core/session/session.types";
import {
  buildMetrics,
  runAssertions,
  type Assertion,
  type EvalCaseResult,
  type EvalContext,
} from "./assertions";
import type { LlmCallRecord } from "./llm";
import { resetEvalShimState } from "./tauri-shim";

export interface RunCaseInput {
  caseId: string;
  fixturePath: string;
  /**
   * "build" / "explore" run the real production orchestrators
   * (runBuildAgent / runExploreAgent): system prompt, temperature,
   * maxIterations and tool registration all come from production code.
   * Use these for end-to-end, prod-faithful cases.
   *
   * "loop" drives runAgentLoop directly and is meant for unit-testing
   * loop mechanics only. systemPrompt / maxIterations / temperature
   * fall back to harness defaults that DIFFER from production, so
   * always pass them explicitly (a warning is emitted otherwise).
   */
  mode: "build" | "explore" | "loop";
  userMessage: string;
  llm: LlmProvider;
  /** Only used by mode "loop". Harness default: "You are a coding agent." (NOT the prod prompt). */
  systemPrompt?: string;
  assertions: Assertion[];
  setup?: (projectPath: string) => Promise<void>;
  /** Only used by mode "loop". */
  role?: "build-main" | "explore-main" | "explore-sub";
  /** Only used by mode "loop". Harness default: 5 (prod build-main uses 25, explore-main 10). */
  maxIterations?: number;
  /** Only used by mode "loop". Harness default: 0 (prod uses 0.3 / 0.4). */
  temperature?: number;
}

export interface RunCaseOutput {
  projectPath: string;
  cleanup: () => Promise<void>;
  result: EvalCaseResult;
}

function createSyntheticSession(projectId: string): Session {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    domain: "code",
    title: "Eval session",
    status: "active",
    defaultMode: "build",
    projectId,
    memoryScopeId: "memory:code",
    createdAt: now,
    updatedAt: now,
  };
}

function createSyntheticProject(projectPath: string): CodeProject {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    path: projectPath,
    displayName: "Eval fixture",
    createdAt: now,
  };
}

async function copyFixture(fixturePath: string): Promise<{ projectPath: string; cleanup: () => Promise<void> }> {
  const tempRoot = await mkdtemp(join(tmpdir(), "cohesive-eval-"));
  const projectPath = join(tempRoot, "project");
  await cp(fixturePath, projectPath, { recursive: true });
  return {
    projectPath,
    cleanup: async () => {
      await rm(tempRoot, { recursive: true, force: true });
    },
  };
}

function warnAboutLoopModeDefaults(input: RunCaseInput): void {
  const missing: string[] = [];
  if (input.systemPrompt === undefined) {
    missing.push('systemPrompt (harness default: "You are a coding agent.")');
  }
  if (input.maxIterations === undefined) {
    missing.push("maxIterations (harness default: 5; prod build-main uses 25, explore-main 10)");
  }
  if (input.temperature === undefined) {
    missing.push("temperature (harness default: 0; prod uses 0.3 / 0.4)");
  }
  if (missing.length === 0) return;

  console.warn(
    [
      `[eval] Case "${input.caseId}" uses mode "loop" without explicit: ${missing.join(", ")}.`,
      `[eval] mode "loop" is for unit-testing loop mechanics and its defaults DIFFER from production.`,
      `[eval] If you meant a prod-faithful end-to-end case, use mode "build" or "explore" instead;`,
      `[eval] otherwise pass these parameters explicitly to silence this warning.`,
    ].join("\n"),
  );
}

function collectLlmRecords(llm: LlmProvider): LlmCallRecord[] {
  if ("records" in llm && Array.isArray((llm as { records: LlmCallRecord[] }).records)) {
    return (llm as { records: LlmCallRecord[] }).records;
  }
  return [];
}

export async function runEvalCase(input: RunCaseInput): Promise<RunCaseOutput> {
  resetEvalShimState();
  const { projectPath, cleanup } = await copyFixture(input.fixturePath);

  if (input.setup) {
    await input.setup(projectPath);
  }

  const session = createSyntheticSession(crypto.randomUUID());
  const project = createSyntheticProject(projectPath);
  const runId = crypto.randomUUID();
  const started = Date.now();

  const ctx: AgentContext = {
    session,
    project,
    runId,
    runMode: input.mode === "explore" ? "explore" : "build",
    onProgress: async () => {},
    llm: input.llm,
  };

  let answer = "";
  let messages: LlmMessage[] = [];
  let error: string | undefined;

  try {
    if (input.mode === "loop") {
      warnAboutLoopModeDefaults(input);
      const tools = getToolsForRole(input.role ?? "build-main", ctx.runMode, {
        onProgress: async () => {},
      });
      const result = await runAgentLoop({
        systemPrompt: input.systemPrompt ?? "You are a coding agent.",
        messages: [{ role: "user", content: input.userMessage }],
        tools,
        maxIterations: input.maxIterations ?? 5,
        temperature: input.temperature ?? 0,
        ctx,
      });
      answer = result.content;
      messages = result.messages;
    } else if (input.mode === "explore") {
      const agentResult = await runExploreAgent({
        session,
        project,
        userMessage: input.userMessage,
        history: [],
        runId,
        runMode: "explore",
        onProgress: async () => {},
        llm: input.llm,
      });
      answer = agentResult.content;
      messages = agentResult.messages;
    } else {
      const agentResult = await runBuildAgent({
        session,
        project,
        userMessage: input.userMessage,
        history: [],
        runId,
        runMode: "build",
        onProgress: async () => {},
        llm: input.llm,
      });
      answer = agentResult.content;
      messages = agentResult.messages;
    }

    const llmRecords = collectLlmRecords(input.llm);
    const metrics = buildMetrics({
      durationMs: Date.now() - started,
      llmRecords,
      messages,
    });

    const evalContext: EvalContext = {
      projectPath,
      answer,
      messages,
      metrics,
      llmRecords,
    };

    const assertionResults = await runAssertions(input.assertions, evalContext);
    const passed = assertionResults.every((item) => item.passed);

    return {
      projectPath,
      cleanup,
      result: {
        caseId: input.caseId,
        passed,
        answer,
        messages,
        metrics,
        llmRecords,
        assertionResults,
      },
    };
  } catch (err) {
    const llmRecords = collectLlmRecords(input.llm);
    const metrics = buildMetrics({
      durationMs: Date.now() - started,
      llmRecords,
      messages,
    });
    error = err instanceof Error ? err.message : String(err);

    return {
      projectPath,
      cleanup,
      result: {
        caseId: input.caseId,
        passed: false,
        answer,
        messages,
        metrics,
        llmRecords,
        assertionResults: [],
        error,
      },
    };
  }
}

export async function runEvalCaseWithRepeats(
  input: RunCaseInput,
  repeats = 1,
): Promise<EvalCaseResult> {
  const attempts: EvalCaseResult[] = [];

  for (let index = 0; index < repeats; index += 1) {
    const { cleanup, result } = await runEvalCase({
      ...input,
      caseId: repeats > 1 ? `${input.caseId}#${index + 1}` : input.caseId,
    });
    attempts.push(result);
    await cleanup();
  }

  const passedCount = attempts.filter((item) => item.passed).length;
  const merged = attempts[attempts.length - 1]!;
  return {
    ...merged,
    caseId: input.caseId,
    passed: passedCount === repeats,
    assertionResults: [
      ...merged.assertionResults,
      {
        name: `passRate(${passedCount}/${repeats})`,
        passed: passedCount === repeats,
        message:
          passedCount === repeats
            ? undefined
            : `Only ${passedCount}/${repeats} attempts passed`,
      },
    ],
  };
}

export function fixturePath(name: string): string {
  return join(process.cwd(), "evals", "fixtures", name);
}
