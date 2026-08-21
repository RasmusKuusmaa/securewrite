use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub idle_timeout_minutes: u32,
    pub lock_on_blur: bool,
    #[serde(default = "default_flow_pause_seconds")]
    pub flow_pause_seconds: u32,
    #[serde(default)]
    pub flow_hardcore: bool,
}

fn default_flow_pause_seconds() -> u32 {
    6
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            idle_timeout_minutes: 10,
            lock_on_blur: false,
            flow_pause_seconds: 6,
            flow_hardcore: false,
        }
    }
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<Settings, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(Settings::default());
    }
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(settings_path(&app)?, raw).map_err(|e| e.to_string())
}
