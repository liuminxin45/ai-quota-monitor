use crate::model::{platform_definition, AppEvent, RuntimePaths, WebScrapeResult};
use anyhow::{Context, Result};
use std::collections::HashMap;
use tao::{
    event_loop::{EventLoopProxy, EventLoopWindowTarget},
    window::{Window, WindowBuilder, WindowId},
};
use wry::{http::Request, WebContext, WebView, WebViewBuilder};

struct BrowserSession {
    _window: Window,
    _webview: WebView,
    platform_id: String,
    refresh: bool,
}

pub struct BrowserController {
    context: WebContext,
    sessions: HashMap<WindowId, BrowserSession>,
}

impl BrowserController {
    pub fn new(runtime_paths: &RuntimePaths) -> Self {
        Self {
            context: WebContext::new(Some(runtime_paths.webview_data_dir.clone())),
            sessions: HashMap::new(),
        }
    }

    pub fn open_login(
        &mut self,
        platform_id: &str,
        event_loop: &EventLoopWindowTarget<AppEvent>,
        proxy: EventLoopProxy<AppEvent>,
    ) -> Result<()> {
        let definition = platform_definition(platform_id);
        self.open_webview(platform_id, definition.login_url, false, event_loop, proxy)
    }

    pub fn refresh_platform(
        &mut self,
        platform_id: &str,
        event_loop: &EventLoopWindowTarget<AppEvent>,
        proxy: EventLoopProxy<AppEvent>,
    ) -> Result<()> {
        let definition = platform_definition(platform_id);
        self.open_webview(platform_id, definition.usage_url, true, event_loop, proxy)
    }

    pub fn close_window(&mut self, window_id: WindowId) {
        self.sessions.remove(&window_id);
    }

    pub fn finish_refresh(&mut self, platform_id: &str) {
        let session_id = self
            .sessions
            .iter()
            .find(|(_, session)| session.refresh && session.platform_id == platform_id)
            .map(|(window_id, _)| *window_id);

        if let Some(window_id) = session_id {
            self.sessions.remove(&window_id);
        }
    }

    fn open_webview(
        &mut self,
        platform_id: &str,
        url: &str,
        refresh: bool,
        event_loop: &EventLoopWindowTarget<AppEvent>,
        proxy: EventLoopProxy<AppEvent>,
    ) -> Result<()> {
        let definition = platform_definition(platform_id);
        let title = if refresh {
            format!("AI Monitor refresh - {}", definition.name)
        } else {
            format!("AI Monitor login - {}", definition.name)
        };

        let window = WindowBuilder::new()
            .with_title(title)
            .with_visible(!refresh)
            .with_inner_size(tao::dpi::LogicalSize::new(980.0, 720.0))
            .build(event_loop)
            .context("failed to create WebView2 window")?;
        let window_id = window.id();

        let ipc_proxy = proxy.clone();
        let ipc_handler = move |req: Request<String>| {
            let body = req.body();
            if let Ok(result) = serde_json::from_str::<WebScrapeResult>(body) {
                let _ = ipc_proxy.send_event(AppEvent::ScrapeFinished(result));
            }
        };

        let mut builder = WebViewBuilder::new_with_web_context(&mut self.context)
            .with_url(url)
            .with_ipc_handler(ipc_handler);

        if refresh {
            let scrape_script = build_scrape_script(platform_id);
            builder = builder.with_initialization_script(scrape_script);
        }

        let webview = builder
            .build(&window)
            .context("failed to create system WebView2 instance")?;

        self.sessions.insert(
            window_id,
            BrowserSession {
                _window: window,
                _webview: webview,
                platform_id: platform_id.to_string(),
                refresh,
            },
        );

        Ok(())
    }
}

fn build_scrape_script(platform_id: &str) -> String {
    format!(
        r####"
(() => {{
  const platformId = {platform_id_json};
  let posted = false;

  function post(payload) {{
    if (posted) return;
    posted = true;
    window.ipc.postMessage(JSON.stringify({{
      platformId,
      success: Boolean(payload.success),
      usedPercentage: payload.usedPercentage ?? null,
      remainingPercentage: payload.remainingPercentage ?? null,
      error: payload.error ?? null
    }}));
  }}

  function parseResetTimestamp(resetText) {{
    if (!resetText) return undefined;
    const now = Date.now();
    const hoursMatch = resetText.match(/(\d+)\s*(?:hours?|小时)/);
    if (hoursMatch) return now + parseInt(hoursMatch[1], 10) * 3600000;
    const daysMatch = resetText.match(/(\d+)\s*(?:days?|天)/);
    if (daysMatch) return now + parseInt(daysMatch[1], 10) * 86400000;
    const minsMatch = resetText.match(/(\d+)\s*(?:minutes?|分钟)/);
    if (minsMatch) return now + parseInt(minsMatch[1], 10) * 60000;
    return undefined;
  }}

  function parseChatGptReset(sourceText) {{
    if (!sourceText) return {{}};
    const normalizedText = sourceText.replace(/\s+/g, " ").trim();
    const resetCnMatch = normalizedText.match(/重置时间[：:]\s*(\d{{4}})年(\d{{1,2}})月(\d{{1,2}})日\s*(\d{{1,2}}):(\d{{2}})/);
    if (resetCnMatch) {{
      const [, year, month, day, hour, minute] = resetCnMatch;
      const resetDate = new Date(+year, +month - 1, +day, +hour, +minute);
      return {{ resetTimestamp: resetDate.getTime() }};
    }}
    return {{}};
  }}

  function githubResetTimestamp() {{
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0);
  }}

  function resultFromUsedPercent(usedPercentage) {{
    const used = Math.min(Math.max(Number(usedPercentage), 0), 100);
    return {{
      success: true,
      usedPercentage: Math.round(used),
      remainingPercentage: Math.max(0, 100 - Math.round(used))
    }};
  }}

  function resultFromRemainingPercent(remainingPercentage) {{
    const remaining = Math.min(Math.max(Number(remainingPercentage), 0), 100);
    return {{
      success: true,
      usedPercentage: Math.max(0, 100 - Math.round(remaining)),
      remainingPercentage: Math.round(remaining)
    }};
  }}

  function scrapeGithub() {{
    const signInForm = document.querySelector('form[action*="session"]');
    const metaLogin = document.querySelector('meta[name="user-login"]');
    if (signInForm && !metaLogin?.getAttribute("content")) {{
      return {{ success: false, error: "Not logged in - login required" }};
    }}

    const overagesSection = document.querySelector("#copilot-overages-usage");
    if (overagesSection) {{
      const textContent = overagesSection.textContent ?? "";
      const percentMatch = textContent.match(/(\d+(?:\.\d+)?)%/);
      if (percentMatch) return resultFromUsedPercent(parseFloat(percentMatch[1]));

      const progressItem = overagesSection.querySelector(".Progress-item");
      const widthMatch = progressItem?.style?.width?.match(/(\d+(?:\.\d+)?)%/);
      if (widthMatch) return resultFromUsedPercent(parseFloat(widthMatch[1]));
    }}

    const allText = document.body.innerText || "";
    const premiumMatch = allText.match(/Premium\s+requests[\s\S]*?(\d+(?:\.\d+)?)%/i);
    if (premiumMatch) return resultFromUsedPercent(parseFloat(premiumMatch[1]));

    return {{ success: false, error: "Could not find GitHub Copilot usage data" }};
  }}

  function scrapeChatGpt() {{
    if (document.querySelector('[data-testid="login-button"]') || window.location.pathname.includes("/auth")) {{
      return {{ success: false, error: "Not logged in - login required" }};
    }}

    const articles = document.querySelectorAll("article");
    let targetArticle = null;
    let fallbackArticle = null;
    for (const article of articles) {{
      const articleText = article.textContent ?? "";
      if (/每周使用限额|weekly\s+usage/i.test(articleText)) {{
        targetArticle = article;
        break;
      }}
      if (!fallbackArticle && /\d+%/.test(articleText) && /剩余|remaining/i.test(articleText)) {{
        fallbackArticle = article;
      }}
    }}
    targetArticle = targetArticle || fallbackArticle;
    if (targetArticle) {{
      const percentSpan = targetArticle.querySelector("span.text-2xl");
      const percentText = percentSpan?.textContent?.trim() ?? "";
      const percentMatch = percentText.match(/^(\d+(?:\.\d+)?)%$/);
      if (percentMatch) return resultFromRemainingPercent(parseFloat(percentMatch[1]));

      const bar = targetArticle.querySelector('div[style*="width"]:not(.w-full)');
      const widthMatch = bar?.style?.width?.match(/(\d+(?:\.\d+)?)%/);
      if (widthMatch) return resultFromRemainingPercent(parseFloat(widthMatch[1]));
    }}

    const allText = document.body.innerText || "";
    const weeklyMatch = allText.match(/(?:每周使用限额|weekly\s+usage)[\s\S]{{0,80}}?(\d+(?:\.\d+)?)%/i);
    if (weeklyMatch) return resultFromRemainingPercent(parseFloat(weeklyMatch[1]));

    return {{ success: false, error: "Could not find ChatGPT usage data" }};
  }}

  function scrapeKimi() {{
    const statsDesktop = document.querySelector(".stats-desktop");
    if (!statsDesktop) return {{ success: false, error: "Not logged in - login required" }};

    const cards = [...document.querySelectorAll(".stats-card")].map((card) => ({{
      title: card.querySelector(".stats-card-title")?.textContent?.trim() ?? "",
      value: card.querySelector(".stats-card-value")?.textContent?.trim() ?? "",
      resetTime: card.querySelector(".stats-card-reset-time")?.textContent?.trim() ?? ""
    }}));
    const targetCard =
      cards.find((card) => card.title.toLowerCase().includes("weekly usage")) ||
      cards.find((card) => card.title.toLowerCase().includes("rate limit"));
    const percentMatch = targetCard?.value?.match(/(\d+(?:\.\d+)?)%/);
    if (percentMatch) return resultFromUsedPercent(parseFloat(percentMatch[1]));

    const progressFilled = statsDesktop.querySelector(".stats-card-progress-filled");
    const widthMatch = progressFilled?.style?.width?.match(/(\d+(?:\.\d+)?)%/);
    if (widthMatch) return resultFromUsedPercent(parseFloat(widthMatch[1]));

    return {{ success: false, error: "Could not find Kimi usage data" }};
  }}

  function scrape() {{
    try {{
      if (!document.body) return {{ success: false, error: "Page is still loading" }};
      if (platformId === "github-copilot") return scrapeGithub();
      if (platformId === "chatgpt") return scrapeChatGpt();
      if (platformId === "kimi") return scrapeKimi();
      return {{ success: false, error: `Unsupported platform: ${{platformId}}` }};
    }} catch (error) {{
      return {{ success: false, error: error?.message || "Unknown scrape error" }};
    }}
  }}

  function start() {{
    let attempts = 0;
    const timer = window.setInterval(() => {{
      attempts += 1;
      const result = scrape();
      if (result.success) {{
        window.clearInterval(timer);
        post(result);
      }} else if (attempts >= 30) {{
        window.clearInterval(timer);
        post(result);
      }}
    }}, 1000);
  }}

  if (document.readyState === "complete") {{
    window.setTimeout(start, 1200);
  }} else {{
    window.addEventListener("load", () => window.setTimeout(start, 1200), {{ once: true }});
  }}
}})();
"####,
        platform_id_json =
            serde_json::to_string(platform_id).unwrap_or_else(|_| "\"\"".to_string())
    )
}
