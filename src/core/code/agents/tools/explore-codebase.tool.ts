import { z } from "zod";
import { permissionsForMode } from "@/core/code/agent.types";
import type { CodeMode } from "@/core/session/session.types";
import { agentToolsToLlmDefinitions } from "../agent-loop";
import { runExploreSubAgent } from "../explore-subagent";
import type {
  AgentContext,
  AgentProgress,
  AgentTool,
  ExploreTask,
  ToolTrace,
} from "../agent.types";
import type { AgentTraceCallbacks } from "../agent-trace.types";
import { defineTool } from "./define-tool";
import { createGlobTool } from "./glob.tool";
import { createGrepTool } from "./grep.tool";
import { createReadFileTool } from "./read-file.tool";

function getExploreSubToolDefinitions(mode: CodeMode) {
  const perms = permissionsForMode(mode);
  if (!perms.canReadFiles) {
    return [];
  }
  return agentToolsToLlmDefinitions([
    createReadFileTool(),
    createGrepTool(),
    createGlobTool(),
  ]);
}

const exploreCodebaseSchema = z.object({
  task: z
    .string()
    .min(1)
    .describe("What to investigate, e.g. 'How session CRUD is implemented'"),
  startingPaths: z
    .array(z.string())
    .optional()
    .describe("Optional relative file paths to start reading from"),
});

export function createExploreCodebaseTool(input: {
  onProgress: (update: AgentProgress) => Promise<void>;
  onTrace?: AgentTraceCallbacks;
}): AgentTool {
  return defineTool({
    name: "explore_codebase",
    description:
      "Delegate a focused read-only exploration task to a sub-agent. Returns a structured summary of findings.",
    schema: exploreCodebaseSchema,
    execute: async (args, agentCtx: AgentContext) => {
      const task: ExploreTask = {
        task: args.task,
        startingPaths: args.startingPaths,
      };
      const pathsHint =
        task.startingPaths && task.startingPaths.length > 0
          ? `\nPaths: ${task.startingPaths.join(", ")}`
          : "";

      await input.onProgress({
        phase: "delegating",
        toolTrace: {
          toolName: "explore_codebase",
          content: `Exploring: ${task.task}${pathsHint}`,
          toolPayload: JSON.stringify(task),
        },
      });

      const subId = crypto.randomUUID();
      input.onTrace?.onColumnStart({
        id: subId,
        kind: "sub",
        label: task.task,
        tools: getExploreSubToolDefinitions(agentCtx.runMode),
      });

      try {
        const summary = await runExploreSubAgent({
          task,
          ctx: agentCtx,
          onRead: async (trace: ToolTrace) => {
            await input.onProgress({ phase: "reading", toolTrace: trace });
          },
          onSearch: async (trace: ToolTrace) => {
            await input.onProgress({ phase: "searching", toolTrace: trace });
          },
          onLoopMessage: input.onTrace
            ? async (event) => {
                input.onTrace?.onColumnMessage(subId, {
                  id: event.messageId,
                  iteration: event.iteration,
                  index: event.index,
                  role: event.message.role,
                  content: event.message.content,
                  toolCalls: event.message.toolCalls,
                  toolCallId: event.message.toolCallId,
                  timestamp: Date.now(),
                });
              }
            : undefined,
          onLoopMessageUpdate: input.onTrace
            ? async (event) => {
                input.onTrace?.onColumnMessageUpdate(subId, event.messageId, {
                  content: event.message.content,
                  toolCalls: event.message.toolCalls,
                });
              }
            : undefined,
        });

        input.onTrace?.onColumnEnd(subId, "done");

        await input.onProgress({
          phase: "explore_result",
          toolTrace: {
            toolName: "explore_codebase_result",
            content: summary,
            toolPayload: JSON.stringify({ task: task.task }),
          },
        });

        return summary;
      } catch (err) {
        input.onTrace?.onColumnEnd(subId, "error");
        throw err;
      }
    },
  });
}
