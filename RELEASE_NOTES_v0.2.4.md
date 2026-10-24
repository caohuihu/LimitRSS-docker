# LimitRSS v0.2.4

## 中文说明

### 新增

- **保存到思源支持"包含 AI 结果"勾选**：保存对话框新增"AI 结果"勾选区（按 总结/翻译 逐条勾选，默认全选；从单条结果的"保存到思源"进入时只预选该条）。勾选内容以 `## AI <名称>` 小节追加到文档末尾，HTML 类结果（如翻译）自动转 Markdown，并受"链接清理"约束。
- **AI 结果卡片增强**：折叠/展开、一键复制文本（翻译先转纯文本）、"附加到思源" → "保存到思源"。

### 修复

- **AI 总结/翻译此前从未真正写入保存的文档**（`composeMd` 忽略了 `aiResults`，"附加到思源"名存实亡）；本版起按勾选真正写入。
- AI 卡片字号写死 14px → 现跟随"设置 → 外观 → 字号"。

## English

### Added

- **Save-to-SiYuan now supports an "Include AI results" option**: a per-result checkbox group (summary / translation) in the save dialog (all on by default; entering from a result's Save button pre-checks only that one). Selected results are appended as `## AI <name>` sections; HTML results (e.g. translations) are converted to Markdown and follow link-cleaning rules.
- **AI result card enhancements**: collapse/expand, one-click copy (translation converted to plain text), and "Attach to SiYuan" is now "Save to SiYuan".

### Fixed

- **AI summary/translation were never actually written into saved documents** (`composeMd` ignored `aiResults`, so "Attach to SiYuan" was a no-op for them). They are now genuinely written in according to the checkboxes.
- AI card font was hardcoded to 14px; it now follows Settings → Appearance → font size.
