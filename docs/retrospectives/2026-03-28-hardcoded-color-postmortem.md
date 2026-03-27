# 复盘：硬编码暖色值导致 dazi 主题渲染异常

**日期**: 2026-03-28
**影响范围**: 11 个组件文件，约 40 处样式声明
**严重程度**: High — dazi 主题下全部按钮/边框/背景均显示错误颜色

---

## 问题描述

软件运行时（dazi 主题）所有按钮、边框、hover 态的颜色明显偏暖，与设计参考 HTML 差异巨大。用户截图对比明确显示：实际软件呈现棕黄暖色调，参考效果为冷中性色调。

---

## 根本原因

### 原因 1（核心）：background 完全硬编码为暖色值

```tsx
// CapsuleButton.tsx — AppButton / DropdownToggle / Pill（各自 4-5 行）
style={{
  background: 'rgba(255,220,160,0.05)',   // ← 硬编码，完全不走变量
  border: '0.5px solid var(--bm, rgba(255,220,160,0.10))',
}}
onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,220,160,0.09)')}
onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,220,160,0.05)')}
onMouseDown={(e)  => (e.currentTarget.style.background = 'rgba(255,220,160,0.12)')}
onMouseUp={(e)    => (e.currentTarget.style.background = 'rgba(255,220,160,0.09)')}
```

`rgba(255,220,160,...)` 是 brown 主题的暖色系。在 dazi 主题下，这些值**不会**被任何变量覆盖，因为它们根本不是变量。

### 原因 2（次要）：CSS 变量 fallback 值写的是暖色

```tsx
border: '0.5px solid var(--bm, rgba(255,220,160,0.10))'
//                           ↑ fallback 是暖色
```

在上一轮修复（2026-03-27）之前，`:root` 中没有定义 `--bm`，所以所有用了 fallback 的声明也都渲染为暖色。修复后 `--bm` 已被正确定义，但 `background` 依然是硬编码，fallback 问题只是被掩盖。

### 原因 3：缺少完整的 token 定义

上一轮只补了 `--bs/--bm/--hv/--ac/--t1-t4/--orange`，但没有补：
- `--bg-btn`（按钮静止背景）
- `--hv2`（中等 hover 背景）
- `--ac-focus`（input focus 边框色）

导致即使想用变量，也没有对应的 token 可用。

---

## 影响文件清单

| 文件 | 硬编码数量 | 问题类型 |
|------|----------|----------|
| `Terminal/CapsuleButton.tsx` | 16 | background 静止/hover/active 态全硬编码 |
| `Terminal/CommandInput.tsx` | 6 | background + border + focus 态硬编码 |
| `Terminal/TerminalPanel.tsx` | 2 | --bs fallback + hover background |
| `Terminal/TerminalToolbar.tsx` | 1 | --bs fallback |
| `Terminal/QuickButtonsBar.tsx` | 1 | --bs fallback |
| `Sidebar/RepoItem.tsx` | 3 | badge background 硬编码 (#252018) + fallback |
| `Sidebar/WorktreeItem.tsx` | 2 | --ac fallback + 文字色 #8B949E 硬编码 |
| `Sidebar/Sidebar.tsx` | 1 | --bs fallback |
| `Sidebar/AddRepoButton.tsx` | 1 | --bs fallback |
| `Layout/StatusBar.tsx` | 1 | --bs fallback |
| `index.css (:root)` | 0 直接 | 缺少 --hv2/--bg-btn/--ac-focus token 定义 |

---

## 修复方案

### 1. 新增 3 个缺失 token（:root 和 brown 主题均补充）

```css
/* :root (dazi 冷色) */
--hv2:    rgba(255, 255, 255, 0.08);    /* 悬停背景（中） */
--bg-btn: rgba(255, 255, 255, 0.04);    /* 按钮静止背景 */
--ac-focus: rgba(255, 255, 255, 0.14);  /* input focus 边框色 */

/* [data-theme="brown"] */
--hv2:    rgba(255, 210, 140, 0.09);
--bg-btn: rgba(255, 210, 140, 0.05);
--ac-focus: rgba(255, 210, 140, 0.18);
```

### 2. 替换所有硬编码值为 token

```tsx
// Before
background: 'rgba(255,220,160,0.05)'
onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,220,160,0.09)'}

// After
background: 'var(--bg-btn)'
onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hv2)'}
```

### 3. 清除所有 fallback 暖色值

```tsx
// Before
border: '0.5px solid var(--bm, rgba(255,220,160,0.10))'

// After
border: '0.5px solid var(--bm)'
```

---

## 根本原因分析

**为什么会发生这个问题？**

开发者在构建组件时只运行了 brown 主题（`data-theme="brown"`）进行视觉调试。brown 主题下写死的 `rgba(255,220,160,...)` 和 token 值视觉上一致，看不出问题。切换到 dazi 主题时，所有 token 都正确渲染为冷色，但硬编码值不变，造成混用。

这是**单主题开发陷阱**：只在一个主题下验证 → 硬编码值与 token 值视觉相同 → 没有报错 → 问题进入代码库。

---

## 预防规范

### 规范 1：所有颜色必须通过 CSS token

组件样式中**禁止出现** `rgba(r, g, b, a)` 或 `#rrggbb` 形式的颜色字面量（仅白/黑/透明等中性值除外）。

```tsx
// ❌ 禁止
style={{ background: 'rgba(255,220,160,0.05)' }}
style={{ color: '#8B949E' }}
style={{ background: '#252018' }}

// ✅ 正确
style={{ background: 'var(--bg-btn)' }}
style={{ color: 'var(--t2)' }}
style={{ background: 'var(--ac)' }}
```

### 规范 2：CSS 变量不写 fallback 值

fallback 值会掩盖"token 未定义"的问题，使 token 缺失变得不可见。

```tsx
// ❌ 禁止（fallback 暗藏危机）
border: '0.5px solid var(--bm, rgba(255,220,160,0.10))'

// ✅ 正确（token 未定义时渲染异常，立刻暴露问题）
border: '0.5px solid var(--bm)'
```

**例外**：只有当 fallback 是真正的中性安全值（如 `transparent`、`inherit`）时，才可以写 fallback。

### 规范 3：新增 token 必须两个主题同步定义

每次在 `:root` 新增 token，必须同时在 `[data-theme="brown"]` 中添加对应的暖色版本。

```css
/* ✅ 每次新增都要成对出现 */
:root              { --new-token: rgba(255, 255, 255, 0.XX); }
[data-theme="brown"] { --new-token: rgba(255, 210, 140, 0.XX); }
```

### 规范 4：开发时双主题验证

任何涉及颜色/背景/边框的组件修改，发布前必须在**两个主题**下截图对比。

快速切换方式：
```javascript
// 浏览器控制台
document.documentElement.dataset.theme = 'brown'  // 切到 brown
document.documentElement.dataset.theme = ''        // 切回 dazi
```

### 规范 5：CI 检查（可选，推荐）

可添加 lint 规则检查 `.tsx` 文件中的 `rgba(2[0-9]{2}` 模式（排除 `rgba(0,0,0` 和 `rgba(255,255,255`），在 PR 时自动拦截。

---

## Token 完整对照表（当前状态）

| Token | dazi（:root） | brown | 用途 |
|-------|--------------|-------|------|
| `--bs` | `rgba(255,255,255,0.06)` | `rgba(255,210,140,0.06)` | 细边框（分割线）|
| `--bm` | `rgba(255,255,255,0.09)` | `rgba(255,210,140,0.09)` | 中等边框（按钮）|
| `--bg-btn` | `rgba(255,255,255,0.04)` | `rgba(255,210,140,0.05)` | 按钮静止背景 |
| `--hv` | `rgba(255,255,255,0.04)` | `rgba(255,210,140,0.045)` | 轻 hover 背景 |
| `--hv2` | `rgba(255,255,255,0.08)` | `rgba(255,210,140,0.09)` | 中 hover 背景 |
| `--ac` | `rgba(255,255,255,0.07)` | `rgba(255,210,140,0.075)` | 选中/激活背景 |
| `--ac-focus` | `rgba(255,255,255,0.14)` | `rgba(255,210,140,0.18)` | input focus 边框 |
| `--t1` | `#E8EDF4` | `#e4dece` | 主文字 |
| `--t2` | `#9A9FA8` | `#afa89c` | 次要文字 |
| `--t3` | `#606570` | `#706860` | 弱文字 |
| `--t4` | `#484F58` | `#4a4540` | 极弱文字 |
| `--orange` | `#C4956A` | `#C4956A` | 强调色 |

---

## 相关提交

| Commit | 内容 |
|--------|------|
| `f578a9c` | 初次补全 dazi 主题 9 个 shorthand token（修复 token 缺失）|
| `52ae39b` | 清除全部硬编码暖色值，新增 --hv2/--bg-btn/--ac-focus（本次修复）|
