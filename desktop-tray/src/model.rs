use anyhow::{Context, Result};
use dirs::data_local_dir;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

pub const BRIDGE_PORT: u16 = 38431;
pub const APP_NAME: &str = "AI Monitor Tray";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlatformStatus {
    Ok,
    Warning,
    Danger,
    NotLogin,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayPlatformSnapshot {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub status: PlatformStatus,
    pub remaining_percentage: Option<f64>,
    pub used_percentage: Option<f64>,
    pub last_updated: Option<i64>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayQuotaUpdatePayload {
    pub platforms: Vec<TrayPlatformSnapshot>,
    pub generated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ApiResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
pub enum AppEvent {
    PayloadUpdated(TrayQuotaUpdatePayload),
    ServerError(String),
    StartupChanged(Result<bool, String>),
}

#[derive(Debug, Clone)]
pub struct RuntimePaths {
    pub cache_file: PathBuf,
}

impl RuntimePaths {
    pub fn new() -> Result<Self> {
        let base = data_local_dir()
            .context("failed to resolve LocalAppData")?
            .join("AI Monitor")
            .join("tray");
        fs::create_dir_all(&base)?;

        Ok(Self {
            cache_file: base.join("tray-state.json"),
        })
    }

    pub fn save_payload(&self, payload: &TrayQuotaUpdatePayload) -> Result<()> {
        let content = serde_json::to_vec_pretty(payload)?;
        fs::write(&self.cache_file, content)?;
        Ok(())
    }

    pub fn load_payload(&self) -> Option<TrayQuotaUpdatePayload> {
        let content = fs::read(&self.cache_file).ok()?;
        serde_json::from_slice(&content).ok()
    }
}
