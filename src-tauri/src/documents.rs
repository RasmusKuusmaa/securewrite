use crate::crypto::{get_vault_context, VaultKeyState};
use aes_gcm::aead::{Aead, KeyInit, OsRng as AeadOsRng};
use aes_gcm::{Aes256Gcm, AeadCore, Key, Nonce};
use base64::{engine::general_purpose::STANDARD, Engine};
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

/// What actually gets encrypted - the id stays in plaintext (it's a random
/// UUID and doubles as the filename, so hiding it buys nothing).
#[derive(Serialize, Deserialize)]
struct DocPayload {
    title: String,
    content: String,
    updated_at: i64,
}

#[derive(Serialize, Deserialize)]
struct EncryptedDocFile {
    id: String,
    nonce: String,
    ciphertext: String,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// The duress/decoy vault (see crypto::setup_duress_password) lives in a
/// separate directory with its own documents - unlocking with the duress
/// password must never expose or even touch the real vault's files.
fn documents_dir(app: &AppHandle, is_decoy: bool) -> Result<PathBuf, String> {
    let name = if is_decoy { "documents_decoy" } else { "documents" };
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn doc_path(app: &AppHandle, is_decoy: bool, id: &str) -> Result<PathBuf, String> {
    Ok(documents_dir(app, is_decoy)?.join(format!("{id}.json")))
}

/// Wipes all decoy documents. Called when the duress password is (re)set,
/// since that always mints a fresh decoy vault key - any documents already
/// encrypted under the previous key would be permanently undecryptable
/// garbage rather than actually being removed, if left in place.
pub fn clear_decoy_documents(app: &AppHandle) -> Result<(), String> {
    let dir = documents_dir(app, true)?;
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        fs::remove_file(entry.path()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn encrypt_payload(key: &[u8], payload: &DocPayload) -> Result<(String, String), String> {
    let plaintext = serde_json::to_vec(payload).map_err(|e| e.to_string())?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Aes256Gcm::generate_nonce(&mut AeadOsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_ref())
        .map_err(|_| "encryption failed".to_string())?;
    Ok((STANDARD.encode(nonce), STANDARD.encode(ciphertext)))
}

fn decrypt_payload(key: &[u8], nonce_b64: &str, ciphertext_b64: &str) -> Result<DocPayload, String> {
    let nonce_bytes = STANDARD.decode(nonce_b64).map_err(|e| e.to_string())?;
    let ciphertext = STANDARD
        .decode(ciphertext_b64)
        .map_err(|e| e.to_string())?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| "decryption failed".to_string())?;
    serde_json::from_slice(&plaintext).map_err(|e| e.to_string())
}

fn read_doc(path: &PathBuf, key: &[u8]) -> Result<Document, String> {
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let enc: EncryptedDocFile = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let payload = decrypt_payload(key, &enc.nonce, &enc.ciphertext)?;
    Ok(Document {
        id: enc.id,
        title: payload.title,
        content: payload.content,
        updated_at: payload.updated_at,
    })
}

fn write_doc(app: &AppHandle, is_decoy: bool, key: &[u8], doc: &Document) -> Result<(), String> {
    let payload = DocPayload {
        title: doc.title.clone(),
        content: doc.content.clone(),
        updated_at: doc.updated_at,
    };
    let (nonce, ciphertext) = encrypt_payload(key, &payload)?;
    let enc = EncryptedDocFile {
        id: doc.id.clone(),
        nonce,
        ciphertext,
    };
    let raw = serde_json::to_string_pretty(&enc).map_err(|e| e.to_string())?;
    fs::write(doc_path(app, is_decoy, &doc.id)?, raw).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_documents(
    app: AppHandle,
    state: tauri::State<VaultKeyState>,
) -> Result<Vec<DocumentMeta>, String> {
    let (key, is_decoy) = get_vault_context(&state)?;
    let dir = documents_dir(&app, is_decoy)?;
    let mut metas = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            if let Ok(doc) = read_doc(&path, &key) {
                metas.push(DocumentMeta::from(&doc));
            }
        }
    }
    metas.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(metas)
}

#[tauri::command]
pub fn create_document(
    app: AppHandle,
    state: tauri::State<VaultKeyState>,
) -> Result<Document, String> {
    let (key, is_decoy) = get_vault_context(&state)?;
    let doc = Document {
        id: uuid::Uuid::new_v4().to_string(),
        title: "Untitled".to_string(),
        content: String::new(),
        updated_at: now_ms(),
    };
    write_doc(&app, is_decoy, &key, &doc)?;
    Ok(doc)
}

#[tauri::command]
pub fn get_document(
    app: AppHandle,
    state: tauri::State<VaultKeyState>,
    id: String,
) -> Result<Document, String> {
    let (key, is_decoy) = get_vault_context(&state)?;
    read_doc(&doc_path(&app, is_decoy, &id)?, &key)
}

#[tauri::command]
pub fn save_document(
    app: AppHandle,
    state: tauri::State<VaultKeyState>,
    id: String,
    title: String,
    content: String,
) -> Result<i64, String> {
    let (key, is_decoy) = get_vault_context(&state)?;
    let updated_at = now_ms();
    let doc = Document {
        id,
        title,
        content,
        updated_at,
    };
    write_doc(&app, is_decoy, &key, &doc)?;
    Ok(updated_at)
}

#[tauri::command]
pub fn rename_document(
    app: AppHandle,
    state: tauri::State<VaultKeyState>,
    id: String,
    title: String,
) -> Result<(), String> {
    let (key, is_decoy) = get_vault_context(&state)?;
    let path = doc_path(&app, is_decoy, &id)?;
    let mut doc = read_doc(&path, &key)?;
    doc.title = title;
    doc.updated_at = now_ms();
    write_doc(&app, is_decoy, &key, &doc)
}

#[tauri::command]
pub fn delete_document(
    app: AppHandle,
    state: tauri::State<VaultKeyState>,
    id: String,
) -> Result<(), String> {
    let (_, is_decoy) = get_vault_context(&state)?;
    let path = doc_path(&app, is_decoy, &id)?;
    fs::remove_file(path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_payload_roundtrip() {
        let key = [1u8; 32];
        let payload = DocPayload {
            title: "My Diary".to_string(),
            content: "Dear diary, today I fixed a linker error.".to_string(),
            updated_at: 1234567890,
        };
        let (nonce, ciphertext) = encrypt_payload(&key, &payload).unwrap();
        let decrypted = decrypt_payload(&key, &nonce, &ciphertext).unwrap();
        assert_eq!(decrypted.title, payload.title);
        assert_eq!(decrypted.content, payload.content);
        assert_eq!(decrypted.updated_at, payload.updated_at);
    }

    #[test]
    fn decrypt_fails_with_wrong_key() {
        let key = [1u8; 32];
        let wrong_key = [2u8; 32];
        let payload = DocPayload {
            title: "Secret".to_string(),
            content: "Confidential content".to_string(),
            updated_at: 0,
        };
        let (nonce, ciphertext) = encrypt_payload(&key, &payload).unwrap();
        assert!(decrypt_payload(&wrong_key, &nonce, &ciphertext).is_err());
    }

    /// The same file-shape write_doc/read_doc produce, written to a real
    /// temp file and read back as raw bytes - not just the in-memory
    /// ciphertext string the sibling test below checks. This is what
    /// "vault file unreadable in a hex editor" and "no plaintext temp files
    /// during editing" actually mean in practice: a real file on a real
    /// filesystem, opened and grepped like a nosy attacker would.
    /// Removes its directory on drop - including on panic/unwind from a
    /// failed assertion - so a broken assertion mid-test doesn't leak a
    /// temp dir on every failing run.
    struct CleanupOnDrop(std::path::PathBuf);
    impl Drop for CleanupOnDrop {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn saved_document_is_unreadable_as_a_real_file_on_disk() {
        let dir = std::env::temp_dir().join(format!(
            "securewrite_e2e_doc_{}_{}",
            std::process::id(),
            now_ms()
        ));
        fs::create_dir_all(&dir).unwrap();
        let _cleanup = CleanupOnDrop(dir.clone());
        let path = dir.join(format!("{}.json", uuid::Uuid::new_v4()));

        let key = [7u8; 32];
        let payload = DocPayload {
            title: "My Secret Plan".to_string(),
            content: "Nobody should be able to read this by opening the file.".to_string(),
            updated_at: now_ms(),
        };
        let (nonce, ciphertext) = encrypt_payload(&key, &payload).unwrap();
        let enc = EncryptedDocFile {
            id: "test-id".to_string(),
            nonce,
            ciphertext,
        };
        fs::write(&path, serde_json::to_string_pretty(&enc).unwrap()).unwrap();

        let raw = fs::read_to_string(&path).unwrap();
        assert!(!raw.contains("My Secret Plan"));
        assert!(!raw.contains("Nobody should be able to read this"));

        // Correct key round-trips through the real file; wrong key fails cleanly.
        let read_back: EncryptedDocFile = serde_json::from_str(&raw).unwrap();
        let decrypted = decrypt_payload(&key, &read_back.nonce, &read_back.ciphertext).unwrap();
        assert_eq!(decrypted.title, payload.title);
        assert_eq!(decrypted.content, payload.content);

        let wrong_key = [8u8; 32];
        let result = decrypt_payload(&wrong_key, &read_back.nonce, &read_back.ciphertext);
        assert!(result.is_err());
        let err = result.err().unwrap();
        assert!(!err.contains("My Secret Plan"));
    }

    #[test]
    fn ciphertext_does_not_contain_plaintext_content() {
        let key = [1u8; 32];
        let payload = DocPayload {
            title: "Very Distinctive Title Xyzzy".to_string(),
            content: "Extremely distinctive plaintext content Plugh12345".to_string(),
            updated_at: 0,
        };
        let (_, ciphertext) = encrypt_payload(&key, &payload).unwrap();
        assert!(!ciphertext.contains("Distinctive"));
        assert!(!ciphertext.contains("Plugh12345"));
    }
}
