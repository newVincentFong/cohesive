import { z } from "zod";
import { editProjectFile } from "@/core/code/agent.service";
import type { AgentContext, ToolTrace } from "../agent.types";
import { defineTool } from "./define-tool";

const editFileSchema = z.object({
  relativePath: z
    .string()
    .min(1)
    .describe("Path relative to the project root"),
  oldString: z
    .string()
    .min(1)
    .describe("Exact text to replace. Must appear exactly once unless replaceAll is true."),
  newString: z.string().describe("Replacement text"),
  replaceAll: z
    .boolean()
    .optional()
    .describe("Replace all occurrences instead of requiring a unique match"),
});

async function emitTrace(
  onTrace: ((trace: ToolTrace) => Promise<void>) | undefined,
  trace: ToolTrace,
): Promise<void> {
  if (onTrace) {
    await onTrace(trace);
  }
}

export function createEditFileTool(onTrace?: (trace: ToolTrace) => Promise<void>) {
  return defineTool({
    name: "edit_file",
    description:
      "Edit a file by replacing oldString with newString. You must read_file the same path in this run first. oldString must be unique unless replaceAll is true.",
    schema: editFileSchema,
    execute: async (args, ctx: AgentContext) => {
      const relativePath = args.relativePath.trim();
      try {
        const toolRun = await editProjectFile({
          sessionId: ctx.session.id,
          projectPath: ctx.project.path,
          mode: ctx.runMode,
          relativePath,
          oldString: args.oldString,
          newString: args.newString,
          replaceAll: args.replaceAll,
          runId: ctx.runId,
        });

        if (toolRun.status === "pending" && toolRun.requiresConfirmation) {
          const message = `Edit to ${relativePath} requires user confirmation before it can be applied.`;
          await emitTrace(onTrace, {
            toolName: "edit_file",
            content: message,
            toolPayload: JSON.stringify({ relativePath, status: toolRun.status }),
          });
          return `Error: ${message}`;
        }

        await emitTrace(onTrace, {
          toolName: "edit_file",
          content: `Edited ${relativePath}`,
          toolPayload: JSON.stringify({
            relativePath,
            replaceAll: args.replaceAll ?? false,
            status: toolRun.status,
          }),
        });

        return `Successfully edited ${relativePath}.`;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await emitTrace(onTrace, {
          toolName: "edit_file",
          content: `Failed to edit ${relativePath}: ${message}`,
          toolPayload: JSON.stringify({ relativePath, error: message }),
        });
        return `Error editing file: ${message}`;
      }
    },
  });
}
