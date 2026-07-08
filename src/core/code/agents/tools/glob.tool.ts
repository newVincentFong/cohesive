import { z } from "zod";
import { globProject } from "@/core/code/agent.service";
import type { AgentContext, ToolTrace } from "../agent.types";
import { defineTool } from "./define-tool";
import { BUDGET } from "./output-budget";

const globSchema = z.object({
  pattern: z
    .string()
    .min(1)
    .describe("Glob pattern for file paths, e.g. src/**/*.tsx"),
});

async function emitTrace(
  onTrace: ((trace: ToolTrace) => Promise<void>) | undefined,
  trace: ToolTrace,
): Promise<void> {
  if (onTrace) {
    await onTrace(trace);
  }
}

export function createGlobTool(onTrace?: (trace: ToolTrace) => Promise<void>) {
  return defineTool({
    name: "glob",
    description:
      "Find files by glob pattern. Returns relative paths sorted by modification time (newest first).",
    schema: globSchema,
    execute: async (args, ctx: AgentContext) => {
      try {
        const result = await globProject({
          sessionId: ctx.session.id,
          projectPath: ctx.project.path,
          mode: ctx.runMode,
          pattern: args.pattern,
          maxResults: BUDGET.globMaxResults,
          runId: ctx.runId,
        });

        const truncatedNote = result.truncated
          ? `\n... [truncated; more than ${BUDGET.globMaxResults} paths] ...`
          : "";

        await emitTrace(onTrace, {
          toolName: "glob",
          content: `glob "${args.pattern}" → ${result.paths.length} paths${result.truncated ? "+" : ""}`,
          toolPayload: JSON.stringify({
            pattern: args.pattern,
            pathCount: result.paths.length,
            truncated: result.truncated,
          }),
        });

        if (result.paths.length === 0) {
          return "No files matched.";
        }
        return `${result.paths.join("\n")}${truncatedNote}`;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await emitTrace(onTrace, {
          toolName: "glob",
          content: `glob failed: ${message}`,
          toolPayload: JSON.stringify({ pattern: args.pattern, error: message }),
        });
        return `Error listing files: ${message}`;
      }
    },
  });
}
