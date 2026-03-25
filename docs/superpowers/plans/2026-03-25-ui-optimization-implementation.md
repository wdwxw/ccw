# UI 优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实施方案 A — 柔和层次优化，系统性提升 UI 的氛围、比例和细节

**Architecture:** 纯 CSS 变量调整 + 组件尺寸微调，无需架构变更

**Tech Stack:** React + Tailwind CSS + TypeScript

---

## 文件结构

```
src/renderer/src/
├── index.css                              # CSS 变量（颜色、边框）
├── components/
│   ├── Layout/
│   │   ├── AppHeader.tsx                   # Header 高度 40→36px
│   │   └── StatusBar.tsx                   # StatusBar 高度 20→22px + 路径显示
│   ├── Sidebar/
│   │   ├── Sidebar.tsx                     # 宽度 258→240px + 内边距
│   │   ├── RepoItem.tsx                    # 列表项尺寸 + 字体权重
│   │   └── WorktreeItem.tsx                # 列表项尺寸 + 字体权重
│   └── Terminal/
│       ├── TerminalPanel.tsx               # Tab 栏高度 34→32px
│       └── TerminalToolbar.tsx             # 工具栏高度 36→34px + 按钮 padding
```

---

## Phase 1: 颜色系统（CSS 变量）

### Task 1: 更新 index.css 颜色变量

**Files:**
- Modify: `src/renderer/src/index.css:1-156`

- [ ] **Step 1: 更新 :root 背景色变量**

定位 `:root` 块，修改以下变量：
```css
--color-bg-primary:    #0D1117;  →  #111213;
--color-bg-secondary:  #161B22;  →  #1A1C1E;
--color-bg-tertiary:   #1C2128;  →  #1E2022;
--color-bg-elevated:   #21262D;  →  #252729;
```

- [ ] **Step 2: 更新强调色变量**

```css
--color-accent:        #1A56DB;  →  #C4956A;
--color-accent-hover:  #1E63F0;  →  #D4A574;
--color-accent-muted:  rgba(26,86,219,0.15);  →  rgba(196,149,106,0.12);
--color-accent-subtle: #182848;  →  #2A2018;
--color-accent-surface:#1B2F52;  →  #3A2A1A;
--color-accent-glow:   #1A3A6B;  →  #4A3520;
```

- [ ] **Step 3: 更新文字色变量**

```css
--color-text-primary:  #E6EDF3;  →  #E8EDF4;
--color-text-secondary:#8B949E;  →  #9A9FA8;
```

- [ ] **Step 4: 更新边框色变量**

```css
--color-border:        #30363D;  →  #2A2D32;
```

- [ ] **Step 5: 更新 brown 主题覆盖变量**

在 `[data-theme="brown"]` 块中同步更新上述变量

- [ ] **Step 6: 提交**

```bash
git add src/renderer/src/index.css
git commit -m "feat(ui): update color system - warmer backgrounds, amber accent"
```

---

## Phase 2: 布局尺寸

### Task 2: 调整 Sidebar 宽度

**Files:**
- Modify: `src/renderer/src/components/Sidebar/Sidebar.tsx:10-18`

- [ ] **Step 1: 修改 Sidebar 宽度**

```diff
- width: 258,
- minWidth: 258,
+ width: 240,
+ minWidth: 240,
```

- [ ] **Step 2: 调整内部 padding**

```diff
- padding: '12px 14px 8px'
+ padding: '10px 14px 6px'

- padding: '3px 14px 7px'
+ padding: '2px 14px 6px'

- padding: '2px 8px'
+ padding: '4px 8px'
```

- [ ] **Step 3: 增强 "Activity" 行字体权重**

在 Activity row 的 div 中，将 `fontWeight: 'medium'` 改为 `fontWeight: 600`：
```diff
- <div className="flex items-center gap-2 text-[12px] font-medium" style={{ color: 'var(--t1)' }}>
+ <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--t1)', fontWeight: 600 }}>
```

- [ ] **Step 4: 提交**

```bash
git add src/renderer/src/components/Sidebar/Sidebar.tsx
git commit -m "feat(ui): reduce sidebar width 258→240px, adjust padding, bold Activity header"
```

---

### Task 3: 调整 Header 高度

**Files:**
- Modify: `src/renderer/src/components/Layout/AppHeader.tsx:17-24`

- [ ] **Step 1: 修改 Header 高度和 padding**

```diff
- className="drag-region flex h-10 shrink-0 items-center gap-2"
+ className="drag-region flex h-9 shrink-0 items-center gap-2"

- paddingLeft: 12,
- paddingRight: 12,
+ paddingLeft: 12,
+ paddingRight: 12,
+ paddingTop: 5,
+ paddingBottom: 5,
```

- [ ] **Step 2: 调整面包屑字体大小**

在面包屑容器找到 `fontSize: 'calc(12px * var(--font-scale))'`，改为：
```css
fontSize: 'calc(11.5px * var(--font-scale))'
```

- [ ] **Step 3: 提交**

```bash
git add src/renderer/src/components/Layout/AppHeader.tsx
git commit -m "feat(ui): reduce header height 40→36px"
```

---

### Task 4: 调整 StatusBar 高度并增强

**Files:**
- Modify: `src/renderer/src/components/Layout/StatusBar.tsx`

- [ ] **Step 1: 修改 StatusBar 高度**

```diff
- height: 20,
+ height: 22,
```

- [ ] **Step 2: 增强 StatusBar 内容（可选，如果路径显示在 Tab 栏则简化）**

当前 StatusBar 显示分支和统计。Tab 栏路径移至 StatusBar 后，StatusBar 将显示：
- 左侧：分支指示器 + 分支名 + 终端路径
- 右侧：统计信息

- [ ] **Step 3: 提交**

```bash
git add src/renderer/src/components/Layout/StatusBar.tsx
git commit -m "feat(ui): increase statusbar height 20→22px"
```

---

### Task 5: 调整 TerminalPanel Tab 栏高度

**Files:**
- Modify: `src/renderer/src/components/Terminal/TerminalPanel.tsx:459-465`

- [ ] **Step 1: 修改 Tab 栏高度**

```diff
- height: 34,
+ height: 32,
```

- [ ] **Step 2: 提交**

```bash
git add src/renderer/src/components/Terminal/TerminalPanel.tsx
git commit -m "feat(ui): reduce tab bar height 34→32px"
```

---

### Task 6: 调整 TerminalToolbar

**Files:**
- Modify: `src/renderer/src/components/Terminal/TerminalToolbar.tsx`

- [ ] **Step 1: 修改工具栏高度**

```diff
- height: 36,
+ height: 34,
```

- [ ] **Step 2: 提交**

```bash
git add src/renderer/src/components/Terminal/TerminalToolbar.tsx
git commit -m "feat(ui): reduce toolbar height 36→34px"
```

---

## Phase 3: 组件细节

### Task 7: 优化 RepoItem 尺寸和权重

**Files:**
- Modify: `src/renderer/src/components/Sidebar/RepoItem.tsx`

- [ ] **Step 1: 调整列表项尺寸**

```diff
- padding: '7px 8px',
+ padding: '8px 10px',

- marginBottom: 1,
+ marginBottom: 2,

- borderRadius: 6,
+ borderRadius: 8,
```

- [ ] **Step 2: 增强仓库名字体权重**

在仓库名 div 添加：
```css
fontWeight: 500
```

- [ ] **Step 3: 调整悬停按钮 padding**

```diff
- padding: '3px'
+ padding: '4px'
```

- [ ] **Step 4: 提交**

```bash
git add src/renderer/src/components/Sidebar/RepoItem.tsx
git commit -m "feat(ui): improve RepoItem padding and font weight"
```

---

### Task 8: 优化 WorktreeItem 尺寸和权重

**Files:**
- Modify: `src/renderer/src/components/Sidebar/WorktreeItem.tsx`

- [ ] **Step 1: 调整列表项尺寸**

```diff
- padding: '7px 8px 7px 16px',
+ padding: '8px 10px 8px 18px',

- marginBottom: 1,
+ marginBottom: 2,

- borderRadius: 6,
+ borderRadius: 8,
```

- [ ] **Step 2: 增强分支名字体权重**

在分支名 div 添加：
```css
fontWeight: 500
```

- [ ] **Step 3: 调整悬停按钮 padding**

```diff
- padding: '3px'
+ padding: '4px'
```

- [ ] **Step 4: 提交**

```bash
git add src/renderer/src/components/Sidebar/WorktreeItem.tsx
git commit -m "feat(ui): improve WorktreeItem padding and font weight"
```

---

### Task 9: 优化 TerminalToolbar ChipBtn

**Files:**
- Modify: `src/renderer/src/components/Terminal/TerminalToolbar.tsx`

- [ ] **Step 1: 调整 ChipBtn padding 和圆角**

```diff
- padding: '3px 5px'
+ padding: '4px 8px'

- borderRadius: 5px
+ borderRadius: 6px
```

- [ ] **Step 2: 提交**

```bash
git add src/renderer/src/components/Terminal/TerminalToolbar.tsx
git commit -m "feat(ui): increase ChipBtn padding for better touch target"
```

---

## Phase 4: 交互优化

### Task 10: Tab 栏路径移至 StatusBar

**Files:**
- Modify: `src/renderer/src/components/Terminal/TerminalPanel.tsx` - 移除 Tab 栏右侧路径显示
- Modify: `src/renderer/src/components/Layout/StatusBar.tsx` - 添加终端路径显示

- [ ] **Step 1: 在 TerminalPanel Tab 栏中移除路径显示（保留按钮）**

在 Tab 栏右侧功能按钮区域内，找到包含 `terminalPath` 状态变量的 span 元素：
```tsx
// 大约在 Tab 栏右侧，className 包含 "pr-3" 的 div 内
<span className="max-w-[300px] truncate">{terminalPath}</span>
```
将此 span 移除或注释掉（保留其父级 div 中的 FolderOpen、时钟、滚动按钮）

- [ ] **Step 2: 在 StatusBar 中添加终端路径显示**

在 StatusBar 左侧添加终端路径显示（当前分支名右侧）

```tsx
// 在分支名后添加路径
{selectedWorktree && (
  <span className="ml-2 max-w-[300px] truncate" style={{ opacity: 0.5 }}>
    {terminalPath}
  </span>
)}
```

- [ ] **Step 3: 提交**

```bash
git add src/renderer/src/components/Terminal/TerminalPanel.tsx src/renderer/src/components/Layout/StatusBar.tsx
git commit -m "feat(ui): move terminal path from tab bar to statusbar"
```

---

## 验证步骤

完成所有任务后，运行以下验证：

```bash
# 启动开发服务器
pnpm run dev

# 检查是否有 TypeScript 错误
pnpm run build
```

---

## 实施顺序总结

| Task | 文件 | 变更 |
|------|------|------|
| 1 | index.css | 颜色变量 |
| 2 | Sidebar.tsx | 宽度 + padding |
| 3 | AppHeader.tsx | 高度 36px |
| 4 | StatusBar.tsx | 高度 22px |
| 5 | TerminalPanel.tsx | Tab 栏 32px |
| 6 | TerminalToolbar.tsx | 工具栏 34px |
| 7 | RepoItem.tsx | 尺寸 + 权重 |
| 8 | WorktreeItem.tsx | 尺寸 + 权重 |
| 9 | TerminalToolbar.tsx | ChipBtn padding |
| 10 | Tab→StatusBar | 路径迁移 |
