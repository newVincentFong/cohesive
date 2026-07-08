import { z } from "zod";
import { runShellCommand } from "@/core/code/agent.service";
import type { AgentContext, ToolTrace } from "../agent.types";
import { defineTool } from "./define-tool";
import { BUDGET, truncateText } from "./output-budget";

const runCommandSchema = z.object({
  command: z.string().min(1).describe("Shell command to run in the project"),
  cwd: z
    .string()
    .optional()
    .describe("Optional working directory relative to project root"),
  timeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(600_000)
    .optional()
    .describe("Optional timeout in milliseconds (default 120000)"),
});

async function emitTrace(
  onTrace: ((trace: ToolTrace) => Promise<void>) | undefined,
  trace: ToolTrace,
): Promise<void> {
  if (onTrace) {
    await onTrace(trace);
  }
}

export function createRunCommandTool(onTrace?: (trace: ToolTrace) => Promise<void>) {
  return defineTool({
    name: "run_command",
    description:
      "Run a shell command in the project directory. Use for tests, lint, build, git status, etc.",
    schema: runCommandSchema,
    execute: async (args, ctx: AgentContext) => {
      try {
        const result = await runShellCommand({
          sessionId: ctx.session.id,
          projectPath: ctx.project.path,
          mode: ctx.runMode,
          command: args.command,
          cwd: args.cwd,
          timeoutMs: args.timeoutMs,
          runId: ctx.runId,
        });

        if (result.blockedReason) {
          await emitTrace(onTrace, {
            toolName: "run_command",
            content: `Blocked: ${result.blockedReason}`,
            toolPayload: JSON.stringify({ command: args.command, blockedReason: result.blockedReason }),
          });
          return `Error: ${result.blockedReason}`;
        }

        const { toolRun } = result;
        const stdout = toolRun.stdoutTail ?? "";
        const stderr = toolRun.stderrTail ?? "";
        const exitCode = toolRun.exitCode ?? -1;

        await emitTrace(onTrace, {
          toolName: "run_command",
          content: `$ ${args.command}\nexit=${exitCode}`,
          toolPayload: JSON.stringify({
            command: args.command,
            exitCode,
            status: toolRun.status,
          }),
        });

        const parts = [
          `exit code: ${exitCode}`,
          stdout ? `stdout:\n${truncateText(stdout, BUDGET.shellOutputMaxChars)}` : "",
          stderr ? `stderr:\n${truncateText(stderr, BUDGET.shellOutputMaxChars)}` : "",
        ].filter(Boolean);

        return parts.join("\n\n");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await emitTrace(onTrace, {
          toolName: "run_command",
          content: `Command failed: ${message}`,
          toolPayload: JSON.stringify({ command: args.command, error: message }),
        });
        return `Error running command: ${message}`;
      }
    },
  });
}
