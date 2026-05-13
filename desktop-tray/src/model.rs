use anyhow::{Context, Result};
use dirs::data_local_dir;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

pub const BRIDGE_PORT: u16 = 38431;
pub const APP_NAME: &str = "AI Monitor Tray";
pub const DEFAULT_REFRESH_INTERVAL_SECONDS: u64 = 30 * 60;
pub const MIN_REFRESH_INTERVAL_SECONDS: u64 = 5 * 60;
pub const MAX_REFRESH_INTERVAL_SECONDS: u64 = 12 * 60 * 60;

const DEFAULT_PLATFORM_IDS: [&str; 3] = ["github-copilot", "chatgpt", "kimi"];

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
pub struct AppSettings {
    pub auto_refresh: bool,
    pub refresh_interval_seconds: u64,
    pub last_refresh_all_at: Option<i64>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            auto_refresh: true,
            refresh_interval_seconds: DEFAULT_REFRESH_INTERVAL_SECONDS,
            last_refresh_all_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayQuotaUpdatePayload {
    pub platforms: Vec<TrayPlatformSnapshot>,
    pub generated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default)]
    pub settings: AppSettings,
    pub platforms: Vec<TrayPlatformSnapshot>,
    pub generated_at: i64,
}

impl AppConfig {
    pub fn new_default() -> Self {
        Self {
            settings: AppSettings::default(),
            platforms: DEFAULT_PLATFORM_IDS
                .iter()
                .map(|id| default_platform(id))
                .collect(),
            generated_at: chrono::Local::now().timestamp_millis(),
        }
    }

    pub fn enabled_payload(&self) -> TrayQuotaUpdatePayload {
        TrayQuotaUpdatePayload {
            platforms: self
                .platforms
                .iter()
                .filter(|platform| platform.enabled)
                .cloned()
                .collect(),
            generated_at: self.generated_at,
        }
    }

    pub fn normalize(mut self) -> Self {
        for default_id in DEFAULT_PLATFORM_IDS {
            if !self
                .platforms
                .iter()
                .any(|platform| platform.id == default_id)
            {
                self.platforms.push(default_platform(default_id));
            }
        }

        for platform in &mut self.platforms {
            platform.status = status_for_platform(platform);
            if let Some(remaining) = platform.remaining_percentage {
                platform.remaining_percentage = Some(remaining.clamp(0.0, 100.0));
                platform.used_percentage =
                    Some(100.0 - platform.remaining_percentage.unwrap_or(0.0));
            } else if let Some(used) = platform.used_percentage {
                platform.used_percentage = Some(used.clamp(0.0, 100.0));
                platform.remaining_percentage =
                    Some(100.0 - platform.used_percentage.unwrap_or(0.0));
            }
        }

        self.settings.refresh_interval_seconds = self
            .settings
            .refresh_interval_seconds
            .clamp(MIN_REFRESH_INTERVAL_SECONDS, MAX_REFRESH_INTERVAL_SECONDS);

        self.generated_at = chrono::Local::now().timestamp_millis();
        self
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformDefinition {
    pub id: &'static str,
    pub name: &'static str,
    pub usage_url: &'static str,
    pub login_url: &'static str,
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
    OpenLogin(String),
    RefreshPlatform(String),
    RefreshAll,
    ScrapeFinished(WebScrapeResult),
}

#[derive(Debug, Clone)]
pub struct RuntimePaths {
    pub config_file: PathBuf,
    pub webview_data_dir: PathBuf,
}

impl RuntimePaths {
    pub fn new() -> Result<Self> {
        let base = data_local_dir()
            .context("failed to resolve LocalAppData")?
            .join("AI Monitor")
            .join("tray");
        fs::create_dir_all(&base)?;

        Ok(Self {
            config_file: base.join("tray-state.json"),
            webview_data_dir: base.join("webview-profile"),
        })
    }

    pub fn save_config(&self, config: &AppConfig) -> Result<()> {
        let content = serde_json::to_vec_pretty(config)?;
        fs::write(&self.config_file, content)?;
        Ok(())
    }

    pub fn load_config(&self) -> AppConfig {
        let Some(config) = self.try_load_config() else {
            let config = AppConfig::new_default();
            let _ = self.save_config(&config);
            return config;
        };

        let normalized = config.normalize();
        let _ = self.save_config(&normalized);
        normalized
    }

    pub fn load_payload(&self) -> Option<TrayQuotaUpdatePayload> {
        Some(self.load_config().enabled_payload())
    }

    fn try_load_config(&self) -> Option<AppConfig> {
        let content = fs::read(&self.config_file).ok()?;
        if let Ok(config) = serde_json::from_slice::<AppConfig>(&content) {
            return Some(config);
        }

        let legacy_payload = serde_json::from_slice::<TrayQuotaUpdatePayload>(&content).ok()?;
        Some(AppConfig {
            settings: AppSettings::default(),
            platforms: legacy_payload.platforms,
            generated_at: legacy_payload.generated_at,
        })
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebScrapeResult {
    pub platform_id: String,
    pub success: bool,
    pub used_percentage: Option<f64>,
    pub remaining_percentage: Option<f64>,
    pub error: Option<String>,
}

fn default_platform(id: &str) -> TrayPlatformSnapshot {
    let definition = platform_definition(id);

    TrayPlatformSnapshot {
        id: definition.id.to_string(),
        name: definition.name.to_string(),
        enabled: false,
        status: PlatformStatus::NotLogin,
        remaining_percentage: None,
        used_percentage: None,
        last_updated: None,
        error_message: None,
    }
}

pub fn platform_definition(id: &str) -> PlatformDefinition {
    match id {
        "github-copilot" => PlatformDefinition {
            id: "github-copilot",
            name: "GitHub Copilot",
            usage_url: "https://github.com/settings/copilot",
            login_url: "https://github.com/login",
        },
        "chatgpt" => PlatformDefinition {
            id: "chatgpt",
            name: "ChatGPT / Codex",
            usage_url: "https://chatgpt.com/codex/cloud/settings/usage",
            login_url: "https://chatgpt.com/",
        },
        "kimi" => PlatformDefinition {
            id: "kimi",
            name: "Kimi",
            usage_url: "https://www.kimi.com/code/console",
            login_url: "https://www.kimi.com/code/console",
        },
        _ => PlatformDefinition {
            id: "unknown",
            name: "Unknown",
            usage_url: "about:blank",
            login_url: "about:blank",
        },
    }
}

fn status_for_platform(platform: &TrayPlatformSnapshot) -> PlatformStatus {
    if !platform.enabled {
        return PlatformStatus::NotLogin;
    }

    match platform.remaining_percentage {
        Some(value) if value <= 10.0 => PlatformStatus::Danger,
        Some(value) if value <= 30.0 => PlatformStatus::Warning,
        Some(_) => PlatformStatus::Ok,
        None => PlatformStatus::NotLogin,
    }
}
