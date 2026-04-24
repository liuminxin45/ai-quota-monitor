use crate::autostart;
use crate::icon;
use crate::model::{
    AppEvent, PlatformStatus, TrayPlatformSnapshot, TrayQuotaUpdatePayload, APP_NAME, BRIDGE_PORT,
};
use anyhow::Result;
use chrono::{DateTime, Local, TimeZone};
use tray_icon::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    TrayIcon, TrayIconBuilder,
};

pub struct TrayApp {
    tray_icon: TrayIcon,
    platform_items: Vec<MenuItem>,
    updated_item: MenuItem,
    server_item: MenuItem,
    startup_item: MenuItem,
    exit_item: MenuItem,
    current_payload: Option<TrayQuotaUpdatePayload>,
    startup_enabled: bool,
}

impl TrayApp {
    pub fn new(payload: Option<TrayQuotaUpdatePayload>, startup_enabled: bool) -> Result<Self> {
        let platforms = payload_platforms(&payload);
        let (menu, platform_items, updated_item, server_item, startup_item, exit_item) =
            build_menu(&platforms, payload.as_ref(), startup_enabled)?;

        let tray_icon = TrayIconBuilder::new()
            .with_menu(Box::new(menu))
            .with_tooltip(APP_NAME)
            .with_icon(icon::build_icon(&platforms)?)
            .build()?;

        let mut app = Self {
            tray_icon,
            platform_items,
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
        let _ = self
            .server_item
            .set_text(format!("Listening on http://127.0.0.1:{BRIDGE_PORT}"));
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
                        let _ = self
                            .server_item
                            .set_text(format!("Startup toggle failed: {error}"));
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
                let result = autostart::set_enabled(!self.startup_enabled)
                    .map_err(|error| error.to_string());
                let _ = self.handle_app_event(AppEvent::StartupChanged(result));
            }
        }

        false
    }

    fn refresh_ui(&mut self) -> Result<()> {
        let platforms = payload_platforms(&self.current_payload);
        let tooltip = build_tooltip(&platforms);

        self.tray_icon.set_tooltip(Some(tooltip))?;
        self.tray_icon
            .set_icon(Some(icon::build_icon(&platforms)?))?;
        let (menu, platform_items, updated_item, server_item, startup_item, exit_item) =
            build_menu(
                &platforms,
                self.current_payload.as_ref(),
                self.startup_enabled,
            )?;
        self.tray_icon.set_menu(Some(Box::new(menu)));
        self.platform_items = platform_items;
        self.updated_item = updated_item;
        self.server_item = server_item;
        self.startup_item = startup_item;
        self.exit_item = exit_item;

        Ok(())
    }
}

fn build_menu(
    platforms: &[TrayPlatformSnapshot],
    payload: Option<&TrayQuotaUpdatePayload>,
    startup_enabled: bool,
) -> Result<(Menu, Vec<MenuItem>, MenuItem, MenuItem, MenuItem, MenuItem)> {
    let menu = Menu::new();
    let mut platform_items = Vec::new();

    if platforms.is_empty() {
        let item = MenuItem::new("No platforms added", false, None);
        menu.append(&item)?;
        platform_items.push(item);
    } else {
        for platform in platforms {
            let item = MenuItem::new(platform_menu_label(platform), false, None);
            menu.append(&item)?;
            platform_items.push(item);
        }
    }

    let updated_item = MenuItem::new(last_sync_label(payload), false, None);
    let server_item = MenuItem::new(
        format!("Listening on http://127.0.0.1:{BRIDGE_PORT}"),
        false,
        None,
    );
    let startup_item = MenuItem::new(startup_label(startup_enabled), true, None);
    let exit_item = MenuItem::new("Exit", true, None);

    menu.append(&PredefinedMenuItem::separator())?;
    menu.append(&updated_item)?;
    menu.append(&server_item)?;
    menu.append(&PredefinedMenuItem::separator())?;
    menu.append(&startup_item)?;
    menu.append(&exit_item)?;

    Ok((
        menu,
        platform_items,
        updated_item,
        server_item,
        startup_item,
        exit_item,
    ))
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
        .map(|payload| {
            payload
                .platforms
                .iter()
                .filter(|platform| platform.enabled)
                .cloned()
                .collect()
        })
        .unwrap_or_default()
}

fn build_tooltip(platforms: &[TrayPlatformSnapshot]) -> String {
    if platforms.is_empty() {
        return format!("{APP_NAME}: no platforms added");
    }

    platforms
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
                Some(value) if platform.enabled => {
                    format!("{short_name} {}%", value.round() as i64)
                }
                _ if !platform.enabled => format!("{short_name} off"),
                _ => format!("{short_name} --"),
            }
        })
        .collect::<Vec<_>>()
        .join(" | ")
}

fn platform_menu_label(platform: &TrayPlatformSnapshot) -> String {
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
            platform.error_message.as_deref().unwrap_or("sync error")
        ),
        _ => format!("{}: waiting for data", platform.name),
    }
}

fn last_sync_label(payload: Option<&TrayQuotaUpdatePayload>) -> String {
    let Some(payload) = payload else {
        return "Last sync: never".to_string();
    };

    let datetime: Option<DateTime<Local>> =
        Local.timestamp_millis_opt(payload.generated_at).single();
    match datetime {
        Some(value) => format!("Last sync: {}", value.format("%Y-%m-%d %H:%M:%S")),
        None => "Last sync: unknown".to_string(),
    }
}
