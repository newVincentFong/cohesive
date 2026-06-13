use std::path::{Component, Path, PathBuf};

use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::db::{now_iso, parse_metadata, with_db, AppState};
use crate::models::{
    AddMemoryInput, CodeProject, CreateMessageInput, CreateSessionInput, CreateWritingDocumentInput,
    FileReadRequest, FileWriteRequest, MemoryItem, MemoryQuery, MemoryScope, Message, Session,
    ShellRunRequest, ShellRunResult, ToolRun, UpdateMemoryInput, UpdateSessionInput,
    WritingDocument,
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

fn map_session(row: &rusqlite::Row<'_>) -> rusqlite::Result<Session> {
    Ok(Session {
        id: row.get(0)?,
        domain: row.get(1)?,
        title: row.get(2)?,
        status: row.get(3)?,
        mode: row.get(4)?,
        project_id: row.get(5)?,
        document_id: row.get(6)?,
        memory_scope_id: row.get(7)?,
        summary: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
        last_opened_at: row.get(11)?,
    })
}

fn map_message(row: &rusqlite::Row<'_>) -> rusqlite::Result<Message> {
    Ok(Message {
        id: row.get(0)?,
        session_id: row.get(1)?,
        role: row.get(2)?,
        content: row.get(3)?,
        tool_name: row.get(4)?,
        tool_payload: row.get(5)?,
        created_at: row.get(6)?,
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
        kind: row.get(2)?,
        command: row.get(3)?,
        cwd: row.get(4)?,
        target_path: row.get(5)?,
        status: row.get(6)?,
        exit_code: row.get(7)?,
        stdout_tail: row.get(8)?,
        stderr_tail: row.get(9)?,
        requires_confirmation: row.get::<_, i64>(10)? != 0,
        started_at: row.get(11)?,
        finished_at: row.get(12)?,
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
        "SELECT id, domain, title, status, mode, project_id, document_id, memory_scope_id, summary, created_at, updated_at, last_opened_at
         FROM sessions WHERE id = ?1",
        params![id],
        map_session,
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
            "INSERT INTO sessions (id, domain, title, status, mode, project_id, document_id, memory_scope_id, created_at, updated_at, last_opened_at)
             VALUES (?1, ?2, ?3, 'active', ?4, ?5, ?6, ?7, ?8, ?9, ?8)",
            params![
                id,
                input.domain,
                title,
                input.mode,
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
                "SELECT id, domain, title, status, mode, project_id, document_id, memory_scope_id, summary, created_at, updated_at, last_opened_at
                 FROM sessions WHERE domain = ?1 AND status != 'deleted' ORDER BY COALESCE(last_opened_at, updated_at) DESC",
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
            "UPDATE sessions SET title = ?1, status = ?2, mode = ?3, project_id = ?4, document_id = ?5, summary = ?6, updated_at = ?7 WHERE id = ?8",
            params![
                patch.title.unwrap_or(current.title),
                patch.status.unwrap_or(current.status),
                patch.mode.or(current.mode),
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
        db.execute(
            "UPDATE sessions SET last_opened_at = ?1, updated_at = ?1 WHERE id = ?2",
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
            "INSERT INTO messages (id, session_id, role, content, tool_name, tool_payload, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                input.session_id,
                input.role,
                input.content,
                input.tool_name,
                input.tool_payload,
                now
            ],
        )
        .map_err(|err| err.to_string())?;

        db.execute(
            "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
            params![now, input.session_id],
        )
        .map_err(|err| err.to_string())?;

        db.query_row(
            "SELECT id, session_id, role, content, tool_name, tool_payload, created_at FROM messages WHERE id = ?1",
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
                "SELECT id, session_id, role, content, tool_name, tool_payload, created_at
                 FROM messages WHERE session_id = ?1 ORDER BY created_at ASC",
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
                "SELECT id, session_id, kind, command, cwd, target_path, status, exit_code, stdout_tail, stderr_tail, requires_confirmation, started_at, finished_at
                 FROM tool_runs WHERE session_id = ?1 ORDER BY started_at DESC",
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
            "INSERT INTO tool_runs (id, session_id, kind, command, cwd, target_path, status, exit_code, stdout_tail, stderr_tail, requires_confirmation, started_at, finished_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                tool_run.id,
                tool_run.session_id,
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
