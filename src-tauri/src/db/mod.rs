use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::{params, Connection};
use tauri::{AppHandle, Manager};

pub const SCHEMA_VERSION: i64 = 3;
/// Oldest schema version that can be upgraded in place. Versions at or above
/// this only differ by additive statements (schema.sql is idempotent), so the
/// database is kept and the schema batch is simply re-applied. Anything older
/// (or newer, from a downgrade) still gets the backup-and-reset treatment.
const MIN_IN_PLACE_UPGRADE_VERSION: i64 = 2;
const SCHEMA_VERSION_KEY: &str = "schema_version";

pub struct AppState {
    pub db: Mutex<Connection>,
    pub data_dir: PathBuf,
}

fn backup_database_path(db_path: &std::path::Path) -> PathBuf {
    let timestamp = chrono::Utc::now().format("%Y%m%d%H%M%S");
    let file_name = db_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("cohesive.db");
    db_path.with_file_name(format!("{file_name}.backup-{timestamp}"))
}

fn read_schema_version(connection: &Connection) -> Option<i64> {
    connection
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![SCHEMA_VERSION_KEY],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|value| value.parse().ok())
}

fn ensure_schema(connection: &Connection) -> Result<(), String> {
    let current_version = read_schema_version(connection);
    if current_version == Some(SCHEMA_VERSION) {
        return Ok(());
    }

    connection
        .execute_batch(include_str!("schema.sql"))
        .map_err(|err| err.to_string())?;

    connection
        .execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![SCHEMA_VERSION_KEY, SCHEMA_VERSION.to_string()],
        )
        .map_err(|err| err.to_string())?;

    Ok(())
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
    let needs_reset = if db_path.exists() {
        let probe = Connection::open(&db_path).map_err(|err| err.to_string())?;
        match read_schema_version(&probe) {
            Some(version) => {
                version < MIN_IN_PLACE_UPGRADE_VERSION || version > SCHEMA_VERSION
            }
            None => true,
        }
    } else {
        false
    };

    if needs_reset {
        let backup_path = backup_database_path(&db_path);
        std::fs::rename(&db_path, backup_path).map_err(|err| err.to_string())?;
    }

    let connection = Connection::open(db_path).map_err(|err| err.to_string())?;
    ensure_schema(&connection)?;

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
