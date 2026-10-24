# LimitRSS v0.2.3

## 中文说明

### 修复

- **阅读快捷键完全失效**：v0.2.2 的 keydown 监听绑在面板容器上，点击文章/列表后焦点实际停在 `body` 或思源编辑器，按键进不了面板，J/K/M/S 等全部无效（与思源版本无关；SDK `Plugin` 类没有快捷键注册 API）。现改为 `document` 级监听 + `activeElement` 焦点判定：点击面板内任意处一次即激活；焦点在思源编辑器、输入框或弹窗打开时绝不拦截。

## English

### Fixed

- **Keyboard shortcuts completely unresponsive**: v0.2.2 bound the keydown listener to the panel container, but after clicking an article/list item focus actually stayed on `body` or the SiYuan editor, so keys never reached the panel and J/K/M/S/… all failed (unrelated to SiYuan version; the SDK `Plugin` class has no shortcut-registration API). Now the listener is on `document` with an `activeElement` guard: one click anywhere in the panel activates shortcuts; never intercepted while focus is in the SiYuan editor, an input, or a dialog is open.
