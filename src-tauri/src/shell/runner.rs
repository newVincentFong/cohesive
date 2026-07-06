use uuid::Uuid;

use crate::commands::{insert_tool_run, truncate_tail, update_tool_run};
use crate::db::{now_iso, AppState};
use crate::models::{ShellRunRequest, ShellRunResult, ToolRun};

pub async fn run_shell(
    state: tauri::State<'_, AppState>,
    request: ShellRunRequest,
) -> Result<ShellRunResult, String> {
    if !super::permissions::can_run_shell(&request.mode) {
        return Err(format!("Shell access is blocked in {} mode", request.mode));
    }

    let is_mutating = super::permissions::is_mutating_command(&request.command);
    if is_mutating && !super::permissions::can_run_mutating_shell(&request.mode) {
        return Err(format!(
            "Mutating shell commands are blocked in {} mode",
            request.mode
        ));
    }

    let requires_confirmation =
        is_mutating && super::permissions::requires_confirmation(&request.command);
    let confirmed = request.confirmed.unwrap_or(false);
    let cwd = request.cwd.unwrap_or_else(|| request.project_path.clone());
    let project_root = std::fs::canonicalize(&request.project_path).map_err(|err| err.to_string())?;
    let cwd_path = std::path::Path::new(&cwd);
    let canonical_cwd = if cwd_path.is_absolute() {
        std::fs::canonicalize(cwd_path).map_err(|err| err.to_string())?
    } else {
        std::fs::canonicalize(project_root.join(cwd_path)).map_err(|err| err.to_string())?
    };

    let started_at = now_iso();
    let mut tool_run = ToolRun {
        id: Uuid::new_v4().to_string(),
        session_id: request.session_id,
        run_id: request.run_id,
        message_id: request.message_id,
        kind: "shell".to_string(),
        command: Some(request.command.clone()),
        cwd: Some(canonical_cwd.to_string_lossy().to_string()),
        target_path: None,
        status: "pending".to_string(),
        exit_code: None,
        stdout_tail: None,
        stderr_tail: None,
        requires_confirmation,
        started_at,
        finished_at: None,
    };
    insert_tool_run(&state, &tool_run)?;

    if requires_confirmation && !confirmed {
        return Ok(ShellRunResult {
            tool_run,
            blocked_reason: Some("Confirmation required for mutating command".to_string()),
        });
    }

    if !canonical_cwd.starts_with(&project_root) {
        tool_run.status = "failed".to_string();
        tool_run.stderr_tail = Some("Working directory must stay inside project path".to_string());
        tool_run.finished_at = Some(now_iso());
        update_tool_run(&state, &tool_run)?;
        return Ok(ShellRunResult {
            tool_run,
            blocked_reason: Some("Working directory must stay inside project path".to_string()),
        });
    }

    tool_run.status = "running".to_string();
    update_tool_run(&state, &tool_run)?;

    let output = tokio::process::Command::new("sh")
        .arg("-lc")
        .arg(&request.command)
        .current_dir(&canonical_cwd)
        .output()
        .await
        .map_err(|err| err.to_string())?;

    tool_run.status = if output.status.success() {
        "completed".to_string()
    } else {
        "failed".to_string()
    };
    tool_run.exit_code = output.status.code().map(|code| code as i64);
    tool_run.stdout_tail = Some(truncate_tail(
        &String::from_utf8_lossy(&output.stdout),
        4000,
    ));
    tool_run.stderr_tail = Some(truncate_tail(
        &String::from_utf8_lossy(&output.stderr),
        4000,
    ));
    tool_run.finished_at = Some(now_iso());
    update_tool_run(&state, &tool_run)?;

    Ok(ShellRunResult {
        tool_run,
        blocked_reason: None,
    })
}
