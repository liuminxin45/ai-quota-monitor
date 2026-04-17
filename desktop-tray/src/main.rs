#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod autostart;
mod icon;
mod model;
mod server;

use anyhow::Result;
use app::TrayApp;
use model::{AppEvent, RuntimePaths};
use tao::event::{Event, StartCause};
use tao::event_loop::{ControlFlow, EventLoopBuilder};

fn main() -> Result<()> {
    let runtime_paths = RuntimePaths::new()?;
    let cached_payload = runtime_paths.load_payload();
    let startup_enabled = autostart::is_enabled().unwrap_or(false);

    let event_loop = EventLoopBuilder::<AppEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();

    let mut tray_app = TrayApp::new(cached_payload, startup_enabled)?;
    server::spawn(proxy, runtime_paths.clone());

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        match event {
            Event::NewEvents(StartCause::Init) => {
                tray_app.refresh_runtime_status();
            }
            Event::UserEvent(app_event) => {
                if tray_app.handle_app_event(app_event) {
                    *control_flow = ControlFlow::Exit;
                }
            }
            Event::MainEventsCleared => {
                if tray_app.handle_menu_events() {
                    *control_flow = ControlFlow::Exit;
                }
            }
            _ => {}
        }
    });
}
