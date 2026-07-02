use std::fs;
use std::path::PathBuf;

use crate::db::{with_db, AppState};
use crate::models::AppSettings;

const CONFIG_DIR_NAME: &str = ".cohesive";
const API_KEY_FILE: &str = "api-key";

fn config_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not resolve home directory".to_string())?;
    Ok(home.join(CONFIG_DIR_NAME))
}

fn api_key_path() -> Result<PathBuf, String> {
    Ok(config_dir()?.join(API_KEY_FILE))
}

fn ensure_config_dir() -> Result<PathBuf, String> {
    let dir = config_dir()?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub fn settings_get(state: tauri::State<'_, AppState>) -> Result<AppSettings, String> {
    let onboarding_completed = with_db(&state, |db| {
        Ok(
            db.query_row(
                "SELECT value FROM app_settings WHERE key = 'onboarding_completed'",
                [],
                |row| row.get::<_, String>(0),
            )
            .map(|value| value == "true")
            .unwrap_or(false),
        )
    })?;

    Ok(AppSettings {
        onboarding_completed,
        has_api_key: get_api_key()?.is_some(),
    })
}

#[tauri::command]
pub fn settings_save_api_key(api_key: String) -> Result<(), String> {
    let api_key = api_key.trim().to_string();
    if api_key.is_empty() {
        return Err("API key cannot be empty".to_string());
    }

    ensure_config_dir()?;
    let path = api_key_path()?;
    fs::write(&path, &api_key).map_err(|err| err.to_string())?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600))
            .map_err(|err| err.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn settings_clear_api_key() -> Result<(), String> {
    let path = api_key_path()?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
pub fn settings_complete_onboarding(state: tauri::State<'_, AppState>) -> Result<(), String> {
    with_db(&state, |db| {
        db.execute(
            "INSERT INTO app_settings (key, value) VALUES ('onboarding_completed', 'true')
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    })
}

pub fn get_api_key() -> Result<Option<String>, String> {
    let path = api_key_path()?;
    match fs::read_to_string(&path) {
        Ok(value) => {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                Ok(None)
            } else {
                Ok(Some(trimmed))
            }
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}
