import { z } from "zod";
import { readProjectFile } from "@/core/code/agent.service";
import type { AgentContext, ToolTrace } from "../agent.types";
import { defineTool } from "./define-tool";
import {
  addLineNumbers,
  BUDGET,
  countLines,
  summarizeForDisplay,
  truncateFileContent,
} from "./output-budget";

const readFileSchema = z.object({
  relativePath: z
    .string()
    .min(1)
    .describe("Path relative to the project root, e.g. src/App.tsx"),
  offset: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Optional 1-based line number to start reading from"),
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Optional maximum number of lines to read"),
});

export type ReadFileArgs = z.infer<typeof readFileSchema>;

async function emitTrace(
  onTrace: ((trace: ToolTrace) => Promise<void>) | undefined,
  trace: ToolTrace,
): Promise<void> {
  if (onTrace) {
    await onTrace(trace);
  }
}

export function createReadFileTool(onTrace?: (trace: ToolTrace) => Promise<void>) {
  return defineTool({
    name: "read_file",
    description:
      "Read a text file from the project by relative path. Output includes line numbers (LINE|content). Use offset/limit for large files.",
    schema: readFileSchema,
    execute: async (args, ctx: AgentContext) => {
      const relativePath = args.relativePath.trim();
      try {
        const rawContent = await readProjectFile({
          sessionId: ctx.session.id,
          projectPath: ctx.project.path,
          mode: ctx.runMode,
          relativePath,
          runId: ctx.runId,
        });

        const allLines = rawContent.split("\n");
        const startLine = args.offset ?? 1;
        const endLine =
          args.limit !== undefined ? startLine + args.limit - 1 : allLines.length;
        const sliceStart = Math.max(0, startLine - 1);
        const sliceEnd = Math.min(allLines.length, endLine);
        const selectedLines = allLines.slice(sliceStart, sliceEnd);
        const slicedContent = selectedLines.join("\n");
        const lineCount = countLines(rawContent);
        const displaySummary = summarizeForDisplay(rawContent, BUDGET.traceSummaryMaxLen);

        await emitTrace(onTrace, {
          toolName: "read_file",
          content: `Read ${relativePath} (${lineCount} lines)\nSummary: ${displaySummary}`,
          toolPayload: JSON.stringify({ relativePath, lineCount, offset: args.offset, limit: args.limit }),
        });

        const numbered = addLineNumbers(slicedContent, startLine);
        const header =
          args.offset !== undefined || args.limit !== undefined
            ? `[Showing lines ${startLine}-${sliceEnd} of ${lineCount}]\n`
            : "";
        return truncateFileContent(`${header}${numbered}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await emitTrace(onTrace, {
          toolName: "read_file",
          content: `Failed to read ${relativePath}: ${message}`,
          toolPayload: JSON.stringify({ relativePath, error: message }),
        });
        return `Error reading file: ${message}`;
      }
    },
  });
}
