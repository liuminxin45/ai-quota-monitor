# AI Monitor

AI Monitor 是一个面向 Edge / Chromium 浏览器的 AI 配额监控扩展，用来聚合查看多个 AI 平台的用量、重置周期和当前负荷状态。

当前已支持：

- GitHub Copilot
- ChatGPT / Codex
- Kimi

扩展会基于你当前浏览器里已经登录的平台页面，抓取可见的用量信息，并统一展示在侧边栏中，帮助你判断现在优先该用哪个模型。

## 功能特性

- 聚合查看多个 AI 平台的额度与使用情况
- 后台定时刷新并缓存结果
- 展示每个平台的重置倒计时
- 基于用量与重置周期计算当前负荷
- 按推荐使用顺序自动排序平台

## 工作原理

AI Monitor 不依赖私有 API，也不需要你提供 API Key。

它的工作流程是：

1. 在需要时后台打开对应平台的官方用量页面
2. 通过 content script 从页面 DOM 中提取可见的额度信息
3. 将结果写入 `chrome.storage.local`
4. 在 popup 和 side panel 中统一渲染

当前使用的重置周期：

- GitHub Copilot：30 天
- ChatGPT / Codex：7 天
- Kimi：7 天

## 技术栈

- React 19
- TypeScript
- Vite 8
- CRXJS
- Tailwind CSS 4
- Manifest V3

## 本地开发

安装依赖：

```bash
npm install
```

类型检查：

```bash
npm run compile
```

构建扩展：

```bash
npm run build
```

## 在 Edge 中加载

1. 运行 `npm run build`
2. 打开 `edge://extensions`
3. 开启“开发人员模式”
4. 点击“加载解压缩的扩展”
5. 选择生成出来的 `dist/` 目录

## 权限说明

扩展会申请以下权限：

- `storage`：缓存平台数据和设置
- `alarms`：后台定时刷新
- `tabs`：在需要时后台打开平台页面抓取数据
- `scripting`：扩展运行时支持
- `sidePanel`：渲染主侧边栏 UI
- `cookies`、`activeTab`：平台登录态和页面访问支持

Host 权限仅限于当前支持的平台域名。

## 限制说明

- 数据提取依赖各平台当前页面 DOM 结构
- 如果平台前端结构变化，选择器需要同步调整
- 后台刷新时，浏览器标签栏可能会短暂出现未激活的新标签页

## 规划方向

- 支持更多 AI 平台
- 更明确的额度耗尽预警
- 在 UI 中自定义刷新频率
- 增加历史趋势与报表能力

## License

MIT，详见 [LICENSE](LICENSE)。

---

## English

AI Monitor is a browser extension for tracking usage quotas across multiple AI tools in one place.

It currently supports:

- GitHub Copilot
- ChatGPT / Codex
- Kimi

The extension runs in Edge / Chromium browsers, reads usage data from the official web pages you are already logged into, and aggregates the results in a side panel.

### What It Does

- Aggregates usage across multiple AI platforms
- Refreshes usage data in the background on a schedule
- Shows quota reset countdowns
- Estimates platform load based on usage and reset cycle
- Sorts platforms from most recommended to least recommended

### How It Works

AI Monitor does not use private APIs or require API keys.

It works by:

1. Opening the official usage page for each platform in a background tab when needed
2. Reading the visible quota information from the page DOM with content scripts
3. Saving the result into `chrome.storage.local`
4. Rendering the data in the popup and side panel UI

### Development

```bash
npm install
npm run compile
npm run build
```

### Load Into Edge

1. Run `npm run build`
2. Open `edge://extensions`
3. Enable Developer mode
4. Click `Load unpacked`
5. Select the generated `dist/` folder

### License

MIT. See [LICENSE](LICENSE).
