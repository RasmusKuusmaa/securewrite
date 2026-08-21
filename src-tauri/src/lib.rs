mod crypto;
mod documents;
mod settings;

use crypto::VaultKeyState;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(VaultKeyState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            crypto::vault_status,
            crypto::setup_vault,
            crypto::unlock_with_password,
            crypto::unlock_with_recovery_key,
            crypto::lock_vault,
            crypto::setup_duress_password,
            crypto::has_duress_configured,
            documents::list_documents,
            documents::create_document,
            documents::get_document,
            documents::save_document,
            documents::rename_document,
            documents::delete_document,
            settings::get_settings,
            settings::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
