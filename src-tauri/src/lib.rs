mod documents;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            documents::list_documents,
            documents::create_document,
            documents::get_document,
            documents::save_document,
            documents::rename_document,
            documents::delete_document,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
