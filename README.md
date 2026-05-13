# AI Monitor

AI Monitor 现在是一个纯 Windows 托盘 EXE，用来登录、刷新并查看 AI 订阅额度状态。项目已经移除浏览器扩展、CRX、Vite、Popup、Side Panel 和 content script，不再依赖 Edge 或 Chrome 扩展程序。

## 功能

- 系统托盘显示已启用平台的剩余额度
- 右键托盘可打开本机配置页
- 托盘图标和菜单只展示配置页中勾选了 `显示` 的平台
- 托盘菜单使用简化中文状态，例如 `ChatGPT 23%`
- 配置页可登录 GitHub Copilot、ChatGPT / Codex、Kimi
- 使用系统 WebView2 保存登录态，不内置 Chromium 内核
- 支持立即刷新单个平台或全部平台
- 支持自动轮询刷新，可配置刷新间隔
- 配置页仍可手动维护平台显示状态、剩余额度和备注
- 支持开机自启
- 本地状态保存到 `%LOCALAPPDATA%\AI Monitor\tray\tray-state.json`
- WebView2 登录态保存到 `%LOCALAPPDATA%\AI Monitor\tray\webview-profile`
- 配置服务只监听 `127.0.0.1:38431`

## 使用

构建调试版：

```bash
npm run build
```

构建发布版：

```bash
npm run build:release
```

直接运行：

```bash
npm run tray:run
```

也可以不经过 npm，直接运行 Cargo：

```bash
cargo run --manifest-path desktop-tray/Cargo.toml
```

启动后，在系统托盘右键 `AI Monitor Tray`，点击 `打开配置面板` 打开配置页。

推荐流程：

1. 在配置页为平台点击 `登录`
2. 在弹出的 WebView2 窗口里完成登录
3. 回到配置页点击平台 `刷新` 或 `刷新全部`
4. 打开 `自动刷新` 后，EXE 会按间隔轮询刷新已启用平台

保存或刷新完成后，托盘图标、tooltip 和右键菜单会立即使用新状态。

配置页中的 `显示` 只控制托盘展示，不影响平台登录态。取消勾选后，该平台不会出现在托盘图标柱状条和右键菜单中。

## 架构

- `desktop-tray/`：Rust 托盘 EXE
- `desktop-tray/src/server.rs`：本地配置页和 JSON API
- `desktop-tray/src/browser.rs`：系统 WebView2 登录窗口和刷新抓取
- `desktop-tray/src/model.rs`：平台状态模型和本地持久化
- `desktop-tray/src/app.rs`：托盘图标、菜单和配置页入口

## 本地接口

托盘 EXE 启动后会监听：

```text
http://127.0.0.1:38431
```

可用接口：

- `GET /`：配置面板
- `GET /api/health`：健康检查
- `GET /api/state`：读取本地配置
- `POST /api/state`：保存本地配置
- `GET /api/startup`：读取开机自启状态
- `POST /api/startup`：修改开机自启状态
- `POST /api/login`：打开指定平台的 WebView2 登录窗口
- `POST /api/refresh`：刷新指定平台或全部已启用平台

## 发布

GitHub Actions 会在 Windows runner 上构建 `desktop-tray/target/release/ai-monitor-tray.exe`，并发布到 `latest` release。

## License

MIT，详见 [LICENSE](LICENSE)。
