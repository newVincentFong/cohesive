use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::{params, Connection};
use tauri::{AppHandle, Manager};

pub struct AppState {
    pub db: Mutex<Connection>,
    pub data_dir: PathBuf,
}

pub fn init_database(app: &AppHandle) -> Result<AppState, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| err.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|err| err.to_string())?;
    std::fs::create_dir_all(data_dir.join("writing/documents")).map_err(|err| err.to_string())?;
    std::fs::create_dir_all(data_dir.join("writing/assets")).map_err(|err| err.to_string())?;
    std::fs::create_dir_all(data_dir.join("code/workspaces")).map_err(|err| err.to_string())?;
    std::fs::create_dir_all(data_dir.join("mind/exports")).map_err(|err| err.to_string())?;

    let db_path = data_dir.join("cohesive.db");
    let connection = Connection::open(db_path).map_err(|err| err.to_string())?;
    connection
        .execute_batch(include_str!("schema.sql"))
        .map_err(|err| err.to_string())?;

    Ok(AppState {
        db: Mutex::new(connection),
        data_dir,
    })
}

pub fn with_db<T, F>(state: &AppState, f: F) -> Result<T, String>
where
    F: FnOnce(&Connection) -> Result<T, String>,
{
    let guard = state.db.lock().map_err(|_| "Database lock poisoned".to_string())?;
    f(&guard)
}

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn json_metadata(value: &Option<serde_json::Value>) -> Option<String> {
    value.as_ref().map(|metadata| metadata.to_string())
}

pub fn parse_metadata(raw: Option<String>) -> Option<serde_json::Value> {
    raw.and_then(|value| serde_json::from_str(&value).ok())
}

pub fn read_text_file(path: &std::path::Path) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|err| err.to_string())
}

pub fn write_text_file(path: &std::path::Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    std::fs::write(path, content).map_err(|err| err.to_string())
}
