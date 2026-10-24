# LimitRSS v0.2.7

## 中文说明

### 修复

- **AI 总结生成后未真正保存**：流式回调在 Promise 完成前引用了未初始化的结果变量（TDZ 报错，即日志中的 `Cannot access 'a' before initialization`），总结只显示在卡片、从未写入存储，保存思源对话框里因此没有"AI 总结"选项。现在生成完成后才写入，保存对话框即可勾选。

### 改进

- **浏览器 https 模式跨域请求改走内核 API 代理**：访问 `http://` 端点（如局域网 AI 服务 `192.168.x.x:8022`）不再产生 Mixed Content 告警。
- 清理未使用的旧代码。

## English

### Fixed

- **AI summary not persisted after generation**: a stream callback referenced an uninitialized variable before the promise resolved (TDZ `ReferenceError`), so the summary was shown but never saved and the save dialog had no "AI summary" option. Persistence now runs after completion.

### Improved

- **Browser HTTPS mode proxies via kernel API**: `http://` endpoints (e.g. LAN AI servers) no longer trigger Mixed Content warnings.
- Removed unused legacy code.
