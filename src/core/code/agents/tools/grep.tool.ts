import { z } from "zod";
import { searchProject } from "@/core/code/agent.service";
import type { AgentContext, ToolTrace } from "../agent.types";
import { defineTool } from "./define-tool";
import { BUDGET } from "./output-budget";

const grepSchema = z.object({
  pattern: z.string().min(1).describe("Regex pattern to search for in file contents"),
  includeGlob: z
    .string()
    .optional()
    .describe("Optional glob to limit which files are searched, e.g. **/*.ts"),
  caseInsensitive: z
    .boolean()
    .optional()
    .describe("Whether to match case-insensitively"),
});

async function emitTrace(
  onTrace: ((trace: ToolTrace) => Promise<void>) | undefined,
  trace: ToolTrace,
): Promise<void> {
  if (onTrace) {
    await onTrace(trace);
  }
}

export function createGrepTool(onTrace?: (trace: ToolTrace) => Promise<void>) {
  return defineTool({
    name: "grep",
    description:
      "Search file contents in the project using a regex pattern. Returns matches as file:line: content.",
    schema: grepSchema,
    execute: async (args, ctx: AgentContext) => {
      try {
        const result = await searchProject({
          sessionId: ctx.session.id,
          projectPath: ctx.project.path,
          mode: ctx.runMode,
          pattern: args.pattern,
          includeGlob: args.includeGlob,
          caseInsensitive: args.caseInsensitive,
          maxResults: BUDGET.grepMaxResults,
          runId: ctx.runId,
        });

        const lines = result.matches.map(
          (match) => `${match.relativePath}:${match.lineNumber}: ${match.lineContent}`,
        );
        const truncatedNote = result.truncated
          ? `\n... [truncated; more than ${BUDGET.grepMaxResults} matches] ...`
          : "";

        await emitTrace(onTrace, {
          toolName: "grep",
          content: `grep "${args.pattern}" → ${result.matches.length} matches${result.truncated ? "+" : ""}`,
          toolPayload: JSON.stringify({
            pattern: args.pattern,
            includeGlob: args.includeGlob,
            matchCount: result.matches.length,
            truncated: result.truncated,
          }),
        });

        if (lines.length === 0) {
          return "No matches found.";
        }
        return `${lines.join("\n")}${truncatedNote}`;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await emitTrace(onTrace, {
          toolName: "grep",
          content: `grep failed: ${message}`,
          toolPayload: JSON.stringify({ pattern: args.pattern, error: message }),
        });
        return `Error searching project: ${message}`;
      }
    },
  });
}
