import type {
  CodeProject,
  FileReadRequest,
  FileWriteRequest,
  ShellRunRequest,
  ShellRunResult,
  ToolRun,
} from "./agent.types";
import { invoke } from "@/core/platform/tauri";

export async function listCodeProjects(): Promise<CodeProject[]> {
  return invoke<CodeProject[]>("code_project_list");
}

export async function registerCodeProject(path: string): Promise<CodeProject> {
  return invoke<CodeProject>("code_project_register", { path });
}

export async function runShellCommand(
  request: ShellRunRequest,
): Promise<ShellRunResult> {
  return invoke<ShellRunResult>("shell_run", { request });
}

export async function readProjectFile(
  request: FileReadRequest,
): Promise<string> {
  return invoke<string>("project_read_file", { request });
}

export async function writeProjectFile(
  request: FileWriteRequest,
): Promise<ToolRun> {
  return invoke<ToolRun>("project_write_file", { request });
}

export async function listToolRuns(sessionId: string): Promise<ToolRun[]> {
  return invoke<ToolRun[]>("tool_run_list", { sessionId });
}
