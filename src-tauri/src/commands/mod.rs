use std::path::{Component, PathBuf};

use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::db::{now_iso, parse_metadata, with_db, AppState};
use crate::models::{
    AddMemoryInput, AgentRun, CodeProject, CreateAgentRunInput, CreateMessageInput,
    CreateSessionInput, CreateWritingDocumentInput, EditFileRequest, FileReadRequest,
    FileWriteRequest, GlobRequest, GlobResult, MemoryItem, MemoryQuery, MemoryScope, Message,
    SearchRequest, SearchResult, Session, ShellRunRequest, ShellRunResult, ToolRun, TraceColumn,
    TraceMessage, TraceRun, UpdateAgentRunInput, UpdateMemoryInput, UpdateSessionInput,
    UpsertTraceColumnInput, UpsertTraceMessageInput, WritingDocument,
};
use crate::shell::runner;

const SESSION_TITLE_MAX_LENGTH: usize = 32;

fn memory_scope_for_domain(domain: &str) -> String {
    format!("memory:{domain}")
}

fn derive_session_title(first_user_message: &str) -> String {
    let trimmed = first_user_message.trim();
    if trimmed.is_empty() {
        return "Untitled session".to_string();
    }
    if trimmed.chars().count() <= SESSION_TITLE_MAX_LENGTH {
        return trimmed.to_string();
    }
    let truncated: String = trimmed.chars().take(SESSION_TITLE_MAX_LENGTH).collect();
    format!("{truncated}…")
}

const SESSION_SELECT: &str = "SELECT id, domain, title, status, default_mode, current_leaf_message_id, project_id, document_id, memory_scope_id, summary, created_at, updated_at, last_opened_at FROM sessions";
const MESSAGE_SELECT: &str = "SELECT id, session_id, parent_message_id, agent_run_id, role, content, tool_name, tool_payload, created_at FROM messages";
const AGENT_RUN_SELECT: &str = "SELECT id, session_id, parent_message_id, user_message_id, assistant_message_id, mode, status, toolset_snapshot_json, permission_snapshot_json, created_at, finished_at FROM agent_runs";
const TOOL_RUN_SELECT: &str = "SELECT id, session_id, run_id, message_id, kind, command, cwd, target_path, status, exit_code, stdout_tail, stderr_tail, requires_confirmation, started_at, finished_at FROM tool_runs";

fn map_session(row: &rusqlite::Row<'_>) -> rusqlite::Result<Session> {
    Ok(Session {
        id: row.get(0)?,
        domain: row.get(1)?,
        title: row.get(2)?,
        status: row.get(3)?,
        default_mode: row.get(4)?,
        current_leaf_message_id: row.get(5)?,
        project_id: row.get(6)?,
        document_id: row.get(7)?,
        memory_scope_id: row.get(8)?,
        summary: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        last_opened_at: row.get(12)?,
    })
}

fn map_message(row: &rusqlite::Row<'_>) -> rusqlite::Result<Message> {
    Ok(Message {
        id: row.get(0)?,
        session_id: row.get(1)?,
        parent_message_id: row.get(2)?,
        agent_run_id: row.get(3)?,
        role: row.get(4)?,
        content: row.get(5)?,
        tool_name: row.get(6)?,
        tool_payload: row.get(7)?,
        created_at: row.get(8)?,
    })
}

fn map_agent_run(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentRun> {
    Ok(AgentRun {
        id: row.get(0)?,
        session_id: row.get(1)?,
        parent_message_id: row.get(2)?,
        user_message_id: row.get(3)?,
        assistant_message_id: row.get(4)?,
        mode: row.get(5)?,
        status: row.get(6)?,
        toolset_snapshot_json: row.get(7)?,
        permission_snapshot_json: row.get(8)?,
        created_at: row.get(9)?,
        finished_at: row.get(10)?,
    })
}

fn map_memory(row: &rusqlite::Row<'_>) -> rusqlite::Result<MemoryItem> {
    Ok(MemoryItem {
        id: row.get(0)?,
        domain: row.get(1)?,
        layer: row.get(2)?,
        session_id: row.get(3)?,
        content: row.get(4)?,
        metadata: parse_metadata(row.get(5)?),
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn map_tool_run(row: &rusqlite::Row<'_>) -> rusqlite::Result<ToolRun> {
    Ok(ToolRun {
        id: row.get(0)?,
        session_id: row.get(1)?,
        run_id: row.get(2)?,
        message_id: row.get(3)?,
        kind: row.get(4)?,
        command: row.get(5)?,
        cwd: row.get(6)?,
        target_path: row.get(7)?,
        status: row.get(8)?,
        exit_code: row.get(9)?,
        stdout_tail: row.get(10)?,
        stderr_tail: row.get(11)?,
        requires_confirmation: row.get::<_, i64>(12)? != 0,
        started_at: row.get(13)?,
        finished_at: row.get(14)?,
    })
}

fn map_writing_document(row: &rusqlite::Row<'_>) -> rusqlite::Result<WritingDocument> {
    Ok(WritingDocument {
        id: row.get(0)?,
        title: row.get(1)?,
        file_path: row.get(2)?,
        status: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn fetch_session(db: &Connection, id: &str) -> Result<Session, String> {
    db.query_row(
        &format!("{SESSION_SELECT} WHERE id = ?1"),
        params![id],
        map_session,
    )
    .map_err(|err| err.to_string())
}

fn fetch_agent_run(db: &Connection, id: &str) -> Result<AgentRun, String> {
    db.query_row(
        &format!("{AGENT_RUN_SELECT} WHERE id = ?1"),
        params![id],
        map_agent_run,
    )
    .map_err(|err| err.to_string())
}

fn fetch_writing_document(db: &Connection, id: &str) -> Result<Option<WritingDocument>, String> {
    let result = db.query_row(
        "SELECT id, title, file_path, status, created_at, updated_at FROM writing_documents WHERE id = ?1",
        params![id],
        map_writing_document,
    );
    match result {
        Ok(document) => Ok(Some(document)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
pub fn session_create(
    state: tauri::State<'_, AppState>,
    input: CreateSessionInput,
) -> Result<Session, String> {
    let id = Uuid::new_v4().to_string();
    let now = now_iso();
    let title = input.title.unwrap_or_else(|| "Untitled session".to_string());
    let memory_scope_id = memory_scope_for_domain(&input.domain);

    with_db(&state, |db| {
        db.execute(
            "INSERT INTO sessions (id, domain, title, status, default_mode, project_id, document_id, memory_scope_id, created_at, updated_at, last_opened_at)
             VALUES (?1, ?2, ?3, 'active', ?4, ?5, ?6, ?7, ?8, ?9, ?8)",
            params![
                id,
                input.domain,
                title,
                input.default_mode,
                input.project_id,
                input.document_id,
                memory_scope_id,
                now,
                now
            ],
        )
        .map_err(|err| err.to_string())?;
        fetch_session(db, &id)
    })
}

#[tauri::command]
pub fn session_list(state: tauri::State<'_, AppState>, domain: String) -> Result<Vec<Session>, String> {
    with_db(&state, |db| {
        let mut stmt = db
            .prepare(
                &format!("{SESSION_SELECT} WHERE domain = ?1 AND status != 'deleted' ORDER BY COALESCE(last_opened_at, updated_at) DESC"),
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(params![domain], map_session)
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())
    })
}

#[tauri::command]
pub fn session_get(state: tauri::State<'_, AppState>, id: String) -> Result<Session, String> {
    with_db(&state, |db| fetch_session(db, &id))
}

#[tauri::command]
pub fn session_update(
    state: tauri::State<'_, AppState>,
    id: String,
    patch: UpdateSessionInput,
) -> Result<Session, String> {
    let now = now_iso();
    with_db(&state, |db| {
        let current = fetch_session(db, &id)?;
        db.execute(
            "UPDATE sessions SET title = ?1, status = ?2, default_mode = ?3, current_leaf_message_id = ?4, project_id = ?5, document_id = ?6, summary = ?7, updated_at = ?8 WHERE id = ?9",
            params![
                patch.title.unwrap_or(current.title),
                patch.status.unwrap_or(current.status),
                patch.default_mode.or(current.default_mode),
                patch
                    .current_leaf_message_id
                    .or(current.current_leaf_message_id),
                patch.project_id.or(current.project_id),
                patch.document_id.or(current.document_id),
                patch.summary.or(current.summary),
                now,
                id
            ],
        )
        .map_err(|err| err.to_string())?;
        fetch_session(db, &id)
    })
}

#[tauri::command]
pub fn session_touch(state: tauri::State<'_, AppState>, id: String) -> Result<Session, String> {
    let now = now_iso();
    with_db(&state, |db| {
        // Only record last open; keep updated_at for content/metadata changes.
        db.execute(
            "UPDATE sessions SET last_opened_at = ?1 WHERE id = ?2",
            params![now, id],
        )
        .map_err(|err| err.to_string())?;
        fetch_session(db, &id)
    })
}

#[tauri::command]
pub fn session_delete(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    with_db(&state, |db| {
        db.execute(
            "UPDATE sessions SET status = 'deleted', updated_at = ?1 WHERE id = ?2",
            params![now_iso(), id],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    })
}

#[tauri::command]
pub fn message_create(
    state: tauri::State<'_, AppState>,
    input: CreateMessageInput,
) -> Result<Message, String> {
    let id = Uuid::new_v4().to_string();
    let now = now_iso();
    with_db(&state, |db| {
        db.execute(
            "INSERT INTO messages (id, session_id, parent_message_id, agent_run_id, role, content, tool_name, tool_payload, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                id,
                input.session_id,
                input.parent_message_id,
                input.agent_run_id,
                input.role,
                input.content,
                input.tool_name,
                input.tool_payload,
                now
            ],
        )
        .map_err(|err| err.to_string())?;

        db.execute(
            "UPDATE sessions SET current_leaf_message_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![id, now, input.session_id],
        )
        .map_err(|err| err.to_string())?;

        db.query_row(
            &format!("{MESSAGE_SELECT} WHERE id = ?1"),
            params![id],
            map_message,
        )
        .map_err(|err| err.to_string())
    })
}

#[tauri::command]
pub fn message_list(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<Vec<Message>, String> {
    with_db(&state, |db| {
        let mut stmt = db
            .prepare(
                &format!("{MESSAGE_SELECT} WHERE session_id = ?1 ORDER BY created_at ASC"),
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(params![session_id], map_message)
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())
    })
}

#[tauri::command]
pub fn message_list_path(
    state: tauri::State<'_, AppState>,
    session_id: String,
    leaf_message_id: Option<String>,
) -> Result<Vec<Message>, String> {
    with_db(&state, |db| {
        let leaf_id = match leaf_message_id {
            Some(id) => id,
            None => {
                let session = fetch_session(db, &session_id)?;
                match session.current_leaf_message_id {
                    Some(id) => id,
                    None => return Ok(Vec::new()),
                }
            }
        };

        let mut stmt = db
            .prepare(
                "WITH RECURSIVE path AS (
                    SELECT id, session_id, parent_message_id, agent_run_id, role, content, tool_name, tool_payload, created_at
                    FROM messages
                    WHERE id = ?1
                    UNION ALL
                    SELECT m.id, m.session_id, m.parent_message_id, m.agent_run_id, m.role, m.content, m.tool_name, m.tool_payload, m.created_at
                    FROM messages m
                    JOIN path p ON m.id = p.parent_message_id
                )
                SELECT id, session_id, parent_message_id, agent_run_id, role, content, tool_name, tool_payload, created_at
                FROM path
                ORDER BY created_at ASC",
            )
            .map_err(|err| err.to_string())?;

        let rows = stmt
            .query_map(params![leaf_id], map_message)
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())
    })
}

#[tauri::command]
pub fn message_list_children(
    state: tauri::State<'_, AppState>,
    parent_message_id: String,
) -> Result<Vec<Message>, String> {
    with_db(&state, |db| {
        let mut stmt = db
            .prepare(
                &format!("{MESSAGE_SELECT} WHERE parent_message_id = ?1 ORDER BY created_at ASC"),
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(params![parent_message_id], map_message)
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())
    })
}

#[tauri::command]
pub fn agent_run_create(
    state: tauri::State<'_, AppState>,
    input: CreateAgentRunInput,
) -> Result<AgentRun, String> {
    let id = Uuid::new_v4().to_string();
    let now = now_iso();
    with_db(&state, |db| {
        db.execute(
            "INSERT INTO agent_runs (id, session_id, parent_message_id, user_message_id, mode, status, toolset_snapshot_json, permission_snapshot_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 'running', ?6, ?7, ?8)",
            params![
                id,
                input.session_id,
                input.parent_message_id,
                input.user_message_id,
                input.mode,
                input.toolset_snapshot_json,
                input.permission_snapshot_json,
                now
            ],
        )
        .map_err(|err| err.to_string())?;
        fetch_agent_run(db, &id)
    })
}

#[tauri::command]
pub fn agent_run_update(
    state: tauri::State<'_, AppState>,
    id: String,
    patch: UpdateAgentRunInput,
) -> Result<AgentRun, String> {
    with_db(&state, |db| {
        let current = fetch_agent_run(db, &id)?;
        let finished_at = patch
            .finished_at
            .or(current.finished_at)
            .or_else(|| {
                if patch.status.as_deref() == Some("done") || patch.status.as_deref() == Some("error")
                {
                    Some(now_iso())
                } else {
                    None
                }
            });

        db.execute(
            "UPDATE agent_runs SET assistant_message_id = ?1, status = ?2, finished_at = ?3 WHERE id = ?4",
            params![
                patch.assistant_message_id.or(current.assistant_message_id),
                patch.status.unwrap_or(current.status),
                finished_at,
                id
            ],
        )
        .map_err(|err| err.to_string())?;
        fetch_agent_run(db, &id)
    })
}

#[tauri::command]
pub fn agent_run_get(state: tauri::State<'_, AppState>, id: String) -> Result<AgentRun, String> {
    with_db(&state, |db| fetch_agent_run(db, &id))
}

#[tauri::command]
pub fn agent_run_list(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<Vec<AgentRun>, String> {
    with_db(&state, |db| {
        let mut stmt = db
            .prepare(
                &format!("{AGENT_RUN_SELECT} WHERE session_id = ?1 ORDER BY created_at ASC"),
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(params![session_id], map_agent_run)
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())
    })
}

const TRACE_COLUMN_SELECT: &str = "SELECT id, run_id, session_id, kind, label, status, parent_column_id, tools_json, started_at, ended_at FROM trace_columns";
const TRACE_MESSAGE_SELECT: &str = "SELECT id, run_id, column_id, iteration, idx, role, content, tool_calls_json, tool_call_id, created_at, updated_at FROM trace_messages";

fn map_trace_column(row: &rusqlite::Row<'_>) -> rusqlite::Result<TraceColumn> {
    Ok(TraceColumn {
        id: row.get(0)?,
        run_id: row.get(1)?,
        session_id: row.get(2)?,
        kind: row.get(3)?,
        label: row.get(4)?,
        status: row.get(5)?,
        parent_column_id: row.get(6)?,
        tools_json: row.get(7)?,
        started_at: row.get(8)?,
        ended_at: row.get(9)?,
    })
}

fn map_trace_message(row: &rusqlite::Row<'_>) -> rusqlite::Result<TraceMessage> {
    Ok(TraceMessage {
        id: row.get(0)?,
        run_id: row.get(1)?,
        column_id: row.get(2)?,
        iteration: row.get(3)?,
        idx: row.get(4)?,
        role: row.get(5)?,
        content: row.get(6)?,
        tool_calls_json: row.get(7)?,
        tool_call_id: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

#[tauri::command]
pub fn trace_column_upsert(
    state: tauri::State<'_, AppState>,
    input: UpsertTraceColumnInput,
) -> Result<(), String> {
    with_db(&state, |db| {
        db.execute(
            "INSERT INTO trace_columns (run_id, id, session_id, kind, label, status, parent_column_id, tools_json, started_at, ended_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(run_id, id) DO UPDATE SET
               status = excluded.status,
               ended_at = COALESCE(excluded.ended_at, trace_columns.ended_at)",
            params![
                input.run_id,
                input.id,
                input.session_id,
                input.kind,
                input.label,
                input.status,
                input.parent_column_id,
                input.tools_json,
                input.started_at,
                input.ended_at
            ],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    })
}

#[tauri::command]
pub fn trace_message_upsert_batch(
    state: tauri::State<'_, AppState>,
    inputs: Vec<UpsertTraceMessageInput>,
) -> Result<(), String> {
    if inputs.is_empty() {
        return Ok(());
    }
    let now = now_iso();
    with_db(&state, |db| {
        let tx = db.unchecked_transaction().map_err(|err| err.to_string())?;
        {
            let mut stmt = tx
                .prepare(
                    "INSERT INTO trace_messages (id, run_id, column_id, iteration, idx, role, content, tool_calls_json, tool_call_id, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                     ON CONFLICT(id) DO UPDATE SET
                       content = excluded.content,
                       tool_calls_json = excluded.tool_calls_json,
                       updated_at = ?11",
                )
                .map_err(|err| err.to_string())?;
            for input in &inputs {
                stmt.execute(params![
                    input.id,
                    input.run_id,
                    input.column_id,
                    input.iteration,
                    input.idx,
                    input.role,
                    input.content,
                    input.tool_calls_json,
                    input.tool_call_id,
                    input.created_at,
                    now
                ])
                .map_err(|err| err.to_string())?;
            }
        }
        tx.commit().map_err(|err| err.to_string())
    })
}

#[tauri::command]
pub fn trace_get_by_run(
    state: tauri::State<'_, AppState>,
    run_id: String,
) -> Result<TraceRun, String> {
    with_db(&state, |db| {
        let mut column_stmt = db
            .prepare(&format!(
                "{TRACE_COLUMN_SELECT} WHERE run_id = ?1 ORDER BY started_at ASC"
            ))
            .map_err(|err| err.to_string())?;
        let columns = column_stmt
            .query_map(params![run_id], map_trace_column)
            .map_err(|err| err.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())?;

        let mut message_stmt = db
            .prepare(&format!(
                "{TRACE_MESSAGE_SELECT} WHERE run_id = ?1 ORDER BY idx ASC, created_at ASC"
            ))
            .map_err(|err| err.to_string())?;
        let messages = message_stmt
            .query_map(params![run_id], map_trace_message)
            .map_err(|err| err.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())?;

        Ok(TraceRun { columns, messages })
    })
}

/// Deletes traces beyond the most recent `keep_runs` runs (per whole app, not
/// per session) so long-lived installs do not accumulate unbounded trace data.
#[tauri::command]
pub fn trace_prune(state: tauri::State<'_, AppState>, keep_runs: i64) -> Result<(), String> {
    let keep = keep_runs.max(0);
    with_db(&state, |db| {
        db.execute(
            "DELETE FROM trace_columns WHERE run_id NOT IN (
                SELECT run_id FROM trace_columns
                GROUP BY run_id
                ORDER BY MAX(started_at) DESC
                LIMIT ?1
            )",
            params![keep],
        )
        .map_err(|err| err.to_string())?;
        db.execute(
            "DELETE FROM trace_messages WHERE run_id NOT IN (SELECT run_id FROM trace_columns)",
            [],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    })
}

#[tauri::command]
pub fn memory_add(
    state: tauri::State<'_, AppState>,
    input: AddMemoryInput,
) -> Result<MemoryItem, String> {
    let id = Uuid::new_v4().to_string();
    let now = now_iso();
    let metadata_json = input.metadata.as_ref().map(|value| value.to_string());

    with_db(&state, |db| {
        db.execute(
            "INSERT INTO memory_items (id, domain, layer, session_id, content, metadata_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                id,
                input.domain,
                input.layer,
                input.session_id,
                input.content,
                metadata_json,
                now,
                now
            ],
        )
        .map_err(|err| err.to_string())?;

        db.query_row(
            "SELECT id, domain, layer, session_id, content, metadata_json, created_at, updated_at FROM memory_items WHERE id = ?1",
            params![id],
            map_memory,
        )
        .map_err(|err| err.to_string())
    })
}

#[tauri::command]
pub fn memory_search(
    state: tauri::State<'_, AppState>,
    query: MemoryQuery,
) -> Result<Vec<MemoryItem>, String> {
    let limit = query.limit.unwrap_or(20) as i64;
    with_db(&state, |db| {
        let mut sql = String::from(
            "SELECT id, domain, layer, session_id, content, metadata_json, created_at, updated_at
             FROM memory_items WHERE domain = ?1 AND content LIKE '%' || ?2 || '%'",
        );
        let mut bind_values: Vec<String> = vec![query.domain, query.query];
        if let Some(session_id) = query.session_id {
            sql.push_str(" AND session_id = ?3");
            bind_values.push(session_id);
        }
        if let Some(layer) = query.layer {
            let placeholder = bind_values.len() + 1;
            sql.push_str(&format!(" AND layer = ?{placeholder}"));
            bind_values.push(layer);
        }
        sql.push_str(&format!(" ORDER BY updated_at DESC LIMIT ?{}", bind_values.len() + 1));

        let mut stmt = db.prepare(&sql).map_err(|err| err.to_string())?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = bind_values
            .iter()
            .map(|value| value as &dyn rusqlite::ToSql)
            .chain(std::iter::once(&limit as &dyn rusqlite::ToSql))
            .collect();
        let rows = stmt
            .query_map(param_refs.as_slice(), map_memory)
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())
    })
}

#[tauri::command]
pub fn memory_list(
    state: tauri::State<'_, AppState>,
    scope: MemoryScope,
) -> Result<Vec<MemoryItem>, String> {
    with_db(&state, |db| {
        let mut sql = String::from(
            "SELECT id, domain, layer, session_id, content, metadata_json, created_at, updated_at
             FROM memory_items WHERE domain = ?1",
        );
        let mut bind_values = vec![scope.domain];
        if let Some(session_id) = scope.session_id {
            sql.push_str(" AND session_id = ?2");
            bind_values.push(session_id);
        }
        if let Some(layer) = scope.layer {
            let placeholder = bind_values.len() + 1;
            sql.push_str(&format!(" AND layer = ?{placeholder}"));
            bind_values.push(layer);
        }
        sql.push_str(" ORDER BY updated_at DESC");

        let mut stmt = db.prepare(&sql).map_err(|err| err.to_string())?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = bind_values
            .iter()
            .map(|value| value as &dyn rusqlite::ToSql)
            .collect();
        let rows = stmt
            .query_map(param_refs.as_slice(), map_memory)
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())
    })
}

#[tauri::command]
pub fn memory_update(
    state: tauri::State<'_, AppState>,
    id: String,
    patch: UpdateMemoryInput,
) -> Result<MemoryItem, String> {
    let now = now_iso();
    with_db(&state, |db| {
        let current = db
            .query_row(
                "SELECT id, domain, layer, session_id, content, metadata_json, created_at, updated_at FROM memory_items WHERE id = ?1",
                params![id],
                map_memory,
            )
            .map_err(|err| err.to_string())?;

        let metadata_json = patch
            .metadata
            .or(current.metadata)
            .map(|value| value.to_string());

        db.execute(
            "UPDATE memory_items SET content = ?1, layer = ?2, metadata_json = ?3, updated_at = ?4 WHERE id = ?5",
            params![
                patch.content.unwrap_or(current.content),
                patch.layer.unwrap_or(current.layer),
                metadata_json,
                now,
                id
            ],
        )
        .map_err(|err| err.to_string())?;

        db.query_row(
            "SELECT id, domain, layer, session_id, content, metadata_json, created_at, updated_at FROM memory_items WHERE id = ?1",
            params![id],
            map_memory,
        )
        .map_err(|err| err.to_string())
    })
}

#[tauri::command]
pub fn memory_delete(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    with_db(&state, |db| {
        db.execute("DELETE FROM memory_items WHERE id = ?1", params![id])
            .map_err(|err| err.to_string())?;
        Ok(())
    })
}

#[tauri::command]
pub fn writing_document_create(
    state: tauri::State<'_, AppState>,
    input: CreateWritingDocumentInput,
) -> Result<WritingDocument, String> {
    let id = Uuid::new_v4().to_string();
    let now = now_iso();
    let relative_path = format!("writing/documents/{id}.md");
    let absolute_path = state.data_dir.join(&relative_path);
    let content = input
        .initial_content
        .unwrap_or_else(|| format!("# {}\n", input.title));
    crate::db::write_text_file(&absolute_path, &content)?;

    with_db(&state, |db| {
        db.execute(
            "INSERT INTO writing_documents (id, title, file_path, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'active', ?4, ?5)",
            params![id, input.title, relative_path, now, now],
        )
        .map_err(|err| err.to_string())?;

        db.query_row(
            "SELECT id, title, file_path, status, created_at, updated_at FROM writing_documents WHERE id = ?1",
            params![id],
            map_writing_document,
        )
        .map_err(|err| err.to_string())
    })
}

#[tauri::command]
pub fn writing_document_list(state: tauri::State<'_, AppState>) -> Result<Vec<WritingDocument>, String> {
    with_db(&state, |db| {
        let mut stmt = db
            .prepare(
                "SELECT id, title, file_path, status, created_at, updated_at
                 FROM writing_documents WHERE status != 'deleted' ORDER BY updated_at DESC",
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map([], map_writing_document)
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())
    })
}

#[tauri::command]
pub fn writing_document_get(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<Option<WritingDocument>, String> {
    with_db(&state, |db| fetch_writing_document(db, &id))
}

#[tauri::command]
pub fn writing_document_read(state: tauri::State<'_, AppState>, id: String) -> Result<String, String> {
    let document = with_db(&state, |db| fetch_writing_document(db, &id))?
        .ok_or_else(|| "Document not found".to_string())?;
    crate::db::read_text_file(&state.data_dir.join(document.file_path))
}

#[tauri::command]
pub fn writing_document_save(
    state: tauri::State<'_, AppState>,
    id: String,
    content: String,
) -> Result<(), String> {
    let document = with_db(&state, |db| fetch_writing_document(db, &id))?
        .ok_or_else(|| "Document not found".to_string())?;
    crate::db::write_text_file(&state.data_dir.join(document.file_path), &content)?;
    with_db(&state, |db| {
        db.execute(
            "UPDATE writing_documents SET updated_at = ?1 WHERE id = ?2",
            params![now_iso(), id],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    })
}

#[tauri::command]
pub fn tool_run_list(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<Vec<ToolRun>, String> {
    with_db(&state, |db| {
        let mut stmt = db
            .prepare(
                &format!("{TOOL_RUN_SELECT} WHERE session_id = ?1 ORDER BY started_at DESC"),
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(params![session_id], map_tool_run)
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())
    })
}

pub fn resolve_project_path(project_root: &str, relative_path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(project_root);
    let candidate = root.join(relative_path);
    let normalized = candidate
        .components()
        .fold(PathBuf::new(), |mut acc, component| {
            match component {
                Component::ParentDir => {
                    acc.pop();
                }
                Component::CurDir => {}
                other => acc.push(other.as_os_str()),
            }
            acc
        });

    if !normalized.starts_with(&root) {
        return Err("Path escapes project root".to_string());
    }
    Ok(normalized)
}

pub fn insert_tool_run(state: &AppState, tool_run: &ToolRun) -> Result<(), String> {
    with_db(state, |db| {
        db.execute(
            "INSERT INTO tool_runs (id, session_id, run_id, message_id, kind, command, cwd, target_path, status, exit_code, stdout_tail, stderr_tail, requires_confirmation, started_at, finished_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                tool_run.id,
                tool_run.session_id,
                tool_run.run_id,
                tool_run.message_id,
                tool_run.kind,
                tool_run.command,
                tool_run.cwd,
                tool_run.target_path,
                tool_run.status,
                tool_run.exit_code,
                tool_run.stdout_tail,
                tool_run.stderr_tail,
                if tool_run.requires_confirmation { 1 } else { 0 },
                tool_run.started_at,
                tool_run.finished_at
            ],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    })
}

pub fn update_tool_run(state: &AppState, tool_run: &ToolRun) -> Result<(), String> {
    with_db(state, |db| {
        db.execute(
            "UPDATE tool_runs SET status = ?1, exit_code = ?2, stdout_tail = ?3, stderr_tail = ?4, finished_at = ?5 WHERE id = ?6",
            params![
                tool_run.status,
                tool_run.exit_code,
                tool_run.stdout_tail,
                tool_run.stderr_tail,
                tool_run.finished_at,
                tool_run.id
            ],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    })
}

#[tauri::command]
pub fn project_read_file(
    state: tauri::State<'_, AppState>,
    request: FileReadRequest,
) -> Result<String, String> {
    if !crate::shell::permissions::can_read_files(&request.mode) {
        return Err(format!("Read files is blocked in {} mode", request.mode));
    }
    let path = resolve_project_path(&request.project_path, &request.relative_path)?;
    let content = crate::db::read_text_file(&path)?;
    let tool_run = ToolRun {
        id: Uuid::new_v4().to_string(),
        session_id: request.session_id,
        run_id: request.run_id,
        message_id: request.message_id,
        kind: "read_file".to_string(),
        command: None,
        cwd: Some(request.project_path.clone()),
        target_path: Some(request.relative_path),
        status: "completed".to_string(),
        exit_code: Some(0),
        stdout_tail: Some(truncate_tail(&content, 4000)),
        stderr_tail: None,
        requires_confirmation: false,
        started_at: now_iso(),
        finished_at: Some(now_iso()),
    };
    insert_tool_run(&state, &tool_run)?;
    Ok(content)
}

#[tauri::command]
pub fn project_write_file(
    state: tauri::State<'_, AppState>,
    request: FileWriteRequest,
) -> Result<ToolRun, String> {
    if !crate::shell::permissions::can_write_files(&request.mode) {
        return Err(format!("Write files is blocked in {} mode", request.mode));
    }

    let requires_confirmation =
        crate::shell::permissions::requires_confirmation_for_write(&request.relative_path);
    let confirmed = request.confirmed.unwrap_or(false);
    let mut tool_run = ToolRun {
        id: Uuid::new_v4().to_string(),
        session_id: request.session_id,
        run_id: request.run_id,
        message_id: request.message_id,
        kind: "write_file".to_string(),
        command: None,
        cwd: Some(request.project_path.clone()),
        target_path: Some(request.relative_path.clone()),
        status: "pending".to_string(),
        exit_code: None,
        stdout_tail: None,
        stderr_tail: None,
        requires_confirmation,
        started_at: now_iso(),
        finished_at: None,
    };
    insert_tool_run(&state, &tool_run)?;

    if requires_confirmation && !confirmed {
        tool_run.status = "pending".to_string();
        return Ok(tool_run);
    }

    let path = resolve_project_path(&request.project_path, &request.relative_path)?;
    crate::db::write_text_file(&path, &request.content)?;
    tool_run.status = "completed".to_string();
    tool_run.exit_code = Some(0);
    tool_run.finished_at = Some(now_iso());
    update_tool_run(&state, &tool_run)?;
    Ok(tool_run)
}

#[tauri::command]
pub async fn shell_run(
    state: tauri::State<'_, AppState>,
    request: ShellRunRequest,
) -> Result<ShellRunResult, String> {
    runner::run_shell(state, request).await
}

fn has_read_file_in_run(state: &AppState, run_id: &str, relative_path: &str) -> Result<bool, String> {
    with_db(state, |db| {
        let count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM tool_runs WHERE run_id = ?1 AND kind = 'read_file' AND target_path = ?2 AND status = 'completed'",
                params![run_id, relative_path],
                |row| row.get(0),
            )
            .map_err(|err| err.to_string())?;
        Ok(count > 0)
    })
}

#[tauri::command]
pub fn project_search(
    state: tauri::State<'_, AppState>,
    request: SearchRequest,
) -> Result<SearchResult, String> {
    if !crate::shell::permissions::can_read_files(&request.mode) {
        return Err(format!("Search is blocked in {} mode", request.mode));
    }

    let max_results = request.max_results.unwrap_or(100).min(500);
    let root = std::fs::canonicalize(&request.project_path).map_err(|err| err.to_string())?;
    let matches = crate::project_ops::search_project(
        &root,
        &request.pattern,
        request.include_glob.as_deref(),
        request.case_insensitive.unwrap_or(false),
        max_results + 1,
    )?;

    let truncated = matches.len() > max_results;
    let result_matches = matches.into_iter().take(max_results).collect::<Vec<_>>();
    let summary = format!(
        "pattern={} matches={}{}",
        request.pattern,
        result_matches.len(),
        if truncated { "+" } else { "" }
    );

    let tool_run = ToolRun {
        id: Uuid::new_v4().to_string(),
        session_id: request.session_id,
        run_id: request.run_id,
        message_id: request.message_id,
        kind: "search".to_string(),
        command: Some(request.pattern.clone()),
        cwd: Some(request.project_path.clone()),
        target_path: request.include_glob.clone(),
        status: "completed".to_string(),
        exit_code: Some(result_matches.len() as i64),
        stdout_tail: Some(truncate_tail(&summary, 4000)),
        stderr_tail: None,
        requires_confirmation: false,
        started_at: now_iso(),
        finished_at: Some(now_iso()),
    };
    insert_tool_run(&state, &tool_run)?;

    Ok(SearchResult {
        matches: result_matches,
        truncated,
    })
}

#[tauri::command]
pub fn project_glob(
    state: tauri::State<'_, AppState>,
    request: GlobRequest,
) -> Result<GlobResult, String> {
    if !crate::shell::permissions::can_read_files(&request.mode) {
        return Err(format!("Glob is blocked in {} mode", request.mode));
    }

    let max_results = request.max_results.unwrap_or(200).min(500);
    let root = std::fs::canonicalize(&request.project_path).map_err(|err| err.to_string())?;
    let paths = crate::project_ops::glob_project(&root, &request.pattern, max_results + 1)?;
    let truncated = paths.len() > max_results;
    let result_paths = paths.into_iter().take(max_results).collect::<Vec<_>>();
    let summary = format!(
        "pattern={} paths={}{}",
        request.pattern,
        result_paths.len(),
        if truncated { "+" } else { "" }
    );

    let tool_run = ToolRun {
        id: Uuid::new_v4().to_string(),
        session_id: request.session_id,
        run_id: request.run_id,
        message_id: request.message_id,
        kind: "glob".to_string(),
        command: Some(request.pattern.clone()),
        cwd: Some(request.project_path.clone()),
        target_path: None,
        status: "completed".to_string(),
        exit_code: Some(result_paths.len() as i64),
        stdout_tail: Some(truncate_tail(&summary, 4000)),
        stderr_tail: None,
        requires_confirmation: false,
        started_at: now_iso(),
        finished_at: Some(now_iso()),
    };
    insert_tool_run(&state, &tool_run)?;

    Ok(GlobResult {
        paths: result_paths,
        truncated,
    })
}

#[tauri::command]
pub fn project_edit_file(
    state: tauri::State<'_, AppState>,
    request: EditFileRequest,
) -> Result<ToolRun, String> {
    if !crate::shell::permissions::can_write_files(&request.mode) {
        return Err(format!("Edit files is blocked in {} mode", request.mode));
    }

    let run_id = request
        .run_id
        .as_deref()
        .ok_or_else(|| "runId is required for edit_file".to_string())?;

    if !has_read_file_in_run(&state, run_id, &request.relative_path)? {
        return Err(format!(
            "Must read {} in this run before editing. Use read_file first.",
            request.relative_path
        ));
    }

    let requires_confirmation =
        crate::shell::permissions::requires_confirmation_for_write(&request.relative_path);
    let confirmed = request.confirmed.unwrap_or(false);
    let replace_all = request.replace_all.unwrap_or(false);
    let mut tool_run = ToolRun {
        id: Uuid::new_v4().to_string(),
        session_id: request.session_id,
        run_id: request.run_id.clone(),
        message_id: request.message_id,
        kind: "edit_file".to_string(),
        command: None,
        cwd: Some(request.project_path.clone()),
        target_path: Some(request.relative_path.clone()),
        status: "pending".to_string(),
        exit_code: None,
        stdout_tail: None,
        stderr_tail: None,
        requires_confirmation,
        started_at: now_iso(),
        finished_at: None,
    };
    insert_tool_run(&state, &tool_run)?;

    if requires_confirmation && !confirmed {
        tool_run.status = "pending".to_string();
        return Ok(tool_run);
    }

    let path = resolve_project_path(&request.project_path, &request.relative_path)?;
    let content = crate::db::read_text_file(&path)?;
    let updated = crate::project_ops::edit_file_content(
        &content,
        &request.old_string,
        &request.new_string,
        replace_all,
    )?;
    crate::db::write_text_file(&path, &updated)?;

    tool_run.status = "completed".to_string();
    tool_run.exit_code = Some(0);
    tool_run.stdout_tail = Some(format!(
        "Edited {} (replaceAll={})",
        request.relative_path, replace_all
    ));
    tool_run.finished_at = Some(now_iso());
    update_tool_run(&state, &tool_run)?;
    Ok(tool_run)
}

pub fn truncate_tail(value: &str, max_len: usize) -> String {
    if value.len() <= max_len {
        return value.to_string();
    }
    value[value.len() - max_len..].to_string()
}

pub fn derive_title_from_message(message: &str) -> String {
    derive_session_title(message)
}

#[tauri::command]
pub fn code_project_list(state: tauri::State<'_, AppState>) -> Result<Vec<CodeProject>, String> {
    with_db(&state, |db| {
        let mut stmt = db
            .prepare(
                "SELECT id, path, display_name, created_at, last_opened_at
                 FROM code_projects ORDER BY COALESCE(last_opened_at, created_at) DESC",
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(CodeProject {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    display_name: row.get(2)?,
                    created_at: row.get(3)?,
                    last_opened_at: row.get(4)?,
                })
            })
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())
    })
}

#[tauri::command]
pub fn code_project_register(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<CodeProject, String> {
    let canonical = std::fs::canonicalize(&path).map_err(|err| err.to_string())?;
    let canonical_string = canonical.to_string_lossy().to_string();
    let display_name = canonical
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Project")
        .to_string();
    let now = now_iso();

    with_db(&state, |db| {
        if let Ok(existing) = db.query_row(
            "SELECT id, path, display_name, created_at, last_opened_at FROM code_projects WHERE path = ?1",
            params![canonical_string],
            |row| {
                Ok(CodeProject {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    display_name: row.get(2)?,
                    created_at: row.get(3)?,
                    last_opened_at: row.get(4)?,
                })
            },
        ) {
            db.execute(
                "UPDATE code_projects SET last_opened_at = ?1 WHERE id = ?2",
                params![now, existing.id],
            )
            .map_err(|err| err.to_string())?;
            return Ok(existing);
        }

        let id = Uuid::new_v4().to_string();
        db.execute(
            "INSERT INTO code_projects (id, path, display_name, created_at, last_opened_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, canonical_string, display_name, now, now],
        )
        .map_err(|err| err.to_string())?;

        Ok(CodeProject {
            id,
            path: canonical_string,
            display_name,
            created_at: now.clone(),
            last_opened_at: Some(now),
        })
    })
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|err| err.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let file_type = entry.file_type().map_err(|err| err.to_string())?;
        let target = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else if file_type.is_file() {
            std::fs::copy(entry.path(), &target).map_err(|err| err.to_string())?;
        }
    }
    Ok(())
}

fn resolve_todo_fixture_src() -> Result<std::path::PathBuf, String> {
    if let Ok(override_path) = std::env::var("COHESIVE_DEMO_FIXTURE") {
        let path = std::path::PathBuf::from(override_path);
        if path.is_dir() {
            return Ok(path);
        }
        return Err(format!(
            "COHESIVE_DEMO_FIXTURE is not a directory: {}",
            path.display()
        ));
    }

    let candidates = [
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../evals/fixtures/todo-app"),
        std::env::current_dir()
            .map_err(|err| err.to_string())?
            .join("evals/fixtures/todo-app"),
        std::env::current_dir()
            .map_err(|err| err.to_string())?
            .join("../evals/fixtures/todo-app"),
    ];

    for candidate in candidates {
        if candidate.is_dir() {
            return Ok(candidate);
        }
    }

    Err(
        "Could not find evals/fixtures/todo-app. Set COHESIVE_DEMO_FIXTURE to an absolute path."
            .to_string(),
    )
}

/// Copies the todo-app eval fixture into a stable temp folder, registers it as a
/// code project, and marks onboarding complete. Recording / demo only.
///
/// Uses `{temp}/cohesive-demo/todo-app` (overwritten each call). Demo writes go
/// to the isolated `cohesive-demo.db` (see `init_database`); the fixture tree is
/// removed on process exit.
#[tauri::command]
pub fn demo_prepare_fixture(
    state: tauri::State<'_, AppState>,
) -> Result<CodeProject, String> {
    let src = resolve_todo_fixture_src()?;
    let dest_root = crate::db::demo_fixture_root_path();
    let dest = dest_root.join("todo-app");
    if dest_root.exists() {
        std::fs::remove_dir_all(&dest_root).map_err(|err| err.to_string())?;
    }
    copy_dir_recursive(&src, &dest)?;

    {
        let mut root = state
            .demo_fixture_root
            .lock()
            .map_err(|_| "Demo fixture lock poisoned".to_string())?;
        *root = Some(dest_root.clone());
    }

    with_db(&state, |db| {
        db.execute(
            "INSERT INTO app_settings (key, value) VALUES ('onboarding_completed', 'true')
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    })?;

    code_project_register(state, dest.to_string_lossy().to_string())
}
