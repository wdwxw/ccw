# UI 优化设计文档

**日期**: 2026-03-25
**类型**: 界面优化
**目标**: 方案 A — 柔和层次优化

---

## 1. 设计目标

在不改变整体功能和布局结构的前提下，系统性优化界面的：
- **整体氛围** — 适度提亮背景层次，让暗色不再"平板"
- **布局比例** — 侧边栏收紧、Header 减薄、StatusBar 放宽
- **组件细节** — 列表项更透气、按钮更宽松、文字更清晰

---

## 2. 颜色系统

### 2.1 背景色层级（核心变更）

| Token | 原值 | 新值 | 变化 |
|-------|------|------|------|
| `--color-bg-primary` | `#0D1117` | `#111213` | +5% 亮度，微暖黑 |
| `--color-bg-secondary` | `#161B22` | `#1A1C1E` | +10% 亮度 |
| `--color-bg-tertiary` | `#1C2128` | `#1E2022` | +5% 亮度 |
| `--color-bg-elevated` | `#21262D` | `#252729` | +8% 亮度 |

### 2.2 强调色（降低饱和度）

| Token | 原值 | 新值 | 变化 |
|-------|------|------|------|
| `--color-accent` | `#1A56DB` | `#C4956A` | 蓝色→琥珀，降低饱和度 40% |
| `--color-accent-hover` | `#1E63F0` | `#D4A574` | 更柔和的琥珀 hover |
| `--color-accent-muted` | `rgba(26,86,219,0.15)` | `rgba(196,149,106,0.12)` | 更淡的琥珀背景 |

**注意**: 琥珀色的 `rgb(200, 136, 50)` 改为 `rgb(196, 149, 106)`，在暗色背景上更柔和不刺眼。

### 2.3 文字色（微调对比度）

| Token | 原值 | 新值 |
|-------|------|------|
| `--color-text-primary` | `#E6EDF3` | `#E8EDF4` | 略微提亮 |
| `--color-text-secondary` | `#8B949E` | `#9A9FA8` | 增加对比度 |

---

## 3. 布局比例

### 3.1 尺寸调整

| 组件 | 原有 | 新值 | 变化 |
|------|------|------|------|
| Sidebar 宽度 | 258px | 240px | -18px（更紧凑） |
| Header 高度 | 40px | 36px | -4px（更轻量） |
| StatusBar 高度 | 20px | 22px | +2px（更宽松） |
| Tab 栏高度 | 34px | 32px | -2px（更薄） |
| TerminalToolbar 高度 | 36px | 34px | -2px |

### 3.2 Header 内部调整

```
原布局: [72px spacer][nav arrows][breadcrumb (flex-1)][capsule + settings]
新布局: [72px spacer][nav arrows][breadcrumb (flex-1)][capsule + settings]
```

- Header padding: `12px` → `10px 12px`（垂直收紧）
- 面包屑字体: `12px` → `11.5px`（配合整体缩小）

### 3.3 Sidebar 内部调整

```
原布局:
├─ Activity row (padding: 12px 14px 8px)
├─ Workspaces header (padding: 3px 14px 7px)
└─ Workspace list (padding: 2px 8px)

新布局:
├─ Activity row (padding: 10px 14px 6px)
├─ Workspaces header (padding: 2px 14px 6px)
└─ Workspace list (padding: 4px 8px)
```

---

## 4. 组件细节

### 4.1 列表项（RepoItem / WorktreeItem）

| 属性 | 原有 | 新值 |
|------|------|------|
| padding | `7px 8px` | `8px 10px` |
| marginBottom | 1px | 2px |
| 圆角 | 6px | 8px |
| 悬停背景 | `var(--hv)` | 保持 |
| 选中背景 | `var(--ac)` | 保持，但增加透明度 |

### 4.2 按钮系统

**RepoItem / WorktreeItem 悬停按钮**:
- padding: `3px` → `4px`（更宽松的热区）
- 圆角: 保持 `4px`

**TerminalToolbar ChipBtn**:
- padding: `3px 5px` → `4px 8px`（更宽松）
- 圆角: `5px` → `6px`

### 4.3 字体权重增强

| 组件 | 原有 | 新值 |
|------|------|------|
| RepoItem 仓库名 | `font-weight: normal` | `font-weight: 500` |
| WorktreeItem 分支名 | `font-weight: normal` | `font-weight: 500` |
| Sidebar "Activity" | `font-weight: medium` | `font-weight: 600` |
| Sidebar section header | `font-weight: medium` | 保持 |

### 4.4 间距系统（统一为 4px 网格）

```
xs: 2px   (原 1-2px)
sm: 4px   (原 3-4px)
md: 8px   (原 6-8px)
lg: 12px  (原 10-12px)
xl: 16px  (原 14-16px)
```

---

## 5. 细节优化

### 5.1 Tab 栏路径显示优化

当前 Tab 栏右侧混杂了：路径 + Finder 按钮 + 时钟按钮 + 滚动按钮

**优化方案**: 将路径信息移至 StatusBar 显示，Tab 栏右侧仅保留功能性按钮

### 5.2 StatusBar 增强

新增显示当前终端路径（来自选中 worktree），充分利用新增的 2px 高度。

### 5.3 边框系统微调

| Token | 原值 | 新值 |
|-------|------|------|
| `border-border` | `#30363D` | `#2A2D32`（更柔和） |

---

## 6. 实现顺序

### Phase 1: 颜色与背景（影响全局）
1. 更新 CSS 变量系统 (`index.css`)
2. 验证 brown 主题兼容性

### Phase 2: 布局尺寸（影响整体视觉）
3. 调整 Sidebar 宽度
4. 调整 Header 高度
5. 调整 StatusBar 高度
6. 调整 Tab 栏高度

### Phase 3: 组件细节（局部优化）
7. 优化 RepoItem / WorktreeItem 尺寸
8. 优化按钮 padding
9. 增强字体权重
10. 统一间距系统

### Phase 4: 交互优化
11. Tab 栏路径信息移至 StatusBar
12. 悬停/选中状态微调

---

## 7. 影响范围

- `src/renderer/src/index.css` — CSS 变量定义
- `src/renderer/src/components/Layout/AppHeader.tsx` — Header 高度
- `src/renderer/src/components/Layout/StatusBar.tsx` — StatusBar 高度 + 新增路径显示
- `src/renderer/src/components/Sidebar/Sidebar.tsx` — Sidebar 宽度 + 内边距
- `src/renderer/src/components/Sidebar/RepoItem.tsx` — 列表项尺寸
- `src/renderer/src/components/Sidebar/WorktreeItem.tsx` — 列表项尺寸
- `src/renderer/src/components/Terminal/TerminalPanel.tsx` — Tab 栏高度
- `src/renderer/src/components/Terminal/TerminalToolbar.tsx` — 工具栏高度 + 按钮 padding

---

## 8. 风险评估

- **低风险**: 颜色调整仅影响 CSS 变量，不涉及布局逻辑
- **低风险**: 尺寸调整在组件内部，不影响组件间通信
- **中风险**: Tab 栏路径迁移需同步更新 StatusBar，确保功能不丢失
