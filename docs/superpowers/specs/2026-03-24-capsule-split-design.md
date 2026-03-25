# 胶囊按钮分体设计方案

## 1. 概述

将 `CapsuleButton` 组件从单一胶囊按钮改为左右双按钮布局：
- **左按钮**：显示应用图标 + 名称，点击直接打开上次使用的应用
- **右按钮**：纯下拉箭头，点击展开下拉列表选择其他应用

## 2. 背景

现有 `CapsuleButton` 组件（`src/renderer/src/components/Terminal/CapsuleButton.tsx`）是一个单一的 Pill 按钮，点击任意区域都会弹出下拉列表。用户希望改进为：点击左区直接打开应用，仅点击右区才展开下拉列表，减少一次点击操作。

## 3. 设计决策

### 视觉形式

**选择：两个独立按钮（方案 A）**

```
[VS Code] [▼]
```

- 左按钮：应用图标 + 名称，点击直接打开
- 右按钮：纯 chevron-down 图标，点击展开下拉
- 两按钮间距紧密（4px），视觉上形成关联

### 备选方案

| 方案 | 描述 | 放弃原因 |
|------|------|----------|
| 方案 B | 胶囊内分区：`[VS Code \| ▼]` | 视觉整体但交互区域分割不够明确 |
| 方案 C | 主按钮 + 次按钮：`[▶ Open VS Code] [▼]` | 占用空间大，不够简洁 |

## 4. 组件规范

### 尺寸规格

| 属性 | 值 |
|------|-----|
| 按钮高度 | 28px |
| 圆角 | 6px |
| 左按钮 padding | 9px 水平, 3px 垂直 |
| 右按钮 padding | 6px |
| 按钮间距 | 4px |

### 样式继承

保持与现有 `Pill` 组件一致的样式变量：
- 背景：`rgba(255,220,160,0.05)`
- 边框：`0.5px solid rgba(255,220,160,0.10)`
- 文字色：`var(--t2)` / `var(--t3)`
- Hover 背景：`rgba(255,220,160,0.09)`

### 图标尺寸

| 元素 | 尺寸 |
|------|------|
| 应用图标 | 14px |
| 下拉箭头 | 9px |

## 5. 交互行为

### 点击行为

| 区域 | 点击行为 |
|------|----------|
| 左按钮 | 始终直接打开应用，无论下拉是否展开（先关闭下拉，再打开应用） |
| 右按钮 | 切换 `showDropdown` 状态 |
| 下拉外部 | 关闭下拉列表 |

**关键规则**：左按钮点击**始终**打开应用并关闭下拉列表，不会因为下拉展开而改变行为。

### Hover 效果

| 按钮 | Hover 效果 |
|------|------------|
| 左按钮 | 背景变为 `rgba(255,220,160,0.09)` |
| 右按钮 | 同上 |
| 下拉项 | 背景变为 `var(--hv)`，文字变为 `var(--t2)` |

### Chevron 状态

当下拉列表展开时，右按钮的 chevron 图标旋转 180 度（向上箭头），表示"点击关闭"。

### Active/Pressed 状态

按钮被点击时：背景略微加深（`rgba(255,220,160,0.12)`），提供按下反馈。

### Focus 状态

使用键盘 Tab 导航时：
- Focus ring: `2px solid var(--color-accent)`，offset 1px
- Outline 设置为 `none`（由 focus ring 替代）

### 键盘导航

| 按键 | 行为 |
|------|------|
| Tab | 在左按钮、右按钮之间切换 focus |
| Enter / Space | 激活当前 focus 的按钮 |
| Escape | 关闭展开的下拉列表 |
| 下拉内 ↑/↓ | 在下拉列表中导航 |

### ARIA 属性

| 元素 | ARIA 属性 |
|------|-----------|
| 左按钮 | `aria-label="打开 {应用名}"` |
| 右按钮 | `aria-expanded={showDropdown}`, `aria-haspopup="listbox"`, `aria-label="选择其他应用"` |
| 下拉列表 | `role="listbox"`, `id="app-dropdown"` |
| 下拉项 | `role="option"`, `aria-selected={isSelected}` |

### 状态处理

1. **无上次应用时**：显示 `externalApps[0]`，左按钮仍然直接打开
2. **只有一个应用时**：右按钮隐藏（无可选择的其他应用）
3. **下拉列表展开时**：`showDropdown` 为 true，点击外部区域设置为 false

### Tooltip

| 元素 | Tooltip 内容 |
|------|--------------|
| 左按钮 | `"打开 {应用名}"` |
| 右按钮 | `"选择其他应用"` |

## 6. 数据流

### 状态来源

- `lastExternalApp`: 来自 `settingsStore`，上次打开的应用 ID
- `externalApps`: 来自 `settingsStore`，可用应用列表
- `setLastExternalApp()`: 应用打开成功后更新状态并持久化

### 核心逻辑

```typescript
const lastApp = externalApps.find(a => a.id === lastExternalApp) || externalApps[0]

// 左按钮点击
const handleQuickOpen = async () => {
  if (!lastApp || !cwd) return
  const result = await window.api.app.openExternal(lastApp.command, cwd)
  // ... toast feedback
}

// 右按钮点击
const toggleDropdown = () => setShowDropdown(!showDropdown)
```

## 7. 边界情况

| 场景 | 处理方式 |
|------|----------|
| `lastExternalApp` 对应的应用已被卸载 | 回退到 `externalApps[0]` |
| `externalApps` 为空 | 整个胶囊按钮不显示 |
| 只有一个应用 | 右下拉按钮隐藏（无可选择的其他应用） |

## 8. 文件变更

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/renderer/src/components/Terminal/CapsuleButton.tsx` | 修改 | 重构为左右双按钮结构 |

## 9. 验证标准

- [ ] 左按钮点击直接打开应用，不弹出下拉
- [ ] 右按钮点击弹出下拉列表
- [ ] 下拉列表展开时 chevron 旋转 180 度
- [ ] 下拉列表显示所有可用应用
- [ ] 点击外部区域关闭下拉
- [ ] 应用打开成功后更新 `lastExternalApp`
- [ ] 无可用应用时胶囊不显示
- [ ] 只有一个应用时右按钮隐藏
- [ ] Hover 效果正常
- [ ] Active/Pressed 状态正常
- [ ] Tab 键盘导航正常工作
- [ ] Escape 键关闭下拉列表
- [ ] Tooltip 显示正确
- [ ] ARIA 属性正确设置
- [ ] Focus ring 在键盘导航时显示
