# Capsule Button Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single CapsuleButton pill into two independent buttons - left button opens app directly, right button shows dropdown.

**Architecture:** Modify `CapsuleButton.tsx` to render two separate buttons instead of one. Left button handles direct open, right button toggles dropdown. Maintain existing styling and state management via settingsStore.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Lucide React

---

## File Structure

```
src/renderer/src/components/Terminal/
└── CapsuleButton.tsx  (MODIFY - split single pill into two buttons)
```

---

## Task 1: Split Pill into Two Buttons

**Files:**
- Modify: `src/renderer/src/components/Terminal/CapsuleButton.tsx:36-61`
- Test: Manual visual testing

- [ ] **Step 1: Create separate AppButton component (left button)**

Add new component before `CapsuleButton`:

```tsx
function AppButton({
  app,
  onClick,
  title,
}: {
  app: ExternalApp
  onClick: () => void
  title: string
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex items-center gap-[5px] rounded-[6px] px-[9px] py-[3px] text-[11px] transition-colors duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1"
      style={{
        background: 'rgba(255,220,160,0.05)',
        border: '0.5px solid var(--bm, rgba(255,220,160,0.10))',
        color: 'var(--t2)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,220,160,0.09)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,220,160,0.05)')}
      onMouseDown={(e) => (e.currentTarget.style.background = 'rgba(255,220,160,0.12)')}
      onMouseUp={(e) => (e.currentTarget.style.background = 'rgba(255,220,160,0.09)')}
    >
      <span className="flex h-[14px] w-[14px] shrink-0 items-center justify-center overflow-hidden rounded-sm">
        <AppIcon app={app} size={14} />
      </span>
      <span className="max-w-[80px] truncate">{app.name}</span>
    </button>
  )
}
```

- [ ] **Step 2: Create separate DropdownToggle component (right button)**

Add new component after AppButton:

```tsx
function DropdownToggle({
  isOpen,
  onClick,
  title,
}: {
  isOpen: boolean
  onClick: () => void
  title: string
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      className="flex items-center justify-center rounded-[6px] p-[6px] transition-colors duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1"
      style={{
        background: 'rgba(255,220,160,0.05)',
        border: '0.5px solid var(--bm, rgba(255,220,160,0.10))',
        color: 'var(--t2)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,220,160,0.09)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,220,160,0.05)')}
      onMouseDown={(e) => (e.currentTarget.style.background = 'rgba(255,220,160,0.12)')}
      onMouseUp={(e) => (e.currentTarget.style.background = 'rgba(255,220,160,0.09)')}
    >
      <svg
        width="9"
        height="9"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s ease',
        }}
      >
        <path d="M3 4.5l3 3 3-3" />
      </svg>
    </button>
  )
}
```

- [ ] **Step 3: Update CapsuleButton to use new components**

Replace the single Pill button section (lines 107-156) with:

```tsx
{lastApp && externalApps.length > 0 && (
  <div className="relative flex items-center gap-[4px]" ref={dropdownRef}>
    {/* Left button - direct open */}
    <AppButton
      app={lastApp}
      onClick={() => handleOpenApp(lastApp.id)}
      title={`打开 ${lastApp.name}`}
    />

    {/* Right button - dropdown toggle (hidden if only one app) */}
    {externalApps.length > 1 && (
      <DropdownToggle
        isOpen={showDropdown}
        onClick={() => setShowDropdown(!showDropdown)}
        title="选择其他应用"
      />
    )}

    {/* Dropdown - now positioned relative to container */}
    {showDropdown && (
      <div
        role="listbox"
        id="app-dropdown"
        className="absolute right-0 top-8 z-50 w-44 overflow-hidden rounded-lg py-1 shadow-2xl"
        style={{
          background: 'var(--color-bg-elevated)',
          border: '0.5px solid var(--bm, rgba(255,220,160,0.10))',
        }}
      >
        {externalApps.map((app) => (
          <button
            key={app.id}
            role="option"
            tabIndex={0}
            aria-selected={app.id === lastExternalApp}
            onClick={() => handleOpenApp(app.id)}
            className="flex w-full items-center gap-2.5 px-3 py-[6px] text-left text-[11px] transition-colors duration-100"
            style={{ color: 'var(--t3)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--hv)'
              e.currentTarget.style.color = 'var(--t2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--t3)'
            }}
          >
            <span className="flex h-[16px] w-[16px] shrink-0 items-center justify-center overflow-hidden rounded-sm">
              <AppIcon app={app} size={16} />
            </span>
            {app.name}
          </button>
        ))}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4: Remove old Pill component (no longer needed)**

Delete the `Pill` function component (lines 36-61) since AppButton and DropdownToggle replace it.

- [ ] **Step 5: Run dev server and verify**

```bash
npm run dev
```

Expected: App renders, CapsuleButton shows two buttons `[VS Code] [▼]`, clicking left opens app, clicking right shows dropdown.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/Terminal/CapsuleButton.tsx
git commit -m "feat: split CapsuleButton into two independent buttons

- Left AppButton: always opens app directly (even when dropdown open)
- Right DropdownToggle: click to show dropdown
- Chevron rotates 180deg when dropdown open
- Add focus-visible ring for keyboard navigation
- Add active/pressed state styling
- Hide dropdown toggle when only one app available

Co-Authored-By: Claude (MiniMax-M2.7) <noreply@anthropic.com>"
```

---

## Task 2: Add Keyboard Navigation

**Files:**
- Modify: `src/renderer/src/components/Terminal/CapsuleButton.tsx`

- [ ] **Step 1: Add keyboard event handler**

Add useEffect for keyboard navigation after the click-outside effect (after line 90):

```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent): void => {
    if (!showDropdown) return

    if (e.key === 'Escape') {
      setShowDropdown(false)
      e.preventDefault()
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      // Navigate through dropdown items
      const dropdown = document.getElementById('app-dropdown')
      if (!dropdown) return
      const options = dropdown.querySelectorAll('[role="option"]')
      if (options.length === 0) return

      const currentIndex = Array.from(options).findIndex(
        (opt) => opt === document.activeElement
      )

      let nextIndex: number
      if (e.key === 'ArrowDown') {
        nextIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0
      } else {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1
      }

      ;(options[nextIndex] as HTMLElement).focus()
    }
  }

  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [showDropdown])
```

- [ ] **Step 2: Add onKeyDown handler to dropdown toggle**

Update DropdownToggle to handle Enter/Space:

```tsx
function DropdownToggle({
  isOpen,
  onClick,
  title,
}: {
  isOpen: boolean
  onClick: () => void
  title: string
}): React.ReactElement {
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <button
      onClick={onClick}
      onKeyDown={handleKeyDown}
      // ... rest unchanged
    >
```

- [ ] **Step 3: Add onKeyDown handler to AppButton**

```tsx
function AppButton({
  app,
  onClick,
  title,
}: {
  app: ExternalApp
  onClick: () => void
  title: string
}): React.ReactElement {
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <button
      onClick={onClick}
      onKeyDown={handleKeyDown}
      // ... rest unchanged
    >
```

- [ ] **Step 4: Test keyboard navigation**

- Tab to left button, press Enter - should open app
- Tab to right button, press Enter - should open dropdown
- With dropdown open, ArrowDown/ArrowUp navigates options
- Escape closes dropdown

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/Terminal/CapsuleButton.tsx
git commit -m "feat: add keyboard navigation to CapsuleButton

- Escape closes dropdown
- Arrow keys navigate dropdown options
- Enter/Space activates buttons
- Focus management for dropdown items

Co-Authored-By: Claude (MiniMax-M2.7) <noreply@anthropic.com>"
```

---

## Task 3: Verify Implementation Against Spec

**Files:**
- Review: `docs/superpowers/specs/2026-03-24-capsule-split-design.md`

- [ ] **Step 1: Verify all spec requirements**

| Spec Requirement | Implementation Status |
|------------------|---------------------|
| Left button opens app directly | ✅ `AppButton onClick={() => handleOpenApp(lastApp.id)}` |
| Right button toggles dropdown | ✅ `DropdownToggle onClick={() => setShowDropdown(!showDropdown)}` |
| Chevron rotates when open | ✅ `transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)'` |
| Hover effects | ✅ onMouseEnter/Leave handlers |
| Active/pressed state | ✅ onMouseDown/Up with darker background |
| Focus visible ring | ✅ `focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]` |
| ARIA attributes | ✅ `aria-label`, `aria-expanded`, `aria-haspopup`, `role="listbox"`, `role="option"` |
| Keyboard navigation | ✅ Escape, Arrow keys, Enter/Space |
| Single app hides toggle | ✅ `{externalApps.length > 1 && <DropdownToggle ... />}` |
| Tooltips | ✅ `title` attribute on both buttons |

- [ ] **Step 2: Test in browser**

Manual testing checklist:
- [ ] Left button click opens app without showing dropdown
- [ ] Right button click shows dropdown
- [ ] Click outside dropdown closes it
- [ ] Dropdown chevron rotates when open
- [ ] Tab navigation works between buttons
- [ ] Enter/Space activates focused button
- [ ] Escape closes dropdown
- [ ] Arrow keys navigate dropdown options
- [ ] Focus ring appears on Tab focus
- [ ] Only one app shows single button (no toggle)

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete CapsuleButton split implementation

All spec requirements verified:
- Two independent buttons (left: open, right: dropdown)
- Chevron rotation animation
- Full keyboard navigation
- ARIA attributes for accessibility
- Active/focus states
- Single app edge case handled

Co-Authored-By: Claude (MiniMax-M2.7) <noreply@anthropic.com>"
```

---

## Verification Commands

```bash
# Start dev server
npm run dev

# Build to verify no TypeScript errors
npm run build
```

---

## Dependencies

None - only modifies existing file, uses existing dependencies (React, Lucide icons, Tailwind).
