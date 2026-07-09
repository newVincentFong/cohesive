#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";

interface TraceColumnRow {
  id: string;
  run_id: string;
  session_id: string;
  kind: string;
  label: string;
  status: string;
  parent_column_id: string | null;
  tools_json: string | null;
  started_at: string;
  ended_at: string | null;
}

interface TraceMessageRow {
  id: string;
  run_id: string;
  column_id: string;
  iteration: number;
  idx: number;
  role: string;
  content: string | null;
  tool_calls_json: string | null;
  tool_call_id: string | null;
  created_at: string;
  updated_at: string | null;
}

interface AgentRunRow {
  id: string;
  mode: string;
  status: string;
  user_message_id: string;
  permission_snapshot_json: string | null;
  created_at: string;
  finished_at: string | null;
}

interface ExportedTraceCase {
  version: 1;
  exportedAt: string;
  runId: string;
  mode: string;
  status: string;
  columns: TraceColumnRow[];
  messages: TraceMessageRow[];
  mainColumnMessages: TraceMessageRow[];
  replayHint: string;
}

function defaultDbPath(): string {
  return join(homedir(), "Library", "Application Support", "com.vincentfong.cohesive", "cohesive.db");
}

async function main(): Promise<void> {
  const runId = process.argv[2];
  if (!runId) {
    console.error("Usage: npm run eval:export -- <agent-run-id> [output-path] [db-path]");
    process.exit(1);
  }

  const outputPath =
    process.argv[3] ?? join(process.cwd(), "evals", "cases", "exported", `${runId}.trace.json`);
  const dbPath = process.argv[4] ?? defaultDbPath();

  const db = new Database(dbPath, { readonly: true });

  const run = db
    .prepare(
      "SELECT id, mode, status, user_message_id, permission_snapshot_json, created_at, finished_at FROM agent_runs WHERE id = ?",
    )
    .get(runId) as AgentRunRow | undefined;

  if (!run) {
    console.error(`Agent run not found: ${runId}`);
    process.exit(1);
  }

  const columns = db
    .prepare("SELECT * FROM trace_columns WHERE run_id = ? ORDER BY started_at ASC")
    .all(runId) as TraceColumnRow[];

  const messages = db
    .prepare("SELECT * FROM trace_messages WHERE run_id = ? ORDER BY idx ASC")
    .all(runId) as TraceMessageRow[];

  const mainColumn = columns.find((column) => column.kind === "main") ?? columns[0];
  const mainColumnMessages = mainColumn
    ? messages.filter((message) => message.column_id === mainColumn.id)
    : [];

  const exported: ExportedTraceCase = {
    version: 1,
    exportedAt: new Date().toISOString(),
    runId: run.id,
    mode: run.mode,
    status: run.status,
    columns,
    messages,
    mainColumnMessages,
    replayHint:
      "Use mainColumnMessages as frozen-prompt artifacts. Wire ScriptedLlmProvider steps from assistant/tool_calls_json sequences for unit replay.",
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(exported, null, 2), "utf8");
  console.log(`Exported trace case to ${outputPath}`);
  console.log(`  columns: ${columns.length}`);
  console.log(`  messages: ${messages.length}`);
  console.log(`  main column messages: ${mainColumnMessages.length}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
