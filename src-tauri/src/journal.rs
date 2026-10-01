use crate::crypto::{get_vault_context, VaultKeyState};
use crate::documents::{decrypt_payload, encrypt_payload, now_ms};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// One slice of an entry's time, e.g. "Math" 90 minutes inside a 3h
/// "Studies" entry. Parts may sum to less than the entry's total - the
/// remainder is time logged against the activity in general.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct JournalPart {
    pub name: String,
    pub minutes: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    /// Empty on a brand new entry - save_journal_entry assigns one.
    #[serde(default)]
    pub id: String,
    /// "time" (activity + duration) or "note" (free-form journal writing,
    /// no activity or duration). Entries saved before notes existed are "time".
    #[serde(default = "default_kind")]
    pub kind: String,
    /// Local calendar day, YYYY-MM-DD.
    pub date: String,
    #[serde(default)]
    pub activity: String,
    #[serde(default)]
    pub minutes: u32,
    /// Optional heading for notes.
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub parts: Vec<JournalPart>,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
}

fn default_kind() -> String {
    "time".to_string()
}

/// Same shape as documents.rs's EncryptedDocFile: only the random id is
/// plaintext, everything else (date, activity, durations, note) is
/// ciphertext - a timeline of what you did when is as private as the notes.
#[derive(Serialize, Deserialize)]
struct EncryptedEntryFile {
    id: String,
    nonce: String,
    ciphertext: String,
}

/// Separate real/decoy directories, like documents_dir - the duress vault
/// must never touch the real journal.
fn journal_dir(app: &AppHandle, is_decoy: bool) -> Result<PathBuf, String> {
    let name = if is_decoy { "journal_decoy" } else { "journal" };
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Ids become filenames, so anything but a real UUID is rejected before it
/// can be joined onto a path.
fn entry_path(app: &AppHandle, is_decoy: bool, id: &str) -> Result<PathBuf, String> {
    let id = uuid::Uuid::parse_str(id).map_err(|_| "Invalid entry id".to_string())?;
    Ok(journal_dir(app, is_decoy)?.join(format!("{id}.json")))
}

/// See documents::clear_decoy_documents - called when the duress password is
/// (re)set and the decoy key changes.
pub fn clear_decoy_journal(app: &AppHandle) -> Result<(), String> {
    let dir = journal_dir(app, true)?;
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        fs::remove_file(entry.path()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn is_valid_date(date: &str) -> bool {
    let b = date.as_bytes();
    b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b.iter()
            .enumerate()
            .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

/// Trims names, drops empty/zero parts, and makes sure the total is at least
/// the sum of its parts - so stats never see a breakdown bigger than its whole.
fn normalize(mut entry: JournalEntry) -> Result<JournalEntry, String> {
    if !is_valid_date(&entry.date) {
        return Err("Invalid date".to_string());
    }
    entry.title = entry.title.trim().to_string();
    if entry.kind == "note" {
        if entry.title.is_empty() && entry.note.trim().is_empty() {
            return Err("Write something first".to_string());
        }
        entry.activity = String::new();
        entry.minutes = 0;
        entry.parts = Vec::new();
        return Ok(entry);
    }
    entry.kind = "time".to_string();
    entry.activity = entry.activity.trim().to_string();
    if entry.activity.is_empty() {
        return Err("Activity is required".to_string());
    }
    entry.parts = entry
        .parts
        .into_iter()
        .map(|p| JournalPart {
            name: p.name.trim().to_string(),
            minutes: p.minutes,
        })
        .filter(|p| !p.name.is_empty() && p.minutes > 0)
        .collect();
    let parts_total: u32 = entry.parts.iter().map(|p| p.minutes).sum();
    entry.minutes = entry.minutes.max(parts_total);
    Ok(entry)
}

fn read_entry(path: &PathBuf, key: &[u8]) -> Result<JournalEntry, String> {
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let enc: EncryptedEntryFile = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let mut entry: JournalEntry = decrypt_payload(key, &enc.nonce, &enc.ciphertext)?;
    entry.id = enc.id;
    Ok(entry)
}

fn write_entry(path: &PathBuf, key: &[u8], entry: &JournalEntry) -> Result<(), String> {
    let (nonce, ciphertext) = encrypt_payload(key, entry)?;
    let enc = EncryptedEntryFile {
        id: entry.id.clone(),
        nonce,
        ciphertext,
    };
    let raw = serde_json::to_string_pretty(&enc).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_journal_entries(
    app: AppHandle,
    state: tauri::State<VaultKeyState>,
) -> Result<Vec<JournalEntry>, String> {
    let (key, is_decoy) = get_vault_context(&state)?;
    let dir = journal_dir(&app, is_decoy)?;
    let mut entries = Vec::new();
    for item in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let path = item.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            // skip entries that fail to decrypt rather than fail the whole list
            if let Ok(entry) = read_entry(&path, &key) {
                entries.push(entry);
            }
        }
    }
    entries.sort_by(|a, b| b.date.cmp(&a.date).then(b.created_at.cmp(&a.created_at)));
    Ok(entries)
}

/// Creates the entry when its id is empty, otherwise overwrites it.
#[tauri::command]
pub fn save_journal_entry(
    app: AppHandle,
    state: tauri::State<VaultKeyState>,
    entry: JournalEntry,
) -> Result<JournalEntry, String> {
    let (key, is_decoy) = get_vault_context(&state)?;
    let mut entry = normalize(entry)?;
    let now = now_ms();
    if entry.id.is_empty() {
        entry.id = uuid::Uuid::new_v4().to_string();
    }
    if entry.created_at == 0 {
        entry.created_at = now;
    }
    entry.updated_at = now;
    write_entry(&entry_path(&app, is_decoy, &entry.id)?, &key, &entry)?;
    Ok(entry)
}

#[tauri::command]
pub fn delete_journal_entry(
    app: AppHandle,
    state: tauri::State<VaultKeyState>,
    id: String,
) -> Result<(), String> {
    let (_, is_decoy) = get_vault_context(&state)?;
    fs::remove_file(entry_path(&app, is_decoy, &id)?).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> JournalEntry {
        JournalEntry {
            id: String::new(),
            kind: String::new(),
            date: "2026-09-30".to_string(),
            activity: "  Studies ".to_string(),
            minutes: 60,
            title: String::new(),
            parts: vec![
                JournalPart { name: "Math".to_string(), minutes: 90 },
                JournalPart { name: "Physics".to_string(), minutes: 60 },
                JournalPart { name: " ".to_string(), minutes: 30 },
                JournalPart { name: "Philosophy".to_string(), minutes: 0 },
            ],
            note: "Integrals, then optics".to_string(),
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn normalize_trims_drops_empty_parts_and_grows_total() {
        let entry = normalize(sample()).unwrap();
        assert_eq!(entry.kind, "time");
        assert_eq!(entry.activity, "Studies");
        assert_eq!(entry.parts.len(), 2);
        assert_eq!(entry.minutes, 150);
    }

    #[test]
    fn normalize_rejects_bad_input() {
        let mut e = sample();
        e.activity = "   ".to_string();
        assert!(normalize(e).is_err());
        let mut e = sample();
        e.date = "30.09.2026".to_string();
        assert!(normalize(e).is_err());
    }

    #[test]
    fn notes_need_text_and_drop_time_fields() {
        let mut e = sample();
        e.kind = "note".to_string();
        e.note = "Dear diary".to_string();
        let n = normalize(e).unwrap();
        assert_eq!(n.kind, "note");
        assert!(n.activity.is_empty() && n.parts.is_empty() && n.minutes == 0);
        let mut e = sample();
        e.kind = "note".to_string();
        e.note = "  ".to_string();
        assert!(normalize(e).is_err());
    }

    #[test]
    fn entries_saved_before_kinds_existed_load_as_time() {
        let old = r#"{"date":"2026-09-30","activity":"Gym","minutes":60}"#;
        let e: JournalEntry = serde_json::from_str(old).unwrap();
        assert_eq!(e.kind, "time");
    }

    #[test]
    fn entry_roundtrips_encrypted_without_plaintext() {
        let key = [3u8; 32];
        let entry = normalize(sample()).unwrap();
        let (nonce, ciphertext) = encrypt_payload(&key, &entry).unwrap();
        assert!(!ciphertext.contains("Integrals"));
        assert!(!ciphertext.contains("Studies"));
        let back: JournalEntry = decrypt_payload(&key, &nonce, &ciphertext).unwrap();
        assert_eq!(back, entry);
        assert!(decrypt_payload::<JournalEntry>(&[4u8; 32], &nonce, &ciphertext).is_err());
    }
}
