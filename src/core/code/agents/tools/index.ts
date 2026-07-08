import type { CodeMode } from "@/core/session/session.types";
import { permissionsForMode } from "@/core/code/agent.types";
import type { AgentProgress, AgentTool, ToolTrace } from "../agent.types";
import type { AgentTraceCallbacks } from "../agent-trace.types";
import { createEditFileTool } from "./edit-file.tool";
import { createExploreCodebaseTool } from "./explore-codebase.tool";
import { createGlobTool } from "./glob.tool";
import { createGrepTool } from "./grep.tool";
import { createReadFileTool } from "./read-file.tool";
import { createRunCommandTool } from "./run-command.tool";
import { createWriteFileTool } from "./write-file.tool";

export type AgentRole = "explore-sub" | "explore-main" | "build-main";

export interface ToolRegistryHooks {
  onTrace?: (trace: ToolTrace) => Promise<void>;
  onProgress?: (update: AgentProgress) => Promise<void>;
  onTraceCallbacks?: AgentTraceCallbacks;
}

function traceHookForTool(
  toolName: string,
  hooks?: ToolRegistryHooks,
): ((trace: ToolTrace) => Promise<void>) | undefined {
  if (!hooks?.onTrace && !hooks?.onProgress) {
    return undefined;
  }

  return async (trace: ToolTrace) => {
    await hooks.onTrace?.(trace);
    const phase = toolPhaseForName(toolName);
    if (phase && hooks.onProgress) {
      await hooks.onProgress({ phase, toolTrace: trace });
    }
  };
}

function toolPhaseForName(toolName: string): AgentProgress["phase"] | undefined {
  switch (toolName) {
    case "read_file":
      return "reading";
    case "grep":
    case "glob":
      return "searching";
    case "edit_file":
    case "write_file":
      return "editing";
    case "run_command":
      return "running_command";
    default:
      return undefined;
  }
}

export function getToolsForRole(
  role: AgentRole,
  mode: CodeMode,
  hooks?: ToolRegistryHooks,
): AgentTool[] {
  const perms = permissionsForMode(mode);
  const tools: AgentTool[] = [];

  if (role === "explore-sub" || role === "build-main") {
    if (perms.canReadFiles) {
      tools.push(createReadFileTool(traceHookForTool("read_file", hooks)));
      tools.push(createGrepTool(traceHookForTool("grep", hooks)));
      tools.push(createGlobTool(traceHookForTool("glob", hooks)));
    }
  }

  if (role === "build-main") {
    if (perms.canWriteFiles) {
      tools.push(createEditFileTool(traceHookForTool("edit_file", hooks)));
      tools.push(createWriteFileTool(traceHookForTool("write_file", hooks)));
    }
    if (perms.canRunShell) {
      tools.push(createRunCommandTool(traceHookForTool("run_command", hooks)));
    }
    if (hooks?.onProgress) {
      tools.push(
        createExploreCodebaseTool({
          onProgress: hooks.onProgress,
          onTrace: hooks.onTraceCallbacks,
        }),
      );
    }
  }

  if (role === "explore-main") {
    if (hooks?.onProgress) {
      tools.push(
        createExploreCodebaseTool({
          onProgress: hooks.onProgress,
          onTrace: hooks.onTraceCallbacks,
        }),
      );
    }
  }

  return tools;
}
