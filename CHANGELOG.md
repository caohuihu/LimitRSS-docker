# CHANGELOG.md

## [v0.2.7] 2026-10-25

### 中文说明

#### 修复（Fixed）

- **AI 总结生成后未真正保存（保存对话框里没有"AI 总结"选项）**：流式接口的 `onDone` 在 Promise 完成前触发，内部引用了尚未初始化的结果变量（TDZ ReferenceError，即日志里的 `Cannot access 'a' before initialization`），导致总结只显示在卡片上、从未写入存储。现在保存操作在 `await` 完成后执行，生成即持久化；翻译流程原本正确，不受影响。

#### 改进（Improved）

- **浏览器 https 模式跨域请求改走内核 API 代理**：`siyuan.api.forwardProxy` 可能触发浏览器端 fetch，访问 `http://` 端点（如局域网 AI 服务）产生 Mixed Content 告警；现在 https 页面直接用内核服务端抓取的 `fetchSyncPost("/api/network/forwardProxy")`，消除告警。http/Electron 环境保持原顺序不变。
- **清理未使用的 `runPrompt` 旧代码**（60 行死代码）。

### English

#### Fixed

- **AI summary was displayed but never persisted** (no "AI summary" option in the save dialog): the stream callback `onDone` fires before the promise resolves and referenced the not-yet-initialized result variable (TDZ `ReferenceError: Cannot access ... before initialization`), so the result stayed in the card but was never written to storage. Persistence now happens after the `await`; translation was already correct.

#### Improved

- **Browser HTTPS mode now proxies cross-origin requests via the kernel API**: `siyuan.api.forwardProxy` can trigger a browser-side fetch that warns Mixed Content for `http://` endpoints (e.g. LAN AI servers); HTTPS pages now use the kernel-side `fetchSyncPost("/api/network/forwardProxy")` directly.
- **Removed unused legacy `runPrompt` code**.

## [v0.2.6] 2026-10-25

### 中文说明

#### 改进（Improved）

- **"AI 结果"勾选区始终显示 总结/翻译 两种类型**：之前只列出该文章**已生成过**的结果，没生成总结时就看不到"AI 总结"选项，容易误以为功能不存在。现在内置的文章级类型（AI 总结、AI 翻译）始终可见：已生成的可勾选（默认全勾），未生成的显示"尚未生成：AI 总结。可先在阅读器顶部点击对应 AI 图标生成，再回来保存。"的提示。

### English

#### Improved

- **The "AI results" checkbox area now always shows both Summary and Translation**: previously only results already generated for the article were listed, so without a generated summary the "AI summary" option was invisible and the feature seemed missing. The built-in article-level types (AI summary / AI translation) are now always visible: generated ones are checkable (checked by default); missing ones show a hint to generate them in the reader first.

## [v0.2.5] 2026-10-25

### 中文说明

#### 修复（Fixed）

- **重启后 AI 功能提示"请先在设置中配置 AI 提供商"（实际已配置）**：`onload` 在数据加载完成前就用默认配置构造了 `AIService`，而加载完成时的一次 emit 又被晚注册的订阅错过，导致重启/重载插件后 AI 配置"丢失"（打开设置页才恢复）。现在 `whenReady` 后立即把已加载配置同步给 `AIService`，AI 提供商/提示词/日报设置重启后即刻生效。
- **浏览器（Docker/https）模式下 http:// 图片被混合内容策略拦截**（favicon、正文图片，控制台 Mixed Content 告警）：新增 `secureResourceUrl`，在 https 应用下把 `<img>` 加载的 `http://` 地址升级为 `https://`（正文渲染、订阅图标、图标预览）；fetch 类请求本就走内核代理，不受影响。

### English

#### Fixed

- **"Please configure an AI provider in Settings" after restart despite providers being configured**: `onload` built the `AIService` with default settings before data was loaded, and the one-time load-completion emit was missed by the late-registered subscription — so AI settings were effectively lost until the settings page was opened. The loaded settings are now synced to the `AIService` right after `whenReady()`, so providers/prompts/daily-report settings survive restarts.
- **Mixed-content blocks for `http://` images in browser (Docker/https) mode** (favicons, article images; console Mixed Content warnings): added `secureResourceUrl` which upgrades `http://` to `https://` for `<img>` loads (article rendering, subscription icons, icon preview) when the app runs over https. Fetched requests already go through the kernel proxy and are unaffected.

## [v0.2.4] 2026-10-24

### 中文说明

#### 新增（Added）

- **保存到思源支持"包含 AI 结果"勾选**：保存对话框新增"AI 结果"勾选区（按 总结/翻译 逐条勾选，默认全选；从单条结果的"保存到思源"进入时只预选该条），勾选内容以 `## AI <名称>` 小节追加到文档末尾，HTML 类结果（如翻译）自动转 Markdown，并受"链接清理"规则约束。
- **AI 结果卡片增强**：新增 折叠/展开（长总结不再顶走正文）、一键复制文本（翻译结果先转纯文本）、"附加到思源"改为"保存到思源"并联动勾选。

#### 修复（Fixed）

- **AI 结果此前从未真正写入保存的文档**：`saveToSiyuan` 虽然合并了 `aiResults`，但 `composeMd` 完全没有使用它，"附加到思源"按钮实际保存的文档不含总结/翻译；本版起按勾选真正写入。
- **AI 卡片字号写死 14px**：现跟随"设置 → 外观 → 字号"（`--ar-reader-font-size`）。

### English

#### Added

- **Save-to-SiYuan now supports an "Include AI results" option**: the save dialog gains a per-result checkbox group (summary / translation, all on by default; entering from a single result's "Save" button pre-checks only that one). Selected results are appended to the saved document as `## AI <name>` sections; HTML results (e.g. translations) are converted to Markdown and follow the link-cleaning rules.
- **AI result card enhancements**: collapse/expand (long summaries no longer push the article down), one-click copy (translation results are converted to plain text first), and "Attach to SiYuan" becomes "Save to SiYuan" wired to the checkbox.

#### Fixed

- **AI results were never actually written into saved documents**: `saveToSiyuan` merged `aiResults` but `composeMd` ignored them, so the "Attach to SiYuan" button saved documents without the summary/translation. Now the checked results are genuinely written in.
- **AI card font was hardcoded to 14px**: it now follows Settings → Appearance → font size (`--ar-reader-font-size`).

## [v0.2.3] 2026-10-24

### 中文说明

#### 修复（Fixed）

- **阅读快捷键完全失效**：v0.2.2 把 keydown 监听绑在面板容器上，而点击文章/列表后浏览器焦点停在 `body` 或思源编辑器，按键事件根本进不了面板，导致 J/K/M/S 等全部无效（与思源版本无关；SDK 的 `Plugin` 类本就没有快捷键注册 API）。现改为 `document` 级监听 + `activeElement` 焦点判定：点击面板内任意处一次即自动聚焦面板根，快捷键立即生效；焦点在思源编辑器、任何输入框或弹窗打开时绝不拦截，保证不影响正常打字与思源自身按键。

### English

#### Fixed

- **Keyboard shortcuts completely unresponsive**: v0.2.2 attached the keydown listener to the panel container, but after clicking an article/list item the browser focus stays on `body` or the SiYuan editor, so key events never reached the panel and J/K/M/S/… did nothing (unrelated to the SiYuan version; the SDK `Plugin` class has no shortcut-registration API to begin with). The listener now lives on `document` with an `activeElement` guard: a single click anywhere in the panel focuses the panel root and shortcuts become active instantly; while focus is in the SiYuan editor, any input field, or a dialog is open, no key is ever intercepted.

## [v0.2.2] 2026-10-24

### 中文说明

#### 新增（Added）

- **阅读快捷键**：`J/K` 上下篇、`M` 切已读、`S` 切星标、`O` 打开原文、`R` 刷新、`I` 切 AI 总结面板、`?` 快捷键帮助、`⌘/Ctrl+S` 保存当前文章到思源、`⌘/Ctrl+F` 聚焦搜索。仅在面板内聚焦时生效；输入框与弹窗打开时不拦截。
- **站点 Feed 自动发现**：添加订阅时直接粘贴站点主页（如 https://example.com），自动抓取首页 `<link rel="alternate">` 声明并依次探测常见 feed 路径（/feed、/rss.xml、/atom.xml 等，最多 8 个候选），命中后自动回填 feed URL 入库。
- **批量操作**：文章列表新增"批量"菜单——星标全部 / 取消星标 / 全部标为未读（配合已有的"全部标为已读"按钮）。
- **"打开文章自动标记已读"开关**（设置 → 阅读，默认开启保持原有行为；关闭后需手动标记）。

#### 修复（Fixed）

- **跨实例重复刷新**：完整版与 dock 同时打开时，两个实例的周期刷新会对同一订阅并发发请求。现由模块级在途锁保证同一源同一时间只有一个请求，另一实例跳过并沿用前者的结果。

### English

#### Added

- **Keyboard shortcuts**: `J/K` next/previous, `M` toggle read, `S` toggle star, `O` open original, `R` refresh, `I` toggle AI summary panel, `?` shortcut help, `⌘/Ctrl+S` save current article to SiYuan, `⌘/Ctrl+F` focus search. Active only when the panel has focus; never intercepts typing or dialogs.
- **Site feed auto-discovery**: paste a site URL when adding a subscription; the plugin reads `<link rel="alternate">` from the homepage and probes common feed paths (up to 8 candidates), then stores the discovered feed URL.
- **Bulk actions**: the article list now has a bulk menu — star all / unstar all / mark all unread (alongside the existing "mark all read").
- **"Auto-mark read on open" toggle** (Settings → Reading, default on to preserve previous behavior; when off you mark read manually).

#### Fixed

- **Duplicate refresh across instances**: with both the full tab and the dock open, their periodic refreshers issued concurrent requests for the same subscription. A module-level in-flight lock now guarantees one request per feed at a time; the other instance skips and reuses the result.

## [v0.2.1] 2026-10-24

### 中文说明

#### 修复（Fixed）

- **图片本地化静默失败**：保存到思源时勾选"下载远程图片到本地"，`netImg2LocalAssets` 失败原先无任何反馈；现在失败会提示"文档已保存，但远程图片本地化失败，图片仍为外链"。

#### 文档与实现对齐（Docs）

- **移除未实现的快捷键宣称**：三份 README（主/中/英）中的"快捷键"表格与设置 About 页"完整快捷键支持"均已移除（该功能未实现，避免文档误导；后续版本实现后会重新列出）。
- **About 页特性清单对齐实际功能**：移除未实现的"关键观点/思维导图/智能标签"，AI 行改为实际具备的"流式总结 / 翻译 / 日报（深读正文可截断）"。
- **About 版本号不再写死**：由构建时从 `plugin.json` 读取注入（webpack `DefinePlugin`），随发版自动更新，杜绝"页面写 v0.1.6 实际 v0.2.x"的漂移。

### English

#### Fixed

- **Silent image-localization failure**: when saving to SiYuan with "download remote images locally" checked, failures of `netImg2LocalAssets` were previously silent; a warning toast now informs that the document was saved but images remain as external links.

#### Docs

- **Removed unimplemented shortcut-key claims**: the "Keyboard" sections in all three READMEs and the "full keyboard shortcut support" line in the About panel are gone (feature not implemented; will be re-listed once shipped).
- **About feature list now matches reality**: dropped unimplemented "key points / mindmap / smart tags"; AI line now states the shipped "streaming summary / translation / daily report (deep-dive content truncation)".
- **About version is no longer hardcoded**: injected at build time from `plugin.json` via webpack `DefinePlugin`, so it can no longer drift from the real release.

## [v0.2.0] 2026-10-24

### 中文说明

#### 新增（Added）

- AI 日报「深读正文截断」设置：`设置 → AI 日报` 新增"截断文章正文"开关与"每篇保留字符数"（0–50000，默认 6000）。深读阶段发给 AI 的正文超过上限时自动截断并标注 `[…过长已截断]`，避免长文撑爆上下文/费用；关闭或填 0 则不截断，修改后下次生成日报生效。
- 数据层拆分键 `ai_rss_article_extras`（AI 结果/高亮/标签/已保存文档）与 `ai_rss_full_texts`（抓取全文）：旧数据首次加载自动迁移，无需手动操作。

#### 性能优化（Improved）

- **P0 存储层**：文章主表只持久化轻量字段；全文/AI 结果等大字段拆到独立键，单次 `已读/星标/AI 结果` 变更不再重写整张文章表；大字段键 800ms 写合并（批量抓全文 N 次落盘 → 1 次），插件卸载时尽力立即落盘。
- **P0 渲染**：已读/星标变化时文章列表只对可见条目做 class 切换、阅读器只切换状态按钮，不再整栏重建；数据类事件走 rAF 合并渲染。
- **P0 翻译**：流式翻译原文由"逐字符 DOM（1.4 万字 ≈ 2.8 万节点）"改为整段文本节点 + CSS 过渡（视觉一致）；翻译分段与正文 sanitize/postProcess 结果加缓存，渲染与翻译执行共用一次构建。
- **P1 热点**：侧栏统计由 O(订阅数×文章数) 降为单遍遍历；favicon 解析改为后台执行，不再阻塞刷新管线（刷新进度不再被最长 ~20s 的图标抓取拖住）；文章列表排序缓存 + 小写搜索索引；CORS 全局拦截对无 body 请求不再附带默认 JSON content-type。
- **P2 次要**：开 tab 只补刷过期/未抓取的订阅源（不重复打全量）；日期分组、"x 分钟前"、阅读时长加缓存；订阅/分类列表内部保持有序；过期文章清理降为最多每小时一次。

#### 修复（Fixed）

- 刷新入库已有文章时，其自定义标签（tags）丢失的问题。
- CORS 全局拦截在代理成功时仍会重复发第二次请求、且第二次失败时误回退原生 fetch 的问题。

#### 验证

- 单测 48/48 通过；生产构建成功（`package.zip` 已随构建更新）；类型检查仅剩思源依赖包内部既有告警。

### English

#### Added

- Daily-report content truncation settings: `Settings → AI Daily` now has a "Truncate article content" toggle and a per-article character limit (0–50000, default 6000). Content sent to the AI in the deep-dive stage is truncated with a `[…]` marker to avoid context-overflow and token cost; set to 0 / off for no truncation. Takes effect on the next report generation.
- New storage keys `ai_rss_article_extras` (AI results, highlights, tags, saved-doc refs) and `ai_rss_full_texts` (fetched full text). Legacy data is migrated automatically on first load.

#### Performance

- **Storage**: the articles table now persists only lightweight fields; heavy fields (full text, AI results…) live in dedicated keys, so a single read/star/AI-result change no longer rewrites the whole article table. Heavy keys are write-coalesced (800 ms) — e.g. batch full-text fetches cause one disk write instead of N. Pending writes are flushed best-effort on plugin unload.
- **Rendering**: read/star state changes update only visible list items and the reader's state buttons in place (no full panel rebuild); data events are coalesced via `requestAnimationFrame`.
- **Translation**: streaming translation renders the original text as one text node per segment with a CSS fade instead of a per-character DOM (≈28k nodes for 14k chars, visually identical); segment building and sanitize/post-process results are cached and shared between rendering and execution.
- **Hot spots**: sidebar stats reduced from O(subs × articles) to a single pass; favicon resolution runs in the background and no longer blocks the refresh pipeline; article list uses a sort cache + lowercase search index; the global CORS patch no longer sends a default JSON content-type on body-less requests.
- **Minor**: opening the tab only backfills stale/never-fetched subscriptions; day-group labels, "x minutes ago" and reading-time are cached; subscription/category lists keep an internal sorted invariant; expired-article pruning runs at most once per hour.

#### Fixed

- Custom tags (`tags`) lost on existing articles during refresh import.
- CORS global patch: duplicate second proxy request on success, and a wrong fallback to native fetch when that second request failed.

#### Verification

- 48/48 unit tests passing; production build succeeds; type check clean apart from a pre-existing warning inside the `siyuan` dependency package.

## [v0.1.7] 2026-08-07

### Added

- AI 日报两阶段生成：阶段一全量元数据扫描（标题/来源/分类，支持每日近千篇），阶段二对重点文章分批深读，模板拼接最终日报。
- 日报覆盖模式设置：快速（仅标题级全景）/ 均衡（全景 + 重点深读）/ 全面（全景 + 更大范围深读），可调整重点深读数量、每批篇数与并发请求数。
- 组件级缓存：全景速览、选中文章列表、单篇深读结果分别缓存，重复生成时只重做合并。
- 全景超长自动分块（超过约 90K 字符按块扫描后合并），兼容小上下文提供商。
- 新增纯逻辑模块 `src/dailyReportCore.ts`、`src/markdownClean.ts` 与回归测试（总计 47 例）。
- AI 日报排版校正：关键句后编号自动转为文章链接；剥离“值得深读的文章编号”裸编号小节；重点文章以“### [标题](链接) + 正文”呈现；去除重复的“今日速览”标题。
- 设置新增独立“AI 日报”标签页，介绍文案随覆盖模式变化；新增“今日速览显示链接”开关（默认开启）。
- 文章导出新增“链接清理”选项（默认开启）：清理正文中除原文文章链接外的 Markdown/HTML 链接，只保留文字；导出时自动剥离插件 frontmatter。

### Changed

- 日报从“单次最多 40 篇”升级为两阶段流水线；旧缓存缺少新字段时自动全量重算。
- 保存默认模板不再包含 `custom-ai-rss-source/link` frontmatter；“包含原文链接”选项生效（取消后移除原文链接）。
- AI 日报导出为纯文本：剥离全部链接与 ↗ 箭头标记。

### Fixed

- 每日近千篇文章时只能覆盖前 40 篇、无法提供全面信息视野的问题。
- 连续链接清理残留空标签链接 `[](article:…)`。
- HTML 链接转 Markdown 格式错误（`[DeepSeek(https://…)]` → 标准 `[DeepSeek](https://…)`），导致链接清理无法识别。
- “今日速览显示链接”开关无效（关闭后残留 `[n]` 编号被渲染为链接）。

## [未发布] 2026-08-01（commit `06f1ca2`）

自 v0.1.6 以来的全部开发内容（阶段一、阶段二及多轮迭代、TDD 修复）。

### Added

- 入口：entryPosition 设置（顶栏左/右、Dock 左/右、隐藏）；集市与插件管理点击 LimitRSS 设置直达完整设置；命令面板兜底。
- Dock 单窗口三级视图（订阅 → 文章 → 阅读）：点击自动跳转、返回上一级、自动隐藏原界面并保留阅读位置、底部“完整界面打开”。
- 订阅源自定义图标：URL / Emoji / 上传图片（压缩 64px）；统一渲染（含 Emoji 文本渲染，修复 DOMTokenList 报错）。
- Emoji 选择面板：单列上下滚动、每行居中、加粗标签与背景色、取消按钮省略号。
- 保存目标“笔记本 + 路径输入框”：`/` 根路径、相对当前文档、文档 ID/可读路径、`{{now | date "20060102150405"}}` 模板、父目录自动创建。
- 保存路径按笔记本记忆（`save.pathsByNotebook`，随插件设置跨设备同步），切换笔记本自动切换路径。
- AI 总结卡片复制菜单：手机长按 / 桌面右键“复制文本”（复制卡片可见文本）。
- 日报汇总范围多选：全选/取消全选、分类色点、分类折叠展开、日期下拉式触发（点击外部关闭、内部操作不关）。
- 回归测试设施：Node 内置测试器（`npm test`），20 例；纯逻辑模块 `dailyScopeCore` / `longPress` / `aiCardMenu` / `saveTargetStore`。
- 项目文档：PROJECT / PLAN / STATUS / DECISIONS / RISKS / CHANGELOG。

### Changed

- 保存对话框目标位置：文档树选择器 → “笔记本下拉 + 路径输入框”。
- “笔记本”下拉宽度自适应（桌面 min 96px / max 45%，手机端 100% 完整显示名称）。
- 汇总范围面板：常驻 DOM、展开/折叠与勾选原地更新；重渲染保留 `scrollTop`。
- 手机端设置界面自适应布局；横向导航滚动位置保持；触摸拦截防穿透/左滑误触。
- 手机端图片菜单：改为“打开图片 / 复制图片链接”。
- AI 总结卡片复制：按钮 → 长按/右键菜单。
- 保存目标路径记忆：从临时输入改为按笔记本持久化。

### Fixed

- 初始化失败：`DOMTokenList` 收到含空格的 token（Emoji 图标相关）。
- 设置 Emoji 图标显示为空框/大范围空框、原订阅源图标不显示或显示同一图标。
- 手机端首次进入思源不显示插件（等待 storage 就绪后渲染）。
- AI 日报无法生成、重新生成后提示“生成结果为空”。
- 保存到思源的附加 AI 总结不显示、AI 总结预览不显示（功能移除）。
- “具体文档”下拉在部分笔记本无法展开（更换为路径输入方案）。
- 日报汇总范围面板展开/折叠时跳回顶部。
- 手机端复制图片失败、多次尝试导致思源崩溃。
- 手机端设置界面滚动穿透、横向滚动条点击后跳回最左边。
- 订阅源文章图片与内容重复（保存预处理去重）。
- 桌面端右键复制图片/复制图片链接失败（三通道降级）。
- AI 总结卡片“复制 AI 总结文本”按钮不可见。

### Removed

- 保存对话框“附加 AI 总结”与“AI 总结预览”区域。
- AI 总结卡片脚部“复制 AI 总结文本”按钮。
- 手机端图片“下载到相册/分享”入口（防崩溃）。
- 早期多端文字选中操作条（按需求取消，图片改为长按复制）。

### Build / Test

- webpack：i18n 缺失容错；`dev:once` 单次构建不驻留。
- 验证链路：`node --experimental-strip-types --test "tests/*.test.ts"`（20/20）、`npm run type-check`、`npm run build`、`npm run dev:once` 全部通过。
- 部署：`G:\思源-工作空间\siyuan\data\plugins\LimitRSS`（与 dist MD5 一致）。
