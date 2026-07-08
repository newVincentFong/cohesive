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
  runId?: string;
  messageId?: string;
  kind: "shell" | "read_file" | "write_file" | "list_dir" | "search" | "glob" | "edit_file";
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
  runId?: string;
  messageId?: string;
  timeoutMs?: number;
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
  runId?: string;
  messageId?: string;
}

export interface FileWriteRequest {
  sessionId: string;
  projectPath: string;
  mode: CodeMode;
  relativePath: string;
  content: string;
  confirmed?: boolean;
  runId?: string;
  messageId?: string;
}

export interface SearchRequest {
  sessionId: string;
  projectPath: string;
  mode: CodeMode;
  pattern: string;
  includeGlob?: string;
  caseInsensitive?: boolean;
  maxResults?: number;
  runId?: string;
  messageId?: string;
}

export interface SearchMatch {
  relativePath: string;
  lineNumber: number;
  lineContent: string;
}

export interface SearchResult {
  matches: SearchMatch[];
  truncated: boolean;
}

export interface GlobRequest {
  sessionId: string;
  projectPath: string;
  mode: CodeMode;
  pattern: string;
  maxResults?: number;
  runId?: string;
  messageId?: string;
}

export interface GlobResult {
  paths: string[];
  truncated: boolean;
}

export interface EditFileRequest {
  sessionId: string;
  projectPath: string;
  mode: CodeMode;
  relativePath: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
  confirmed?: boolean;
  runId?: string;
  messageId?: string;
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
