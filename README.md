# AI Monitor

![AI Monitor screenshot](https://raw.githubusercontent.com/liuminxin45/ai-quota-monitor/main/public/assets/readme/github-readme-example.png)

AI Monitor 是一个面向 Edge 浏览器开发的 AI 配额监控扩展，主要用于检测和汇总常见 AI 包月套餐的配额使用情况、重置周期和当前负荷状态。

目前这个项目只在 Edge 浏览器上完成了开发、测试和日常使用，暂未对其他 Chromium 浏览器做兼容性验证。

当前已支持：

- GitHub Copilot
- ChatGPT / Codex
- Kimi

扩展会基于你当前浏览器里已经登录的平台页面，抓取可见的套餐额度信息，并统一展示在侧边栏中，帮助你快速判断：

- 哪个平台当前额度最充足
- 哪个平台按当前速度最容易提前耗尽
- 现在优先使用哪个模型更合适

如果你本来就在同时订阅多个 AI 包月服务，这个工具的目的就是把这些零散的额度页面收拢起来，变成一个更清楚的配额看板。

## 这个工具是干什么的

这个工具不是通用的 AI 聊天入口，也不是模型聚合调用器。

它的核心用途是：**检测 AI 包月套餐配额是否快要用完，并辅助判断当前优先该使用哪个平台。**

更具体地说，它关注的是：

- 套餐额度已经用了多少
- 距离下一次重置还有多久
- 按当前消耗速度，这个周期内会不会提前见底

## 功能特性

- 聚合查看多个 AI 包月平台的额度与使用情况
- 后台定时刷新并缓存结果
- 展示每个平台的重置倒计时
- 基于已用额度和重置周期计算当前负荷
- 按“当前更适合优先使用”到“当前负荷更重”的顺序自动排序平台

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

- 目前仅在 Edge 浏览器中测试和使用
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

AI Monitor is an Edge-first browser extension for tracking AI subscription quota usage across multiple platforms.

At the moment, it has only been developed, tested, and used on Microsoft Edge.

It currently supports:

- GitHub Copilot
- ChatGPT / Codex
- Kimi

It reads quota information from the official usage pages you are already logged into and aggregates the results in a side panel.

Its primary purpose is to help users monitor monthly or recurring AI subscription quotas and decide which platform is safer to use first before a quota resets.

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
