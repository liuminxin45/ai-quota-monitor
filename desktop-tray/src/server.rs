use crate::autostart;
use crate::model::{ApiResponse, AppConfig, AppEvent, RuntimePaths, BRIDGE_PORT};
use axum::{
    extract::State,
    http::StatusCode,
    response::{Html, IntoResponse},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{net::SocketAddr, sync::Arc, thread, time::Duration};
use tao::event_loop::EventLoopProxy;

#[derive(Clone)]
struct ServerState {
    proxy: EventLoopProxy<AppEvent>,
    runtime_paths: Arc<RuntimePaths>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StateResponse {
    ok: bool,
    config: AppConfig,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StartupResponse {
    ok: bool,
    enabled: bool,
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartupRequest {
    enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlatformRequest {
    platform_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RefreshRequest {
    platform_id: Option<String>,
}

pub fn spawn(proxy: EventLoopProxy<AppEvent>, runtime_paths: RuntimePaths) {
    thread::spawn(move || {
        let runtime = match tokio::runtime::Runtime::new() {
            Ok(runtime) => runtime,
            Err(error) => {
                let _ = proxy.send_event(AppEvent::ServerError(format!(
                    "Failed to create runtime: {error}"
                )));
                return;
            }
        };

        runtime.block_on(async move {
            let state = ServerState {
                proxy: proxy.clone(),
                runtime_paths: Arc::new(runtime_paths),
            };
            tokio::spawn(auto_refresh_loop(state.clone()));
            let app = Router::new()
                .route("/", get(config_page))
                .route("/api/health", get(health))
                .route("/api/state", get(get_state).post(save_state))
                .route("/api/startup", get(get_startup).post(set_startup))
                .route("/api/login", get(health).post(open_login))
                .route("/api/refresh", get(health).post(refresh_platforms))
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
                let _ = proxy.send_event(AppEvent::ServerError(format!(
                    "Tray server stopped: {error}"
                )));
            }
        });
    });
}

async fn auto_refresh_loop(state: ServerState) {
    let mut interval = tokio::time::interval(Duration::from_secs(30));
    loop {
        interval.tick().await;
        let config = state.runtime_paths.load_config();
        if !config.settings.auto_refresh {
            continue;
        }

        let last_refresh_at = config
            .settings
            .last_refresh_all_at
            .unwrap_or(config.generated_at);
        let now = chrono::Local::now().timestamp_millis();
        let interval_ms = (config.settings.refresh_interval_seconds as i64) * 1000;
        if now - last_refresh_at >= interval_ms
            && config.platforms.iter().any(|platform| platform.enabled)
        {
            let _ = state.proxy.send_event(AppEvent::RefreshAll);
        }
    }
}

async fn config_page() -> Html<&'static str> {
    Html(CONFIG_PAGE)
}

async fn health() -> Json<ApiResponse> {
    Json(ApiResponse {
        ok: true,
        error: None,
    })
}

async fn get_state(State(state): State<ServerState>) -> Json<StateResponse> {
    Json(StateResponse {
        ok: true,
        config: state.runtime_paths.load_config(),
    })
}

async fn save_state(
    State(state): State<ServerState>,
    Json(config): Json<AppConfig>,
) -> impl IntoResponse {
    let config = config.normalize();
    if let Err(error) = state.runtime_paths.save_config(&config) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse {
                ok: false,
                error: Some(format!("Failed to persist config: {error}")),
            }),
        );
    }

    let _ = state
        .proxy
        .send_event(AppEvent::PayloadUpdated(config.enabled_payload()));

    (
        StatusCode::OK,
        Json(ApiResponse {
            ok: true,
            error: None,
        }),
    )
}

async fn get_startup() -> Json<StartupResponse> {
    match autostart::is_enabled() {
        Ok(enabled) => Json(StartupResponse {
            ok: true,
            enabled,
            error: None,
        }),
        Err(error) => Json(StartupResponse {
            ok: false,
            enabled: false,
            error: Some(error.to_string()),
        }),
    }
}

async fn set_startup(
    State(state): State<ServerState>,
    Json(payload): Json<StartupRequest>,
) -> Json<StartupResponse> {
    let result = autostart::set_enabled(payload.enabled).map_err(|error| error.to_string());
    let _ = state
        .proxy
        .send_event(AppEvent::StartupChanged(result.clone()));

    match result {
        Ok(enabled) => Json(StartupResponse {
            ok: true,
            enabled,
            error: None,
        }),
        Err(error) => Json(StartupResponse {
            ok: false,
            enabled: false,
            error: Some(error),
        }),
    }
}

async fn open_login(
    State(state): State<ServerState>,
    Json(payload): Json<PlatformRequest>,
) -> Json<ApiResponse> {
    let _ = state
        .proxy
        .send_event(AppEvent::OpenLogin(payload.platform_id));
    Json(ApiResponse {
        ok: true,
        error: None,
    })
}

async fn refresh_platforms(
    State(state): State<ServerState>,
    Json(payload): Json<RefreshRequest>,
) -> Json<ApiResponse> {
    let event = match payload.platform_id {
        Some(platform_id) if platform_id != "all" => AppEvent::RefreshPlatform(platform_id),
        _ => AppEvent::RefreshAll,
    };
    let _ = state.proxy.send_event(event);
    Json(ApiResponse {
        ok: true,
        error: None,
    })
}

const CONFIG_PAGE: &str = r##"<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AI Monitor 配置</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f7f8;
      --panel: #ffffff;
      --panel-soft: #f1f3f5;
      --text: #172033;
      --muted: #657083;
      --border: #dfe3ea;
      --accent: #1c2a3a;
      --danger: #a63d35;
      --warning: #8a6116;
      --success: #276749;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.5 "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    }
    main {
      width: min(920px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0 42px;
    }
    header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 20px;
    }
    h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 650;
      letter-spacing: 0;
    }
    .subtle { color: var(--muted); }
    .stack { display: grid; gap: 12px; }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .platform {
      display: grid;
      grid-template-columns: 1fr 140px 150px 86px 170px;
      gap: 14px;
      align-items: center;
      padding: 16px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .identity {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .mark {
      display: grid;
      width: 36px;
      height: 36px;
      place-items: center;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel-soft);
      font-weight: 700;
    }
    .name {
      margin: 0;
      font-size: 15px;
      font-weight: 650;
    }
    .meta {
      margin: 2px 0 0;
      color: var(--muted);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    label {
      display: grid;
      gap: 6px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
    }
    input[type="number"], input[type="text"] {
      width: 100%;
      min-height: 36px;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 7px 10px;
      color: var(--text);
      background: #fff;
      font: inherit;
    }
    input:focus-visible, button:focus-visible {
      outline: 3px solid rgba(28, 42, 58, 0.18);
      outline-offset: 2px;
    }
    .switch {
      display: inline-flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      color: var(--text);
      font-size: 13px;
      font-weight: 600;
    }
    .switch input {
      width: 18px;
      height: 18px;
      margin: 0;
    }
    .actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 16px;
    }
    .row-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
    }
    .row-actions button {
      min-height: 34px;
      padding: 0 10px;
      font-size: 13px;
    }
    button {
      min-height: 38px;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0 14px;
      background: #fff;
      color: var(--text);
      font: inherit;
      font-weight: 650;
      cursor: pointer;
    }
    button.primary {
      border-color: var(--accent);
      background: var(--accent);
      color: #fff;
    }
    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
    .message {
      min-height: 20px;
      color: var(--muted);
    }
    .message.error { color: var(--danger); }
    .bar {
      height: 8px;
      margin-top: 8px;
      overflow: hidden;
      border-radius: 999px;
      background: var(--panel-soft);
    }
    .bar > span {
      display: block;
      height: 100%;
      width: 0%;
      background: var(--success);
    }
    .bar > span.warning { background: var(--warning); }
    .bar > span.danger { background: var(--danger); }
    @media (max-width: 760px) {
      header, .toolbar { align-items: stretch; flex-direction: column; }
      .platform { grid-template-columns: 1fr; }
      .switch { justify-content: flex-start; }
      .actions { align-items: stretch; flex-direction: column; }
      .row-actions { justify-content: stretch; }
      .row-actions button { flex: 1; }
      button { width: 100%; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>AI Monitor 配置</h1>
        <div class="subtle">托盘 EXE 会直接读取这里保存的额度状态，不再需要浏览器扩展。</div>
      </div>
      <div id="message" class="message"></div>
    </header>

    <section class="stack">
      <div class="toolbar">
        <div class="row-actions">
          <label class="switch">
            <input id="startup" type="checkbox" />
            开机自启
          </label>
          <label class="switch">
            <input id="autoRefresh" type="checkbox" />
            自动刷新
          </label>
        </div>
        <label>
          刷新间隔（分钟）
          <input id="refreshInterval" type="number" min="5" max="720" step="5" />
        </label>
        <div class="subtle" id="updated">正在读取本地配置...</div>
      </div>
      <div id="platforms" class="stack"></div>
    </section>

    <div class="actions">
      <button id="reset" type="button">恢复默认</button>
      <button id="refreshAll" type="button">刷新全部</button>
      <button id="save" type="button" class="primary">保存到托盘</button>
    </div>
  </main>

  <script>
    const platformNames = {
      "github-copilot": "GitHub Copilot",
      "chatgpt": "ChatGPT / Codex",
      "kimi": "Kimi"
    };
    const platformsEl = document.querySelector("#platforms");
    const messageEl = document.querySelector("#message");
    const updatedEl = document.querySelector("#updated");
    const startupEl = document.querySelector("#startup");
    const autoRefreshEl = document.querySelector("#autoRefresh");
    const refreshIntervalEl = document.querySelector("#refreshInterval");
    const saveButton = document.querySelector("#save");
    const resetButton = document.querySelector("#reset");
    const refreshAllButton = document.querySelector("#refreshAll");
    let config = {
      settings: { autoRefresh: true, refreshIntervalSeconds: 1800, lastRefreshAllAt: null },
      platforms: [],
      generatedAt: Date.now()
    };
    let refreshPollTimer = null;

    function setMessage(text, error = false) {
      messageEl.textContent = text;
      messageEl.classList.toggle("error", error);
    }

    function defaults() {
      return Object.entries(platformNames).map(([id, name]) => ({
        id,
        name,
        enabled: false,
        status: "not_login",
        remainingPercentage: null,
        usedPercentage: null,
        lastUpdated: null,
        errorMessage: null
      }));
    }

    function defaultConfig() {
      return {
        settings: { autoRefresh: true, refreshIntervalSeconds: 1800, lastRefreshAllAt: null },
        platforms: defaults(),
        generatedAt: Date.now()
      };
    }

    function formatTime(timestamp) {
      if (!timestamp) return "尚未保存";
      return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
    }

    function statusClass(remaining) {
      if (remaining === null || Number.isNaN(remaining)) return "";
      if (remaining <= 10) return "danger";
      if (remaining <= 30) return "warning";
      return "";
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    function render() {
      updatedEl.textContent = `最后保存：${formatTime(config.generatedAt)}`;
      autoRefreshEl.checked = Boolean(config.settings?.autoRefresh);
      refreshIntervalEl.value = Math.round((config.settings?.refreshIntervalSeconds || 1800) / 60);
      platformsEl.innerHTML = "";
      const platforms = config.platforms.length ? config.platforms : defaults();
      for (const platform of platforms) {
        const remaining = platform.remainingPercentage;
        const value = remaining === null || remaining === undefined ? "" : Math.round(remaining);
        const item = document.createElement("article");
        item.className = "platform";
        item.dataset.id = platform.id;
        item.innerHTML = `
          <div class="identity">
            <div class="mark">${escapeHtml(platform.name.slice(0, 1))}</div>
            <div>
              <p class="name">${escapeHtml(platform.name)}</p>
              <p class="meta">${escapeHtml(platform.id)}</p>
              <div class="bar"><span class="${statusClass(value)}" style="width:${value || 0}%"></span></div>
            </div>
          </div>
          <label>
            剩余额度 %
            <input data-field="remaining" type="number" min="0" max="100" step="1" value="${value}" placeholder="例如 75" />
          </label>
          <label>
            备注
            <input data-field="error" type="text" value="${escapeHtml(platform.errorMessage || "")}" placeholder="可选" />
          </label>
          <label class="switch">
            <input data-field="enabled" type="checkbox" ${platform.enabled ? "checked" : ""} />
            显示
          </label>
          <div class="row-actions">
            <button data-action="login" data-id="${escapeHtml(platform.id)}" type="button">登录</button>
            <button data-action="refresh" data-id="${escapeHtml(platform.id)}" type="button">刷新</button>
          </div>
        `;
        platformsEl.appendChild(item);
      }
    }

    function collectConfig() {
      const platforms = [...document.querySelectorAll(".platform")].map((item) => {
        const id = item.dataset.id;
        const name = platformNames[id] || id;
        const remainingInput = item.querySelector('[data-field="remaining"]');
        const errorInput = item.querySelector('[data-field="error"]');
        const enabledInput = item.querySelector('[data-field="enabled"]');
        const rawRemaining = remainingInput.value.trim();
        const remaining = rawRemaining === "" ? null : Math.min(Math.max(Number(rawRemaining), 0), 100);
        return {
          id,
          name,
          enabled: enabledInput.checked,
          status: "not_login",
          remainingPercentage: remaining,
          usedPercentage: remaining === null ? null : 100 - remaining,
          lastUpdated: Date.now(),
          errorMessage: errorInput.value.trim() || null
        };
      });
      const intervalMinutes = Math.min(Math.max(Number(refreshIntervalEl.value || 30), 5), 720);
      return {
        settings: {
          autoRefresh: autoRefreshEl.checked,
          refreshIntervalSeconds: intervalMinutes * 60,
          lastRefreshAllAt: config.settings?.lastRefreshAllAt ?? null
        },
        platforms,
        generatedAt: Date.now()
      };
    }

    async function requestJson(url, options) {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    }

    async function load() {
      setMessage("");
      try {
        const [state, startup] = await Promise.all([
          requestJson("/api/state"),
          requestJson("/api/startup")
        ]);
        config = state.config;
        startupEl.checked = Boolean(startup.enabled);
        render();
      } catch (error) {
        setMessage(`读取失败：${error.message}`, true);
        config = defaultConfig();
        render();
      }
    }

    async function reloadStateOnly() {
      const state = await requestJson("/api/state");
      config = state.config;
      render();
      return config;
    }

    function getRefreshMarker(platformId) {
      if (platformId && platformId !== "all") {
        return config.platforms.find((platform) => platform.id === platformId)?.lastUpdated ?? 0;
      }
      const enabledMarkers = config.platforms
        .filter((platform) => platform.enabled)
        .map((platform) => platform.lastUpdated ?? 0);
      if (enabledMarkers.length === 0) return config.generatedAt ?? 0;
      return Math.min(...enabledMarkers);
    }

    async function waitForRefreshResult(platformId, previousMarker) {
      const startedAt = Date.now();
      const timeoutMs = 60_000;
      window.clearInterval(refreshPollTimer);

      refreshPollTimer = window.setInterval(async () => {
        try {
          const nextConfig = await reloadStateOnly();
          const nextMarker = getRefreshMarker(platformId);
          if (nextMarker > previousMarker) {
            window.clearInterval(refreshPollTimer);
            const failedCount = nextConfig.platforms.filter((platform) => platform.enabled && platform.errorMessage).length;
            setMessage(failedCount > 0 ? `已更新，${failedCount} 个平台有提示` : "刷新完成，配置面板已更新");
          } else if (Date.now() - startedAt > timeoutMs) {
            window.clearInterval(refreshPollTimer);
            setMessage("仍在等待刷新结果，可稍后手动刷新配置页");
          }
        } catch (error) {
          window.clearInterval(refreshPollTimer);
          setMessage(`读取刷新结果失败：${error.message}`, true);
        }
      }, 1000);
    }

    async function save() {
      saveButton.disabled = true;
      setMessage("正在保存...");
      try {
        config = collectConfig();
        await requestJson("/api/state", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(config)
        });
        setMessage("已保存");
        await load();
      } catch (error) {
        setMessage(`保存失败：${error.message}`, true);
      } finally {
        saveButton.disabled = false;
      }
    }

    async function postAction(url, body, message) {
      setMessage(message);
      try {
        await requestJson(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body)
        });
        return true;
      } catch (error) {
        setMessage(`操作失败：${error.message}`, true);
        return false;
      }
    }

    startupEl.addEventListener("change", async () => {
      try {
        const result = await requestJson("/api/startup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: startupEl.checked })
        });
        startupEl.checked = Boolean(result.enabled);
        setMessage(result.enabled ? "已启用开机自启" : "已关闭开机自启");
      } catch (error) {
        startupEl.checked = !startupEl.checked;
        setMessage(`开机自启设置失败：${error.message}`, true);
      }
    });

    resetButton.addEventListener("click", () => {
      config = defaultConfig();
      render();
      setMessage("已恢复默认，保存后生效");
    });

    refreshAllButton.addEventListener("click", async () => {
      await save();
      const marker = getRefreshMarker("all");
      const accepted = await postAction("/api/refresh", { platformId: "all" }, "已开始刷新全部启用平台");
      if (accepted) await waitForRefreshResult("all", marker);
    });

    platformsEl.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const platformId = button.dataset.id;
      if (button.dataset.action === "login") {
        await postAction("/api/login", { platformId }, "正在打开登录窗口...");
      }
      if (button.dataset.action === "refresh") {
        await save();
        const marker = getRefreshMarker(platformId);
        const accepted = await postAction("/api/refresh", { platformId }, "已开始刷新，托盘会在抓取完成后更新");
        if (accepted) await waitForRefreshResult(platformId, marker);
      }
    });

    saveButton.addEventListener("click", save);
    load();
  </script>
</body>
</html>"##;
