use aes_gcm::aead::{Aead, KeyInit, OsRng as AeadOsRng};
use aes_gcm::{Aes256Gcm, AeadCore, Key, Nonce};
use argon2::Argon2;
use base64::{engine::general_purpose::STANDARD, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use zeroize::Zeroizing;

const VAULT_KEY_LEN: usize = 32;
const SALT_LEN: usize = 16;
const RECOVERY_KEY_BYTES: usize = 16;

// Argon2id, OWASP "second recommended option" - higher memory cost, since
// this only runs on manual unlock (a handful of times a day) and can afford
// to spend ~0.5-1s making offline brute force of a stolen vault expensive.
const ARGON2_MEM_KIB: u32 = 65536; // 64 MiB
const ARGON2_TIME: u32 = 3;
const ARGON2_PARALLELISM: u32 = 4;

#[derive(Serialize, Deserialize, Clone)]
struct WrappedKey {
    nonce: String,
    ciphertext: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VaultFile {
    version: u32,
    password_salt: String,
    password_wrapped_key: WrappedKey,
    recovery_salt: String,
    recovery_wrapped_key: WrappedKey,
    #[serde(default)]
    failed_attempts: u32,
    #[serde(default)]
    locked_until: i64,
    /// Absent until setup_duress_password() is called - see that function
    /// for why this feature exists and how it stays hidden from the decoy.
    #[serde(default)]
    duress_salt: Option<String>,
    #[serde(default)]
    duress_wrapped_key: Option<WrappedKey>,
}

/// Holds the derived vault key in memory once unlocked, plus which vault it
/// unlocked into (real vs. the duress/decoy vault - see setup_duress_password).
/// `Zeroizing` scrubs the key on drop (lock, or app exit) so it doesn't
/// linger in process memory.
pub struct UnlockedVault {
    pub key: Zeroizing<Vec<u8>>,
    pub is_decoy: bool,
}

pub struct VaultKeyState(pub Mutex<Option<UnlockedVault>>);

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn vault_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("vault.json"))
}

fn read_vault(app: &AppHandle) -> Result<VaultFile, String> {
    let raw = fs::read_to_string(vault_path(app)?).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn write_vault(app: &AppHandle, vault: &VaultFile) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(vault).map_err(|e| e.to_string())?;
    fs::write(vault_path(app)?, raw).map_err(|e| e.to_string())
}

fn derive_key(secret: &[u8], salt: &[u8]) -> Result<[u8; VAULT_KEY_LEN], String> {
    let params = argon2::Params::new(
        ARGON2_MEM_KIB,
        ARGON2_TIME,
        ARGON2_PARALLELISM,
        Some(VAULT_KEY_LEN),
    )
    .map_err(|e| e.to_string())?;
    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
    let mut out = [0u8; VAULT_KEY_LEN];
    argon2
        .hash_password_into(secret, salt, &mut out)
        .map_err(|e| e.to_string())?;
    Ok(out)
}

fn aes_encrypt(key: &[u8], plaintext: &[u8]) -> Result<(Vec<u8>, Vec<u8>), String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Aes256Gcm::generate_nonce(&mut AeadOsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|_| "encryption failed".to_string())?;
    Ok((nonce.to_vec(), ciphertext))
}

fn aes_decrypt(key: &[u8], nonce: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(nonce);
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "decryption failed".to_string())
}

fn wrap_key(kek: &[u8], vault_key: &[u8]) -> Result<WrappedKey, String> {
    let (nonce, ciphertext) = aes_encrypt(kek, vault_key)?;
    Ok(WrappedKey {
        nonce: STANDARD.encode(nonce),
        ciphertext: STANDARD.encode(ciphertext),
    })
}

fn unwrap_key(kek: &[u8], wrapped: &WrappedKey) -> Result<Vec<u8>, String> {
    let nonce = STANDARD.decode(&wrapped.nonce).map_err(|e| e.to_string())?;
    let ciphertext = STANDARD
        .decode(&wrapped.ciphertext)
        .map_err(|e| e.to_string())?;
    aes_decrypt(kek, &nonce, &ciphertext)
}

fn format_recovery_key(bytes: &[u8]) -> String {
    hex::encode_upper(bytes)
        .as_bytes()
        .chunks(4)
        .map(|c| std::str::from_utf8(c).unwrap().to_string())
        .collect::<Vec<_>>()
        .join("-")
}

fn normalize_recovery_key(input: &str) -> Vec<u8> {
    let cleaned: String = input.chars().filter(|c| c.is_ascii_hexdigit()).collect();
    hex::decode(cleaned.to_uppercase()).unwrap_or_default()
}

pub fn is_initialized(app: &AppHandle) -> bool {
    vault_path(app).map(|p| p.exists()).unwrap_or(false)
}

#[tauri::command]
pub fn vault_status(
    app: AppHandle,
    state: tauri::State<VaultKeyState>,
) -> Result<serde_json::Value, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "initialized": is_initialized(&app),
        "unlocked": guard.is_some(),
        "isDecoy": guard.as_ref().map(|v| v.is_decoy).unwrap_or(false),
    }))
}

#[tauri::command]
pub fn setup_vault(
    app: AppHandle,
    state: tauri::State<VaultKeyState>,
    password: String,
) -> Result<String, String> {
    if is_initialized(&app) {
        return Err("Vault already set up".to_string());
    }
    if password.len() < 8 {
        return Err("Password must be at least 8 characters".to_string());
    }

    let mut vault_key = [0u8; VAULT_KEY_LEN];
    rand::rngs::OsRng.fill_bytes(&mut vault_key);

    let mut password_salt = [0u8; SALT_LEN];
    rand::rngs::OsRng.fill_bytes(&mut password_salt);
    let password_kek = derive_key(password.as_bytes(), &password_salt)?;
    let password_wrapped_key = wrap_key(&password_kek, &vault_key)?;

    let mut recovery_bytes = [0u8; RECOVERY_KEY_BYTES];
    rand::rngs::OsRng.fill_bytes(&mut recovery_bytes);
    let recovery_key_display = format_recovery_key(&recovery_bytes);

    let mut recovery_salt = [0u8; SALT_LEN];
    rand::rngs::OsRng.fill_bytes(&mut recovery_salt);
    let recovery_kek = derive_key(&recovery_bytes, &recovery_salt)?;
    let recovery_wrapped_key = wrap_key(&recovery_kek, &vault_key)?;

    let vault = VaultFile {
        version: 1,
        password_salt: STANDARD.encode(password_salt),
        password_wrapped_key,
        recovery_salt: STANDARD.encode(recovery_salt),
        recovery_wrapped_key,
        failed_attempts: 0,
        locked_until: 0,
        duress_salt: None,
        duress_wrapped_key: None,
    };
    write_vault(&app, &vault)?;

    *state.0.lock().map_err(|e| e.to_string())? = Some(UnlockedVault {
        key: Zeroizing::new(vault_key.to_vec()),
        is_decoy: false,
    });

    Ok(recovery_key_display)
}

/// Sets up (or replaces) the duress/decoy password. Only callable while
/// unlocked into the *real* vault - can't be configured from inside a decoy,
/// since that would mean an already-coerced unlock could be used to plant a
/// new decoy layer. Deliberately not exposed anywhere in the UI while
/// `is_decoy` is true, for the same reason: the existence of this feature
/// itself shouldn't be discoverable from inside the decoy.
///
/// Replacing an existing duress password generates a brand new decoy vault
/// key, which makes any previous decoy content permanently unreadable - this
/// is treated as an intentional "reset", not a bug; the UI must warn about
/// it before calling this.
#[tauri::command]
pub fn setup_duress_password(
    app: AppHandle,
    state: tauri::State<VaultKeyState>,
    duress_password: String,
) -> Result<(), String> {
    {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        let unlocked = guard.as_ref().ok_or_else(|| "Vault is locked".to_string())?;
        if unlocked.is_decoy {
            return Err("Not available".to_string());
        }
    }
    if duress_password.len() < 8 {
        return Err("Password must be at least 8 characters".to_string());
    }

    let mut vault = read_vault(&app)?;

    let mut decoy_vault_key = [0u8; VAULT_KEY_LEN];
    rand::rngs::OsRng.fill_bytes(&mut decoy_vault_key);

    let mut duress_salt = [0u8; SALT_LEN];
    rand::rngs::OsRng.fill_bytes(&mut duress_salt);
    let duress_kek = derive_key(duress_password.as_bytes(), &duress_salt)?;
    let duress_wrapped_key = wrap_key(&duress_kek, &decoy_vault_key)?;

    vault.duress_salt = Some(STANDARD.encode(duress_salt));
    vault.duress_wrapped_key = Some(duress_wrapped_key);
    write_vault(&app, &vault)?;
    crate::documents::clear_decoy_documents(&app)?;

    Ok(())
}

#[tauri::command]
pub fn has_duress_configured(app: AppHandle) -> Result<bool, String> {
    Ok(read_vault(&app)?.duress_wrapped_key.is_some())
}

/// Attempts after the 3rd failure incur exponentially increasing cooldowns
/// (capped at 5 minutes) before another Argon2 derivation is even attempted.
/// This only slows down the live app's unlock prompt - it can't stop
/// someone brute-forcing the vault file directly offline, which is what
/// Argon2id's cost itself defends against (see todo.md's threat model).
fn backoff_ms(failed_attempts: u32) -> i64 {
    if failed_attempts <= 3 {
        0
    } else {
        let exp = (failed_attempts - 3).min(10);
        let ms = 1000i64.saturating_mul(1i64 << exp);
        ms.min(5 * 60 * 1000)
    }
}

fn attempt_unlock(
    app: &AppHandle,
    state: &tauri::State<VaultKeyState>,
    get_salt: impl Fn(&VaultFile) -> String,
    get_wrapped: impl Fn(&VaultFile) -> WrappedKey,
    secret: &[u8],
) -> Result<(), String> {
    let mut vault = read_vault(app)?;
    let now = now_ms();
    if now < vault.locked_until {
        let wait_s = (vault.locked_until - now + 999) / 1000;
        return Err(format!("Too many attempts. Try again in {wait_s}s."));
    }

    let salt_b64 = get_salt(&vault);
    let wrapped_key = get_wrapped(&vault);
    let salt = STANDARD.decode(&salt_b64).map_err(|e| e.to_string())?;
    let kek = derive_key(secret, &salt)?;

    match unwrap_key(&kek, &wrapped_key) {
        Ok(vault_key) => {
            vault.failed_attempts = 0;
            vault.locked_until = 0;
            write_vault(app, &vault)?;
            *state.0.lock().map_err(|e| e.to_string())? = Some(UnlockedVault {
                key: Zeroizing::new(vault_key),
                is_decoy: false,
            });
            Ok(())
        }
        Err(_) => {
            vault.failed_attempts += 1;
            vault.locked_until = now + backoff_ms(vault.failed_attempts);
            write_vault(app, &vault)?;
            Err("Incorrect password or recovery key".to_string())
        }
    }
}

/// Tries the real password slot, then - if configured - the duress/decoy
/// slot, all from the same single password field. There is no separate
/// "duress mode" input anywhere in the UI for an observer to notice; the
/// only difference from the outside is which password was typed.
///
/// Not constant-time between the two checks: this app's threat model (see
/// todo.md) is casual/opportunistic access, not sophisticated timing-side-
/// channel analysis, and the duress feature's job is UI-level plausible
/// deniability during a live coerced unlock - not surviving that kind of
/// forensic scrutiny.
#[tauri::command]
pub fn unlock_with_password(
    app: AppHandle,
    state: tauri::State<VaultKeyState>,
    password: String,
) -> Result<(), String> {
    let mut vault = read_vault(&app)?;
    let now = now_ms();
    if now < vault.locked_until {
        let wait_s = (vault.locked_until - now + 999) / 1000;
        return Err(format!("Too many attempts. Try again in {wait_s}s."));
    }

    let real_salt = STANDARD
        .decode(&vault.password_salt)
        .map_err(|e| e.to_string())?;
    let real_kek = derive_key(password.as_bytes(), &real_salt)?;
    if let Ok(vault_key) = unwrap_key(&real_kek, &vault.password_wrapped_key) {
        vault.failed_attempts = 0;
        vault.locked_until = 0;
        write_vault(&app, &vault)?;
        *state.0.lock().map_err(|e| e.to_string())? = Some(UnlockedVault {
            key: Zeroizing::new(vault_key),
            is_decoy: false,
        });
        return Ok(());
    }

    if let (Some(duress_salt_b64), Some(duress_wrapped)) =
        (vault.duress_salt.clone(), vault.duress_wrapped_key.clone())
    {
        let duress_salt = STANDARD.decode(&duress_salt_b64).map_err(|e| e.to_string())?;
        let duress_kek = derive_key(password.as_bytes(), &duress_salt)?;
        if let Ok(decoy_key) = unwrap_key(&duress_kek, &duress_wrapped) {
            vault.failed_attempts = 0;
            vault.locked_until = 0;
            write_vault(&app, &vault)?;
            *state.0.lock().map_err(|e| e.to_string())? = Some(UnlockedVault {
                key: Zeroizing::new(decoy_key),
                is_decoy: true,
            });
            return Ok(());
        }
    }

    vault.failed_attempts += 1;
    vault.locked_until = now + backoff_ms(vault.failed_attempts);
    write_vault(&app, &vault)?;
    Err("Incorrect password or recovery key".to_string())
}

#[tauri::command]
pub fn unlock_with_recovery_key(
    app: AppHandle,
    state: tauri::State<VaultKeyState>,
    recovery_key: String,
) -> Result<(), String> {
    let bytes = normalize_recovery_key(&recovery_key);
    if bytes.len() != RECOVERY_KEY_BYTES {
        return Err("Incorrect password or recovery key".to_string());
    }
    attempt_unlock(
        &app,
        &state,
        |v| v.recovery_salt.clone(),
        |v| v.recovery_wrapped_key.clone(),
        &bytes,
    )
}

#[tauri::command]
pub fn lock_vault(state: tauri::State<VaultKeyState>) -> Result<(), String> {
    *state.0.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

/// Returns the unlocked vault key plus whether it's the real vault or the
/// duress/decoy one - callers that persist data (documents.rs) use the flag
/// to pick which directory to read/write.
pub fn get_vault_context(
    state: &tauri::State<VaultKeyState>,
) -> Result<(Zeroizing<Vec<u8>>, bool), String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let unlocked = guard.as_ref().ok_or_else(|| "Vault is locked".to_string())?;
    Ok((Zeroizing::new(unlocked.key.to_vec()), unlocked.is_decoy))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_key_is_deterministic_for_same_input() {
        let salt = [7u8; SALT_LEN];
        let a = derive_key(b"correct horse battery staple", &salt).unwrap();
        let b = derive_key(b"correct horse battery staple", &salt).unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn derive_key_differs_for_different_salt_or_secret() {
        let salt1 = [1u8; SALT_LEN];
        let salt2 = [2u8; SALT_LEN];
        let a = derive_key(b"password", &salt1).unwrap();
        let b = derive_key(b"password", &salt2).unwrap();
        let c = derive_key(b"different", &salt1).unwrap();
        assert_ne!(a, b);
        assert_ne!(a, c);
    }

    #[test]
    fn wrap_unwrap_roundtrip_recovers_original_key() {
        let kek = derive_key(b"my password", &[3u8; SALT_LEN]).unwrap();
        let vault_key = [42u8; VAULT_KEY_LEN];
        let wrapped = wrap_key(&kek, &vault_key).unwrap();
        let recovered = unwrap_key(&kek, &wrapped).unwrap();
        assert_eq!(recovered, vault_key);
    }

    #[test]
    fn unwrap_fails_with_wrong_key() {
        let correct_kek = derive_key(b"right password", &[4u8; SALT_LEN]).unwrap();
        let wrong_kek = derive_key(b"wrong password", &[4u8; SALT_LEN]).unwrap();
        let vault_key = [9u8; VAULT_KEY_LEN];
        let wrapped = wrap_key(&correct_kek, &vault_key).unwrap();
        assert!(unwrap_key(&wrong_kek, &wrapped).is_err());
    }

    #[test]
    fn password_and_recovery_keks_both_unwrap_the_same_vault_key() {
        // Mirrors setup_vault: one vault_key, wrapped twice under two
        // independently-derived keks, either must recover it.
        let vault_key = [5u8; VAULT_KEY_LEN];

        let password_kek = derive_key(b"a password", &[10u8; SALT_LEN]).unwrap();
        let password_wrapped = wrap_key(&password_kek, &vault_key).unwrap();

        let recovery_bytes = [11u8; RECOVERY_KEY_BYTES];
        let recovery_kek = derive_key(&recovery_bytes, &[12u8; SALT_LEN]).unwrap();
        let recovery_wrapped = wrap_key(&recovery_kek, &vault_key).unwrap();

        assert_eq!(unwrap_key(&password_kek, &password_wrapped).unwrap(), vault_key);
        assert_eq!(unwrap_key(&recovery_kek, &recovery_wrapped).unwrap(), vault_key);
    }

    #[test]
    fn recovery_key_format_roundtrips_through_normalize() {
        let bytes = [0xAB, 0xCD, 0xEF, 0x01, 0x23, 0x45, 0x67, 0x89, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17];
        let formatted = format_recovery_key(&bytes);
        assert!(formatted.contains('-'));
        let normalized = normalize_recovery_key(&formatted);
        assert_eq!(normalized, bytes);
    }

    #[test]
    fn normalize_recovery_key_is_case_and_whitespace_insensitive() {
        let bytes = [0xAB, 0xCD, 0xEF, 0x01, 0x23, 0x45, 0x67, 0x89, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17];
        let formatted = format_recovery_key(&bytes).to_lowercase().replace('-', " ");
        assert_eq!(normalize_recovery_key(&formatted), bytes);
    }

    #[test]
    fn real_and_duress_keks_cannot_unwrap_each_others_slot() {
        // Mirrors unlock_with_password: the real vault key and decoy vault
        // key are wrapped under independently-derived keks. Neither kek
        // should be able to unwrap the other's slot - otherwise a duress
        // unlock could accidentally expose the real vault, or vice versa.
        let real_vault_key = [1u8; VAULT_KEY_LEN];
        let decoy_vault_key = [2u8; VAULT_KEY_LEN];

        let real_kek = derive_key(b"real password", &[20u8; SALT_LEN]).unwrap();
        let real_wrapped = wrap_key(&real_kek, &real_vault_key).unwrap();

        let duress_kek = derive_key(b"duress password", &[21u8; SALT_LEN]).unwrap();
        let duress_wrapped = wrap_key(&duress_kek, &decoy_vault_key).unwrap();

        assert_eq!(unwrap_key(&real_kek, &real_wrapped).unwrap(), real_vault_key);
        assert!(unwrap_key(&real_kek, &duress_wrapped).is_err());

        assert_eq!(unwrap_key(&duress_kek, &duress_wrapped).unwrap(), decoy_vault_key);
        assert!(unwrap_key(&duress_kek, &real_wrapped).is_err());
    }

    #[test]
    fn backoff_is_zero_until_fourth_failure_then_grows_and_caps() {
        assert_eq!(backoff_ms(0), 0);
        assert_eq!(backoff_ms(3), 0);
        assert!(backoff_ms(4) > 0);
        assert!(backoff_ms(5) > backoff_ms(4));
        assert_eq!(backoff_ms(4), backoff_ms(4).min(5 * 60 * 1000));
        assert!(backoff_ms(20) <= 5 * 60 * 1000);
    }
}
