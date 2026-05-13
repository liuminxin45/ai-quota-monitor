use crate::autostart;
use crate::browser::BrowserController;
use crate::icon;
use crate::model::{
    AppEvent, PlatformStatus, RuntimePaths, TrayPlatformSnapshot, TrayQuotaUpdatePayload,
    WebScrapeResult, APP_NAME, BRIDGE_PORT,
};
use anyhow::Result;
use chrono::{DateTime, Local, TimeZone};
use std::collections::HashSet;
use tao::{
    event_loop::{EventLoopProxy, EventLoopWindowTarget},
    window::WindowId,
};
use tray_icon::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    TrayIcon, TrayIconBuilder,
};

pub struct TrayApp {
    tray_icon: TrayIcon,
    platform_items: Vec<MenuItem>,
    updated_item: MenuItem,
    server_item: MenuItem,
    config_item: MenuItem,
    startup_item: MenuItem,
    exit_item: MenuItem,
    current_payload: Option<TrayQuotaUpdatePayload>,
    startup_enabled: bool,
    runtime_paths: RuntimePaths,
    browser: BrowserController,
    refresh_in_flight: HashSet<String>,
}

impl TrayApp {
    pub fn new(
        runtime_paths: RuntimePaths,
        payload: Option<TrayQuotaUpdatePayload>,
        startup_enabled: bool,
    ) -> Result<Self> {
        let platforms = payload_platforms(&payload);
        let (menu, platform_items, updated_item, server_item, config_item, startup_item, exit_item) =
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
            config_item,
            startup_item,
            exit_item,
            current_payload: payload,
            startup_enabled,
            browser: BrowserController::new(&runtime_paths),
            runtime_paths,
            refresh_in_flight: HashSet::new(),
        };
        app.refresh_ui()?;
        Ok(app)
    }

    pub fn refresh_runtime_status(&mut self) {
        let _ = self
            .server_item
            .set_text(format!("Listening on http://127.0.0.1:{BRIDGE_PORT}"));
    }

    pub fn handle_app_event(
        &mut self,
        event: AppEvent,
        event_loop: &EventLoopWindowTarget<AppEvent>,
        proxy: EventLoopProxy<AppEvent>,
    ) -> bool {
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
            AppEvent::OpenLogin(platform_id) => {
                if let Err(error) = self.browser.open_login(&platform_id, event_loop, proxy) {
                    let _ = self
                        .server_item
                        .set_text(format!("Open login failed: {error}"));
                }
                false
            }
            AppEvent::RefreshPlatform(platform_id) => {
                self.start_platform_refresh(&platform_id, event_loop, proxy);
                false
            }
            AppEvent::RefreshAll => {
                let config = self.runtime_paths.load_config();
                for platform in config.platforms.iter().filter(|platform| platform.enabled) {
                    self.start_platform_refresh(&platform.id, event_loop, proxy.clone());
                }
                false
            }
            AppEvent::ScrapeFinished(result) => {
                self.finish_platform_refresh(result);
                false
            }
        }
    }

    pub fn handle_window_close(&mut self, window_id: WindowId) {
        self.browser.close_window(window_id);
    }

    pub fn handle_menu_events(&mut self) -> bool {
        while let Ok(event) = MenuEvent::receiver().try_recv() {
            if event.id == self.exit_item.id() {
                return true;
            }

            if event.id == self.startup_item.id() {
                let result = autostart::set_enabled(!self.startup_enabled)
                    .map_err(|error| error.to_string());
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
            }

            if event.id == self.config_item.id() {
                if let Err(error) = open_config_panel() {
                    let _ = self
                        .server_item
                        .set_text(format!("Open config failed: {error}"));
                }
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
        let (menu, platform_items, updated_item, server_item, config_item, startup_item, exit_item) =
            build_menu(
                &platforms,
                self.current_payload.as_ref(),
                self.startup_enabled,
            )?;
        self.tray_icon.set_menu(Some(Box::new(menu)));
        self.platform_items = platform_items;
        self.updated_item = updated_item;
        self.server_item = server_item;
        self.config_item = config_item;
        self.startup_item = startup_item;
        self.exit_item = exit_item;

        Ok(())
    }

    fn start_platform_refresh(
        &mut self,
        platform_id: &str,
        event_loop: &EventLoopWindowTarget<AppEvent>,
        proxy: EventLoopProxy<AppEvent>,
    ) {
        if !self.refresh_in_flight.insert(platform_id.to_string()) {
            return;
        }

        if let Err(error) = self
            .browser
            .refresh_platform(platform_id, event_loop, proxy)
        {
            self.refresh_in_flight.remove(platform_id);
            self.apply_scrape_result(WebScrapeResult {
                platform_id: platform_id.to_string(),
                success: false,
                used_percentage: None,
                remaining_percentage: None,
                error: Some(error.to_string()),
            });
        }
    }

    fn finish_platform_refresh(&mut self, result: WebScrapeResult) {
        self.refresh_in_flight.remove(&result.platform_id);
        self.browser.finish_refresh(&result.platform_id);
        self.apply_scrape_result(result);
    }

    fn apply_scrape_result(&mut self, result: WebScrapeResult) {
        let mut config = self.runtime_paths.load_config();
        let now = Local::now().timestamp_millis();
        if let Some(platform) = config
            .platforms
            .iter_mut()
            .find(|platform| platform.id == result.platform_id)
        {
            platform.enabled = true;
            platform.last_updated = Some(now);
            if result.success {
                let remaining = result
                    .remaining_percentage
                    .or_else(|| result.used_percentage.map(|used| 100.0 - used))
                    .map(|value| value.clamp(0.0, 100.0));
                let used = result
                    .used_percentage
                    .or_else(|| remaining.map(|remaining| 100.0 - remaining))
                    .map(|value| value.clamp(0.0, 100.0));
                platform.remaining_percentage = remaining;
                platform.used_percentage = used;
                platform.error_message = None;
            } else {
                platform.status = PlatformStatus::Error;
                platform.error_message = result.error;
            }
        }

        config.settings.last_refresh_all_at = Some(now);
        let config = config.normalize();
        if let Err(error) = self.runtime_paths.save_config(&config) {
            let _ = self
                .server_item
                .set_text(format!("Save refresh result failed: {error}"));
            return;
        }

        self.current_payload = Some(config.enabled_payload());
        let _ = self.refresh_ui();
    }
}

fn build_menu(
    platforms: &[TrayPlatformSnapshot],
    payload: Option<&TrayQuotaUpdatePayload>,
    startup_enabled: bool,
) -> Result<(
    Menu,
    Vec<MenuItem>,
    MenuItem,
    MenuItem,
    MenuItem,
    MenuItem,
    MenuItem,
)> {
    let menu = Menu::new();
    let mut platform_items = Vec::new();

    if platforms.is_empty() {
        let item = MenuItem::new("未选择显示平台", false, None);
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
    let server_item = MenuItem::new("", false, None);
    let config_item = MenuItem::new("打开配置面板", true, None);
    let startup_item = MenuItem::new(startup_label(startup_enabled), true, None);
    let exit_item = MenuItem::new("退出", true, None);

    menu.append(&PredefinedMenuItem::separator())?;
    menu.append(&updated_item)?;
    menu.append(&PredefinedMenuItem::separator())?;
    menu.append(&config_item)?;
    menu.append(&startup_item)?;
    menu.append(&exit_item)?;

    Ok((
        menu,
        platform_items,
        updated_item,
        server_item,
        config_item,
        startup_item,
        exit_item,
    ))
}

fn startup_label(enabled: bool) -> String {
    if enabled {
        "开机自启：开".to_string()
    } else {
        "开机自启：关".to_string()
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
        return format!("{APP_NAME}：未选择显示平台");
    }

    platforms
        .iter()
        .map(|platform| {
            let short_name = short_platform_name(platform);

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
        return format!("{} 已隐藏", short_platform_name(platform));
    }

    if let Some(remaining) = platform.remaining_percentage {
        return format!(
            "{} {}%",
            short_platform_name(platform),
            remaining.round() as i64
        );
    }

    match platform.status {
        PlatformStatus::NotLogin => format!("{} 未登录", short_platform_name(platform)),
        PlatformStatus::Error => format!("{} 刷新失败", short_platform_name(platform)),
        _ => format!("{} 等待数据", short_platform_name(platform)),
    }
}

fn last_sync_label(payload: Option<&TrayQuotaUpdatePayload>) -> String {
    let Some(payload) = payload else {
        return "同步：暂无".to_string();
    };

    let datetime: Option<DateTime<Local>> =
        Local.timestamp_millis_opt(payload.generated_at).single();
    match datetime {
        Some(value) => format!("同步：{}", value.format("%m-%d %H:%M")),
        None => "同步：未知".to_string(),
    }
}

fn short_platform_name(platform: &TrayPlatformSnapshot) -> &'static str {
    match platform.id.as_str() {
        "github-copilot" => "Copilot",
        "chatgpt" => "ChatGPT",
        "kimi" => "Kimi",
        _ => "平台",
    }
}

fn open_config_panel() -> Result<()> {
    let url = format!("http://127.0.0.1:{BRIDGE_PORT}/");

    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(&url).spawn()?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(&url).spawn()?;
        return Ok(());
    }
}
