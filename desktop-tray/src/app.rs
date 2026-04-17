use crate::autostart;
use crate::icon;
use crate::model::{AppEvent, PlatformStatus, TrayPlatformSnapshot, TrayQuotaUpdatePayload, APP_NAME, BRIDGE_PORT};
use anyhow::Result;
use chrono::{DateTime, Local, TimeZone};
use tray_icon::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    TrayIcon, TrayIconBuilder,
};

pub struct TrayApp {
    tray_icon: TrayIcon,
    copilot_item: MenuItem,
    chatgpt_item: MenuItem,
    kimi_item: MenuItem,
    updated_item: MenuItem,
    server_item: MenuItem,
    startup_item: MenuItem,
    exit_item: MenuItem,
    current_payload: Option<TrayQuotaUpdatePayload>,
    startup_enabled: bool,
}

impl TrayApp {
    pub fn new(payload: Option<TrayQuotaUpdatePayload>, startup_enabled: bool) -> Result<Self> {
        let menu = Menu::new();
        let copilot_item = MenuItem::new("GitHub Copilot: waiting for data", false, None);
        let chatgpt_item = MenuItem::new("ChatGPT / Codex: waiting for data", false, None);
        let kimi_item = MenuItem::new("Kimi: waiting for data", false, None);
        let updated_item = MenuItem::new("Last sync: never", false, None);
        let server_item = MenuItem::new(
            format!("Listening on http://127.0.0.1:{BRIDGE_PORT}"),
            false,
            None,
        );
        let startup_item = MenuItem::new(startup_label(startup_enabled), true, None);
        let exit_item = MenuItem::new("Exit", true, None);

        menu.append(&copilot_item)?;
        menu.append(&chatgpt_item)?;
        menu.append(&kimi_item)?;
        menu.append(&PredefinedMenuItem::separator())?;
        menu.append(&updated_item)?;
        menu.append(&server_item)?;
        menu.append(&PredefinedMenuItem::separator())?;
        menu.append(&startup_item)?;
        menu.append(&exit_item)?;

        let tray_icon = TrayIconBuilder::new()
            .with_menu(Box::new(menu))
            .with_tooltip(APP_NAME)
            .with_icon(icon::build_icon(&payload_platforms(&payload))?)
            .build()?;

        let mut app = Self {
            tray_icon,
            copilot_item,
            chatgpt_item,
            kimi_item,
            updated_item,
            server_item,
            startup_item,
            exit_item,
            current_payload: payload,
            startup_enabled,
        };
        app.refresh_ui()?;
        Ok(app)
    }

    pub fn refresh_runtime_status(&mut self) {
        let _ = self.server_item.set_text(format!("Listening on http://127.0.0.1:{BRIDGE_PORT}"));
    }

    pub fn handle_app_event(&mut self, event: AppEvent) -> bool {
        match event {
            AppEvent::PayloadUpdated(payload) => {
                self.current_payload = Some(payload);
                let _ = self.refresh_ui();
                false
            }
            AppEvent::ServerError(message) => {
                let _ = self.server_item.set_text(message);
                false
            }
            AppEvent::StartupChanged(result) => {
                match result {
                    Ok(enabled) => {
                        self.startup_enabled = enabled;
                        let _ = self.startup_item.set_text(startup_label(enabled));
                    }
                    Err(error) => {
                        let _ = self.server_item.set_text(format!("Startup toggle failed: {error}"));
                    }
                }
                false
            }
        }
    }

    pub fn handle_menu_events(&mut self) -> bool {
        while let Ok(event) = MenuEvent::receiver().try_recv() {
            if event.id == self.exit_item.id() {
                return true;
            }

            if event.id == self.startup_item.id() {
                let result = autostart::set_enabled(!self.startup_enabled).map_err(|error| error.to_string());
                let _ = self.handle_app_event(AppEvent::StartupChanged(result));
            }
        }

        false
    }

    fn refresh_ui(&mut self) -> Result<()> {
        let platforms = payload_platforms(&self.current_payload);
        let tooltip = build_tooltip(&platforms);

        self.tray_icon.set_tooltip(Some(tooltip))?;
        self.tray_icon.set_icon(Some(icon::build_icon(&platforms)?))?;

        let copilot = find_platform(&platforms, "github-copilot", "GitHub Copilot");
        let chatgpt = find_platform(&platforms, "chatgpt", "ChatGPT / Codex");
        let kimi = find_platform(&platforms, "kimi", "Kimi");

        self.copilot_item.set_text(platform_menu_label(copilot));
        self.chatgpt_item.set_text(platform_menu_label(chatgpt));
        self.kimi_item.set_text(platform_menu_label(kimi));
        self.updated_item.set_text(last_sync_label(self.current_payload.as_ref()));
        self.startup_item.set_text(startup_label(self.startup_enabled));

        Ok(())
    }
}

fn startup_label(enabled: bool) -> String {
    if enabled {
        "Disable launch at login".to_string()
    } else {
        "Enable launch at login".to_string()
    }
}

fn payload_platforms(payload: &Option<TrayQuotaUpdatePayload>) -> Vec<TrayPlatformSnapshot> {
    payload
        .as_ref()
        .map(|payload| payload.platforms.clone())
        .unwrap_or_default()
}

fn find_platform<'a>(
    platforms: &'a [TrayPlatformSnapshot],
    id: &str,
    fallback_name: &'a str,
) -> TrayPlatformSnapshot {
    platforms
        .iter()
        .find(|platform| platform.id == id)
        .cloned()
        .unwrap_or_else(|| TrayPlatformSnapshot {
            id: id.to_string(),
            name: fallback_name.to_string(),
            enabled: false,
            status: PlatformStatus::NotLogin,
            remaining_percentage: None,
            used_percentage: None,
            last_updated: None,
            error_message: None,
        })
}

fn build_tooltip(platforms: &[TrayPlatformSnapshot]) -> String {
    let order = [
        find_platform(platforms, "github-copilot", "GitHub Copilot"),
        find_platform(platforms, "chatgpt", "ChatGPT / Codex"),
        find_platform(platforms, "kimi", "Kimi"),
    ];

    order
        .iter()
        .map(|platform| {
            let short_name = if platform.id == "github-copilot" {
                "Copilot"
            } else if platform.id == "chatgpt" {
                "ChatGPT"
            } else {
                "Kimi"
            };

            match platform.remaining_percentage {
                Some(value) if platform.enabled => format!("{short_name} {}%", value.round() as i64),
                _ if !platform.enabled => format!("{short_name} off"),
                _ => format!("{short_name} --"),
            }
        })
        .collect::<Vec<_>>()
        .join(" | ")
}

fn platform_menu_label(platform: TrayPlatformSnapshot) -> String {
    if !platform.enabled {
        return format!("{}: disabled", platform.name);
    }

    if let Some(remaining) = platform.remaining_percentage {
        return format!("{}: {}% remaining", platform.name, remaining.round() as i64);
    }

    match platform.status {
        PlatformStatus::NotLogin => format!("{}: login required", platform.name),
        PlatformStatus::Error => format!(
            "{}: {}",
            platform.name,
            platform
                .error_message
                .as_deref()
                .unwrap_or("sync error")
        ),
        _ => format!("{}: waiting for data", platform.name),
    }
}

fn last_sync_label(payload: Option<&TrayQuotaUpdatePayload>) -> String {
    let Some(payload) = payload else {
        return "Last sync: never".to_string();
    };

    let datetime: Option<DateTime<Local>> = Local.timestamp_millis_opt(payload.generated_at).single();
    match datetime {
        Some(value) => format!("Last sync: {}", value.format("%Y-%m-%d %H:%M:%S")),
        None => "Last sync: unknown".to_string(),
    }
}
