use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub title: String,
    pub content: String,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DocumentMeta {
    pub id: String,
    pub title: String,
    pub updated_at: i64,
}

impl From<&Document> for DocumentMeta {
    fn from(doc: &Document) -> Self {
        DocumentMeta {
            id: doc.id.clone(),
            title: doc.title.clone(),
            updated_at: doc.updated_at,
        }
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn documents_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("documents");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn doc_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(documents_dir(app)?.join(format!("{id}.json")))
}

fn read_doc(path: &PathBuf) -> Result<Document, String> {
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn write_doc(app: &AppHandle, doc: &Document) -> Result<(), String> {
    let path = doc_path(app, &doc.id)?;
    let raw = serde_json::to_string_pretty(doc).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_documents(app: AppHandle) -> Result<Vec<DocumentMeta>, String> {
    let dir = documents_dir(&app)?;
    let mut metas = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            if let Ok(doc) = read_doc(&path) {
                metas.push(DocumentMeta::from(&doc));
            }
        }
    }
    metas.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(metas)
}

#[tauri::command]
pub fn create_document(app: AppHandle) -> Result<Document, String> {
    let doc = Document {
        id: uuid::Uuid::new_v4().to_string(),
        title: "Untitled".to_string(),
        content: String::new(),
        updated_at: now_ms(),
    };
    write_doc(&app, &doc)?;
    Ok(doc)
}

#[tauri::command]
pub fn get_document(app: AppHandle, id: String) -> Result<Document, String> {
    read_doc(&doc_path(&app, &id)?)
}

#[tauri::command]
pub fn save_document(
    app: AppHandle,
    id: String,
    title: String,
    content: String,
) -> Result<i64, String> {
    let updated_at = now_ms();
    let doc = Document {
        id,
        title,
        content,
        updated_at,
    };
    write_doc(&app, &doc)?;
    Ok(updated_at)
}

#[tauri::command]
pub fn rename_document(app: AppHandle, id: String, title: String) -> Result<(), String> {
    let path = doc_path(&app, &id)?;
    let mut doc = read_doc(&path)?;
    doc.title = title;
    doc.updated_at = now_ms();
    write_doc(&app, &doc)
}

#[tauri::command]
pub fn delete_document(app: AppHandle, id: String) -> Result<(), String> {
    let path = doc_path(&app, &id)?;
    fs::remove_file(path).map_err(|e| e.to_string())
}
