# LimitRSS v0.2.5

## 中文说明

### 修复

- **重启后 AI 功能提示"请先在设置中配置 AI 提供商"（实际已配置）**：`onload` 在数据加载完成前就用默认配置构造了 `AIService`，加载完成时的 emit 被晚注册的订阅错过，导致重启/重载插件后 AI 配置"丢失"（打开设置页才恢复）。现在 `whenReady` 后立即同步已加载配置，提供商/提示词/日报设置重启后即刻生效。
- **浏览器（Docker/https）模式下 `http://` 图片被混合内容策略拦截**（favicon、正文图片）：https 应用下自动把 `<img>` 的 `http://` 地址升级为 `https://`；fetch 类请求走内核代理不受影响。

## English

### Fixed

- **"Please configure an AI provider in Settings" after restart despite providers being configured**: the `AIService` was built with default settings before data load finished, and the load-completion emit was missed by the late-registered subscription, so AI settings were lost until the settings page was opened. Loaded settings are now synced immediately after `whenReady()`.
- **Mixed-content blocks for `http://` images in browser (Docker/https) mode** (favicons, article images): `http://` `<img>` URLs are auto-upgraded to `https://` when the app runs over https; fetch requests go through the kernel proxy and are unaffected.
