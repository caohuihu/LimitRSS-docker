# LimitRSS v0.2.8

## 中文说明

### 新功能

- **保存模板新增 AI 变量，输出格式自定义**（设置 → 保存到思源 → Markdown 模板）：
  - `{{ai_summary}}`：AI 总结（适合放文章前面）
  - `{{ai_translation}}`：完整译文（适合放文末）
  - `{{content_translated}}`：原文每段后紧跟斜体译文（逐段对照）
  - `{{title_translated}}`：翻译后标题（未翻译回退原标题）
  - 未生成/未勾选渲染为空；模板用了 AI 变量后不再文末重复追加
- **一键预设**：总结在前·译文在尾 / 总结在前·逐段对照 / 恢复默认
- **翻译段级映射持久化**，支持逐段对照保存；旧数据自动降级为"原文+完整译文"

### 修复

- 保存对话框"AI 结果"勾选现在真正生效（此前自动追加时忽略勾选）

## English

### Added

- **AI template variables for saving**: `{{ai_summary}}` (put summary before the article), `{{ai_translation}}` (full translation at the end), `{{content_translated}}` (per-paragraph original + italic translation), `{{title_translated}}` (fallback to original). One-click presets included.
- **Per-segment translation persistence** with graceful fallback for legacy data.

### Fixed

- Save-dialog "AI results" checkboxes now actually take effect.
