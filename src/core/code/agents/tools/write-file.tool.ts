import { z } from "zod";
import { writeProjectFile } from "@/core/code/agent.service";
import type { AgentContext, ToolTrace } from "../agent.types";
import { defineTool } from "./define-tool";
import { summarizeForDisplay } from "./output-budget";

const writeFileSchema = z.object({
  relativePath: z
    .string()
    .min(1)
    .describe("Path relative to the project root"),
  content: z.string().describe("Full file content to write"),
});

async function emitTrace(
  onTrace: ((trace: ToolTrace) => Promise<void>) | undefined,
  trace: ToolTrace,
): Promise<void> {
  if (onTrace) {
    await onTrace(trace);
  }
}

export function createWriteFileTool(onTrace?: (trace: ToolTrace) => Promise<void>) {
  return defineTool({
    name: "write_file",
    description:
      "Create or overwrite a file with the given content. Prefer edit_file for partial changes to existing files.",
    schema: writeFileSchema,
    execute: async (args, ctx: AgentContext) => {
      const relativePath = args.relativePath.trim();
      try {
        const toolRun = await writeProjectFile({
          sessionId: ctx.session.id,
          projectPath: ctx.project.path,
          mode: ctx.runMode,
          relativePath,
          content: args.content,
          runId: ctx.runId,
        });

        if (toolRun.status === "pending" && toolRun.requiresConfirmation) {
          const message = `Write to ${relativePath} requires user confirmation before it can be applied.`;
          await emitTrace(onTrace, {
            toolName: "write_file",
            content: message,
            toolPayload: JSON.stringify({ relativePath, status: toolRun.status }),
          });
          return `Error: ${message}`;
        }

        await emitTrace(onTrace, {
          toolName: "write_file",
          content: `Wrote ${relativePath}\nSummary: ${summarizeForDisplay(args.content)}`,
          toolPayload: JSON.stringify({ relativePath, status: toolRun.status }),
        });

        return `Successfully wrote ${relativePath}.`;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await emitTrace(onTrace, {
          toolName: "write_file",
          content: `Failed to write ${relativePath}: ${message}`,
          toolPayload: JSON.stringify({ relativePath, error: message }),
        });
        return `Error writing file: ${message}`;
      }
    },
  });
}
