import type { CodeMode } from "../session/session.types";

export interface CodeProject {
  id: string;
  path: string;
  displayName: string;
  lastOpenedAt?: string;
  createdAt: string;
}

export interface ToolRun {
  id: string;
  sessionId: string;
  kind: "shell" | "read_file" | "write_file" | "list_dir";
  command?: string;
  cwd?: string;
  targetPath?: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  exitCode?: number;
  stdoutTail?: string;
  stderrTail?: string;
  requiresConfirmation: boolean;
  startedAt: string;
  finishedAt?: string;
}

export interface ShellRunRequest {
  sessionId: string;
  projectPath: string;
  mode: CodeMode;
  command: string;
  cwd?: string;
  confirmed?: boolean;
}

export interface ShellRunResult {
  toolRun: ToolRun;
  blockedReason?: string;
}

export interface FileReadRequest {
  sessionId: string;
  projectPath: string;
  mode: CodeMode;
  relativePath: string;
}

export interface FileWriteRequest {
  sessionId: string;
  projectPath: string;
  mode: CodeMode;
  relativePath: string;
  content: string;
  confirmed?: boolean;
}

export interface AgentPermissionMatrix {
  canReadFiles: boolean;
  canWriteFiles: boolean;
  canRunShell: boolean;
  canRunMutatingShell: boolean;
}

export function permissionsForMode(mode: CodeMode): AgentPermissionMatrix {
  switch (mode) {
    case "plan":
      return {
        canReadFiles: true,
        canWriteFiles: false,
        canRunShell: false,
        canRunMutatingShell: false,
      };
    case "explore":
      return {
        canReadFiles: true,
        canWriteFiles: false,
        canRunShell: true,
        canRunMutatingShell: false,
      };
    case "build":
      return {
        canReadFiles: true,
        canWriteFiles: true,
        canRunShell: true,
        canRunMutatingShell: true,
      };
  }
}
