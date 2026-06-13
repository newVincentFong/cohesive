mod commands;
mod db;
mod llm;
mod models;
mod settings;
mod shell;

use db::init_database;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let state = init_database(&app.handle())?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            settings::settings_get,
            settings::settings_save_api_key,
            settings::settings_complete_onboarding,
            commands::session_create,
            commands::session_list,
            commands::session_get,
            commands::session_update,
            commands::session_touch,
            commands::session_delete,
            commands::message_create,
            commands::message_list,
            commands::memory_add,
            commands::memory_search,
            commands::memory_list,
            commands::memory_update,
            commands::memory_delete,
            commands::writing_document_create,
            commands::writing_document_list,
            commands::writing_document_get,
            commands::writing_document_read,
            commands::writing_document_save,
            commands::code_project_list,
            commands::code_project_register,
            commands::shell_run,
            commands::project_read_file,
            commands::project_write_file,
            commands::tool_run_list,
            llm::llm_complete,
            llm::llm_stream,
            llm::writing_selection_action,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
