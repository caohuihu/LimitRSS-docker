# LimitRSS v0.2.0

## 中文说明

### 新增

- AI 日报「深读正文截断」设置：`设置 → AI 日报` 新增"截断文章正文"开关与"每篇保留字符数"（0–50000，默认 6000）。深读阶段发给 AI 的正文超过上限时自动截断并标注 `[…过长已截断]`，避免长文撑爆上下文与费用；关闭或填 0 则不截断，修改后下次生成日报生效。
- 数据层拆分键 `ai_rss_article_extras`（AI 结果/高亮/标签/已保存文档）与 `ai_rss_full_texts`（抓取全文）：旧数据首次加载自动迁移，无需手动操作。

### 性能优化

- **存储层**：文章主表只持久化轻量字段；全文/AI 结果等大字段拆到独立键，单次"已读/星标/AI 结果"变更不再重写整张文章表；大字段键 800ms 写合并（批量抓全文 N 次落盘 → 1 次），插件卸载时尽力立即落盘。
- **渲染**：已读/星标变化时文章列表只对可见条目做 class 切换、阅读器只切换状态按钮，不再整栏重建；数据类事件走 rAF 合并渲染。
- **翻译**：流式翻译原文由"逐字符 DOM（1.4 万字 ≈ 2.8 万节点）"改为整段文本节点 + CSS 过渡（视觉一致）；翻译分段与正文 sanitize/postProcess 结果加缓存，渲染与翻译执行共用一次构建。
- **热点**：侧栏统计由 O(订阅数×文章数) 降为单遍遍历；favicon 解析改为后台执行，不再阻塞刷新管线；文章列表排序缓存 + 小写搜索索引；CORS 全局拦截对无 body 请求不再附带默认 JSON content-type。
- **次要**：开 tab 只补刷过期/未抓取的订阅源；日期分组、"x 分钟前"、阅读时长加缓存；订阅/分类列表内部保持有序；过期文章清理降为最多每小时一次。

### 修复

- 刷新入库已有文章时自定义标签（tags）丢失的问题。
- CORS 全局拦截在代理成功时仍重复发第二次请求、且第二次失败时误回退原生 fetch 的问题。

### 验证

- 单测 48/48 通过；生产构建成功；类型检查仅剩思源依赖包内部既有告警。

## English

### Added

- Daily-report content truncation settings: `Settings → AI Daily` now has a "Truncate article content" toggle and a per-article character limit (0–50000, default 6000). Content sent to the AI in the deep-dive stage is truncated with a marker to avoid context-overflow and token cost; set to 0 / off for no truncation. Takes effect on the next report generation.
- New storage keys `ai_rss_article_extras` (AI results, highlights, tags, saved-doc refs) and `ai_rss_full_texts` (fetched full text). Legacy data is migrated automatically on first load.

### Performance

- **Storage**: the articles table now persists only lightweight fields; heavy fields live in dedicated keys, so a single read/star/AI-result change no longer rewrites the whole table. Heavy keys are write-coalesced (800 ms) — batch full-text fetches cause one disk write instead of N. Pending writes are flushed best-effort on plugin unload.
- **Rendering**: read/star state changes update only visible list items and the reader's state buttons in place (no full panel rebuild); data events are coalesced via `requestAnimationFrame`.
- **Translation**: streaming translation renders the original text as one text node per segment with a CSS fade instead of per-character DOM (≈28k nodes for 14k chars, visually identical); segment building and sanitize/post-process results are cached and shared between rendering and execution.
- **Hot spots**: sidebar stats reduced from O(subs × articles) to a single pass; favicon resolution runs in the background; article list uses a sort cache + lowercase search index; the global CORS patch no longer sends a default JSON content-type on body-less requests.
- **Minor**: opening the tab only backfills stale/never-fetched subscriptions; day-group labels, "x minutes ago" and reading-time are cached; subscription/category lists keep an internal sorted invariant; expired-article pruning runs at most once per hour.

### Fixed

- Custom tags lost on existing articles during refresh import.
- CORS global patch: duplicate second proxy request on success, and a wrong fallback to native fetch when that second request failed.

### Verification

- 48/48 unit tests passing; production build succeeds; type check clean apart from a pre-existing warning inside the `siyuan` dependency package.
