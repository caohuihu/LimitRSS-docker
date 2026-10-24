# LimitRSS v0.2.2

## 中文说明

### 新增

- **阅读快捷键**：`J/K` 上下篇、`M` 切已读、`S` 切星标、`O` 打开原文、`R` 刷新、`I` 切 AI 总结面板、`?` 快捷键帮助、`⌘/Ctrl+S` 保存当前文章到思源、`⌘/Ctrl+F` 聚焦搜索。仅在面板内聚焦时生效；输入框与弹窗打开时不拦截。
- **站点 Feed 自动发现**：添加订阅时直接粘贴站点主页（如 https://example.com），自动读取首页 `<link rel="alternate">` 声明并依次探测常见 feed 路径（最多 8 个候选），命中后自动回填 feed URL 入库。
- **批量操作**：文章列表新增"批量"菜单——星标全部 / 取消星标 / 全部标为未读。
- **"打开文章自动标记已读"开关**（设置 → 阅读，默认开启保持原有行为）。

### 修复

- **跨实例重复刷新**：完整版与 dock 同时打开时，两个实例的周期刷新会对同一订阅并发请求；现由模块级在途锁保证同一源同一时间只有一个请求。

## English

### Added

- **Keyboard shortcuts**: `J/K` next/previous, `M` toggle read, `S` toggle star, `O` open original, `R` refresh, `I` toggle AI summary panel, `?` shortcut help, `⌘/Ctrl+S` save current article to SiYuan, `⌘/Ctrl+F` focus search. Active only when the panel has focus; never intercepts typing or dialogs.
- **Site feed auto-discovery**: paste a site URL when adding a subscription; the plugin reads `<link rel="alternate">` from the homepage and probes common feed paths (up to 8 candidates), then stores the discovered feed URL.
- **Bulk actions**: new bulk menu in the article list — star all / unstar all / mark all unread.
- **"Auto-mark read on open" toggle** (Settings → Reading, default on to preserve previous behavior).

### Fixed

- **Duplicate refresh across instances**: with both the full tab and the dock open, two periodic refreshers issued concurrent requests for the same subscription. A module-level in-flight lock now guarantees one request per feed at a time.
