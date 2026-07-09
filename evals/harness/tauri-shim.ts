import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { globSync } from "glob";
import type {
  EditFileRequest,
  FileReadRequest,
  FileWriteRequest,
  GlobRequest,
  GlobResult,
  SearchRequest,
  SearchResult,
  ShellRunRequest,
  ShellRunResult,
  ToolRun,
} from "@/core/code/agent.types";

const execFileAsync = promisify(execFile);

/** Tracks read_file calls per run for the read-before-edit guard. */
const readPathsByRun = new Map<string, Set<string>>();

function nowIso(): string {
  return new Date().toISOString();
}

function makeToolRun(
  request: { sessionId: string; runId?: string; messageId?: string },
  kind: ToolRun["kind"],
  extra: Partial<ToolRun> = {},
): ToolRun {
  return {
    id: crypto.randomUUID(),
    sessionId: request.sessionId,
    runId: request.runId,
    messageId: request.messageId,
    kind,
    status: "completed",
    requiresConfirmation: false,
    startedAt: nowIso(),
    finishedAt: nowIso(),
    ...extra,
  };
}

function resolveProjectPath(projectPath: string, relativePath: string): string {
  const normalized = normalize(relativePath).replace(/^(\.\/)+/, "");
  if (normalized.startsWith("..") || normalized.startsWith("/")) {
    throw new Error(`Path escapes project root: ${relativePath}`);
  }
  const absolute = resolve(projectPath, normalized);
  const root = resolve(projectPath);
  if (!absolute.startsWith(root)) {
    throw new Error(`Path escapes project root: ${relativePath}`);
  }
  return absolute;
}

function canReadFiles(mode: string): boolean {
  return mode === "plan" || mode === "explore" || mode === "build";
}

function canWriteFiles(mode: string): boolean {
  return mode === "build";
}

function canRunShell(mode: string): boolean {
  return mode === "explore" || mode === "build";
}

function canRunMutatingShell(mode: string): boolean {
  return mode === "build";
}

function isMutatingCommand(command: string): boolean {
  const lowered = command.toLowerCase();
  const keywords = [
    "rm ",
    "mv ",
    "cp ",
    "mkdir",
    "touch",
    "npm install",
    "pnpm install",
    "yarn install",
    "cargo add",
    "git commit",
    "git push",
    "git reset",
    "git checkout",
    "sed -i",
    "tee ",
    "chmod",
    "chown",
    "> ",
    " >>",
  ];
  return keywords.some((keyword) => lowered.includes(keyword));
}

function editFileContent(
  content: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
): string {
  if (!oldString) {
    throw new Error("oldString must not be empty");
  }
  const count = content.split(oldString).length - 1;
  if (count === 0) {
    throw new Error(
      "oldString not found in file. Make sure you read the file first and copy the exact text including whitespace.",
    );
  }
  if (!replaceAll && count > 1) {
    throw new Error(
      `oldString appears ${count} times in the file. Provide more surrounding context to make it unique, or set replaceAll to true.`,
    );
  }
  if (replaceAll) {
    return content.split(oldString).join(newString);
  }
  return content.replace(oldString, newString);
}

async function walkProjectFiles(projectPath: string): Promise<string[]> {
  const pattern = join(projectPath, "**/*").replace(/\\/g, "/");
  return globSync(pattern, {
    nodir: true,
    dot: false,
    ignore: ["**/node_modules/**", "**/.git/**"],
  }).map((file) => relative(projectPath, file).replace(/\\/g, "/"));
}

async function projectReadFile(request: FileReadRequest): Promise<string> {
  if (!canReadFiles(request.mode)) {
    throw new Error(`Read files is blocked in ${request.mode} mode`);
  }
  const path = resolveProjectPath(request.projectPath, request.relativePath);
  const content = await readFile(path, "utf8");

  if (request.runId) {
    const reads = readPathsByRun.get(request.runId) ?? new Set<string>();
    reads.add(request.relativePath);
    readPathsByRun.set(request.runId, reads);
  }

  return content;
}

async function projectWriteFile(request: FileWriteRequest): Promise<ToolRun> {
  if (!canWriteFiles(request.mode)) {
    throw new Error(`Write files is blocked in ${request.mode} mode`);
  }

  const path = resolveProjectPath(request.projectPath, request.relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, request.content, "utf8");

  return makeToolRun(request, "write_file", {
    cwd: request.projectPath,
    targetPath: request.relativePath,
    exitCode: 0,
    stdoutTail: `Wrote ${request.relativePath}`,
  });
}

async function projectSearch(request: SearchRequest): Promise<SearchResult> {
  if (!canReadFiles(request.mode)) {
    throw new Error(`Search is blocked in ${request.mode} mode`);
  }

  const maxResults = Math.min(request.maxResults ?? 100, 500);
  let regex: RegExp;
  try {
    regex = new RegExp(request.pattern, request.caseInsensitive ? "i" : undefined);
  } catch (err) {
    throw new Error(
      `Invalid regex pattern: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const files = await walkProjectFiles(request.projectPath);
  const matches: SearchResult["matches"] = [];
  let truncated = false;

  for (const relativePath of files) {
    if (request.includeGlob) {
      const globRegex = globPatternToRegExp(request.includeGlob);
      if (!globRegex.test(relativePath)) {
        continue;
      }
    }

    const absolute = resolve(request.projectPath, relativePath);
    let content: string;
    try {
      const fileStat = await stat(absolute);
      if (fileStat.size > 1_048_576) continue;
      content = await readFile(absolute, "utf8");
    } catch {
      continue;
    }
    if (content.includes("\0")) continue;

    const lines = content.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      if (matches.length >= maxResults) {
        truncated = true;
        break;
      }
      if (regex.test(lines[index]!)) {
        matches.push({
          relativePath,
          lineNumber: index + 1,
          lineContent: lines[index]!,
        });
      }
    }
    if (truncated) break;
  }

  return { matches, truncated };
}

function globPatternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "§§")
    .replace(/\*/g, "[^/]*")
    .replace(/§§/g, ".*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`^${escaped}$`);
}

async function projectGlob(request: GlobRequest): Promise<GlobResult> {
  if (!canReadFiles(request.mode)) {
    throw new Error(`Glob is blocked in ${request.mode} mode`);
  }

  const maxResults = request.maxResults ?? 200;
  const pattern = join(request.projectPath, request.pattern).replace(/\\/g, "/");
  const matched = globSync(pattern, {
    nodir: true,
    dot: false,
    ignore: ["**/node_modules/**", "**/.git/**"],
  });

  const withMtime = await Promise.all(
    matched.map(async (file) => {
      const fileStat = await stat(file);
      return {
        path: relative(request.projectPath, file).replace(/\\/g, "/"),
        mtime: fileStat.mtimeMs,
      };
    }),
  );

  withMtime.sort((left, right) => right.mtime - left.mtime);
  const paths = withMtime.slice(0, maxResults).map((item) => item.path);
  return {
    paths,
    truncated: withMtime.length > maxResults,
  };
}

async function projectEditFile(request: EditFileRequest): Promise<ToolRun> {
  if (!canWriteFiles(request.mode)) {
    throw new Error(`Edit files is blocked in ${request.mode} mode`);
  }

  const runId = request.runId;
  if (!runId) {
    throw new Error("runId is required for edit_file");
  }

  const reads = readPathsByRun.get(runId);
  if (!reads?.has(request.relativePath)) {
    throw new Error(
      `Must read ${request.relativePath} in this run before editing. Use read_file first.`,
    );
  }

  const path = resolveProjectPath(request.projectPath, request.relativePath);
  const content = await readFile(path, "utf8");
  const updated = editFileContent(
    content,
    request.oldString,
    request.newString,
    request.replaceAll ?? false,
  );
  await writeFile(path, updated, "utf8");

  return makeToolRun(request, "edit_file", {
    cwd: request.projectPath,
    targetPath: request.relativePath,
    exitCode: 0,
    stdoutTail: `Edited ${request.relativePath} (replaceAll=${request.replaceAll ?? false})`,
  });
}

async function shellRun(request: ShellRunRequest): Promise<ShellRunResult> {
  if (!canRunShell(request.mode)) {
    return {
      toolRun: makeToolRun(request, "shell", { status: "failed" }),
      blockedReason: `Shell is blocked in ${request.mode} mode`,
    };
  }

  if (isMutatingCommand(request.command) && !canRunMutatingShell(request.mode)) {
    return {
      toolRun: makeToolRun(request, "shell", { status: "failed" }),
      blockedReason: "Mutating shell commands are blocked in explore mode",
    };
  }

  const cwd = request.cwd
    ? resolveProjectPath(request.projectPath, request.cwd)
    : resolve(request.projectPath);

  const timeoutMs = request.timeoutMs ?? 120_000;
  const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
  const shellFlag = process.platform === "win32" ? "/c" : "-c";

  try {
    const { stdout, stderr } = await execFileAsync(shell, [shellFlag, request.command], {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    });

    return {
      toolRun: makeToolRun(request, "shell", {
        command: request.command,
        cwd,
        status: "completed",
        exitCode: 0,
        stdoutTail: stdout.slice(-8000),
        stderrTail: stderr.slice(-8000),
      }),
    };
  } catch (err) {
    const execErr = err as { code?: number; stdout?: string; stderr?: string; message?: string };
    return {
      toolRun: makeToolRun(request, "shell", {
        command: request.command,
        cwd,
        status: "failed",
        exitCode: typeof execErr.code === "number" ? execErr.code : 1,
        stdoutTail: execErr.stdout?.slice(-8000),
        stderrTail: execErr.stderr?.slice(-8000) ?? execErr.message,
      }),
    };
  }
}

export function formatInvokeError(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

export async function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    switch (command) {
      case "project_read_file":
        return (await projectReadFile(args!.request as FileReadRequest)) as T;
      case "project_write_file":
        return (await projectWriteFile(args!.request as FileWriteRequest)) as T;
      case "project_search":
        return (await projectSearch(args!.request as SearchRequest)) as T;
      case "project_glob":
        return (await projectGlob(args!.request as GlobRequest)) as T;
      case "project_edit_file":
        return (await projectEditFile(args!.request as EditFileRequest)) as T;
      case "shell_run":
        return (await shellRun(args!.request as ShellRunRequest)) as T;
      case "code_project_list":
      case "code_project_register":
      case "tool_run_list":
      case "trace_column_upsert":
      case "trace_message_upsert_batch":
      case "trace_get_by_run":
      case "trace_prune":
      case "llm_complete":
      case "llm_stream":
        return undefined as T;
      default:
        throw new Error(`Eval shim: unsupported command "${command}"`);
    }
  } catch (err) {
    throw new Error(formatInvokeError(err));
  }
}

export function isTauriRuntime(): boolean {
  return false;
}

export function isMacOSDesktop(): boolean {
  return process.platform === "darwin";
}

export function isMacFrameless(): boolean {
  return false;
}

/** Reset shim state between eval cases. */
export function resetEvalShimState(): void {
  readPathsByRun.clear();
}
