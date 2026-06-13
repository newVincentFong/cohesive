use rusqlite::params;

use crate::db::{with_db, AppState};
use crate::models::AppSettings;

const SERVICE: &str = "cohesive";
const USER: &str = "deepseek-api-key";

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
    let entry = keyring::Entry::new(SERVICE, USER).map_err(|err| err.to_string())?;
    entry.set_password(&api_key).map_err(|err| err.to_string())
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
    let entry = keyring::Entry::new(SERVICE, USER).map_err(|err| err.to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}
