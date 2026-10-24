# LimitRSS v0.2.1

## 中文说明

### 修复

- **图片本地化静默失败**：保存到思源时勾选"下载远程图片到本地"，`netImg2LocalAssets` 失败原先无任何反馈；现在失败会提示"文档已保存，但远程图片本地化失败，图片仍为外链"。

### 文档与实现对齐

- **移除未实现的快捷键宣称**：三份 README（主/中/英）中的"快捷键"表格与设置 About 页"完整快捷键支持"均已移除（该功能未实现，避免文档误导；后续版本实现后会重新列出）。
- **About 页特性清单对齐实际功能**：移除未实现的"关键观点/思维导图/智能标签"，AI 行改为实际具备的"AI 流式总结 / 翻译 / 日报（深读正文可截断）"。
- **About 版本号不再写死**：由构建时从 `plugin.json` 读取注入（webpack `DefinePlugin`），随发版自动更新。

## English

### Fixed

- **Silent image-localization failure**: when saving to SiYuan with "download remote images locally" checked, failures of `netImg2LocalAssets` were previously silent; a warning toast now informs that the document was saved but images remain as external links.

### Docs aligned with implementation

- **Removed unimplemented shortcut-key claims**: the "Keyboard" sections in all three READMEs and the "full keyboard shortcut support" line in the About panel are gone (feature not implemented; will be re-listed once shipped).
- **About feature list now matches reality**: dropped unimplemented "key points / mindmap / smart tags"; AI line now states the shipped "streaming summary / translation / daily report (deep-dive content truncation)".
- **About version is no longer hardcoded**: injected at build time from `plugin.json` via webpack `DefinePlugin`, so it can no longer drift from the real release.
