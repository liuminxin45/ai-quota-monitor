use crate::model::{ApiResponse, AppEvent, RuntimePaths, TrayQuotaUpdatePayload, BRIDGE_PORT};
use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use std::{net::SocketAddr, sync::Arc, thread};
use tao::event_loop::EventLoopProxy;

#[derive(Clone)]
struct ServerState {
    proxy: EventLoopProxy<AppEvent>,
    runtime_paths: Arc<RuntimePaths>,
}

pub fn spawn(proxy: EventLoopProxy<AppEvent>, runtime_paths: RuntimePaths) {
    thread::spawn(move || {
        let runtime = match tokio::runtime::Runtime::new() {
            Ok(runtime) => runtime,
            Err(error) => {
                let _ = proxy.send_event(AppEvent::ServerError(format!("Failed to create runtime: {error}")));
                return;
            }
        };

        runtime.block_on(async move {
            let state = ServerState {
                proxy: proxy.clone(),
                runtime_paths: Arc::new(runtime_paths),
            };
            let app = Router::new()
                .route("/api/health", get(health))
                .route("/api/quota-update", post(update_quota))
                .with_state(state);

            let addr = SocketAddr::from(([127, 0, 0, 1], BRIDGE_PORT));
            let listener = match tokio::net::TcpListener::bind(addr).await {
                Ok(listener) => listener,
                Err(error) => {
                    let _ = proxy.send_event(AppEvent::ServerError(format!(
                        "Port {BRIDGE_PORT} is unavailable: {error}"
                    )));
                    return;
                }
            };

            if let Err(error) = axum::serve(listener, app).await {
                let _ = proxy.send_event(AppEvent::ServerError(format!("Tray server stopped: {error}")));
            }
        });
    });
}

async fn health() -> Json<ApiResponse> {
    Json(ApiResponse {
        ok: true,
        error: None,
    })
}

async fn update_quota(
    State(state): State<ServerState>,
    Json(payload): Json<TrayQuotaUpdatePayload>,
) -> impl IntoResponse {
    if let Err(error) = state.runtime_paths.save_payload(&payload) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse {
                ok: false,
                error: Some(format!("Failed to persist payload: {error}")),
            }),
        );
    }

    let _ = state.proxy.send_event(AppEvent::PayloadUpdated(payload));

    (
        StatusCode::OK,
        Json(ApiResponse {
            ok: true,
            error: None,
        }),
    )
}
