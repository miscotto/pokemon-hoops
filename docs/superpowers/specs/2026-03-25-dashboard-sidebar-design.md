# Dashboard Sidebar Navigation — Design Spec

**Date:** 2026-03-25
**Status:** Approved

---

## Overview

Add a persistent sidebar navigation to the dashboard so users can easily access Seasons, Tournaments, and Profile from one place. On mobile, the sidebar becomes a slide-in drawer triggered by a hamburger menu. On desktop, it is always visible on the left.

---

## Architecture

### Approach: Nested Layout (Option A)

A `src/app/dashboard/layout.tsx` wraps all dashboard routes and renders the `DashboardShell` (sidebar + main content). Each section is its own route under `/dashboard/*`.

### New Files

| File | Purpose |
|------|---------|
| `src/app/dashboard/layout.tsx` | Next.js layout — wraps all dashboard routes with `DashboardShell` |
| `src/app/components/DashboardShell.tsx` | Layout wrapper: manages sidebar open/close state, renders overlay on mobile |
| `src/app/components/DashboardSidebar.tsx` | Sidebar nav items, theme toggle, sign out |
| `src/app/dashboard/seasons/page.tsx` | Seasons section (moved from `/seasons`) |
| `src/app/dashboard/tournaments/page.tsx` | Tournaments section (moved from `/tournaments`) |
| `src/app/dashboard/profile/page.tsx` | Profile section (moved from `/profile`) |
| `src/app/seasons/page.tsx` | Redirect → `/dashboard/seasons` |
| `src/app/tournaments/page.tsx` | Redirect → `/dashboard/tournaments` |
| `src/app/profile/page.tsx` | Redirect → `/dashboard/profile` |

### Modified Files

| File | Change |
|------|--------|
| `src/app/dashboard/page.tsx` | Remove — dashboard shell now handles auth guard; content moves to rosters section |
| `src/app/components/RosterDashboard.tsx` | Remove the `<header>` block (branding, username link, theme toggle, sign out) — shell provides these |

---

## Components

### `DashboardShell`

- **Props:** `{ children: React.ReactNode }`
- Renders a flex row: `DashboardSidebar` + `<main>` content area
- Holds `sidebarOpen: boolean` state
- On mobile: passes `isOpen` and `onClose` to sidebar; renders a dark overlay (`z-40`) when open; tapping overlay closes the drawer
- On desktop (`md:` breakpoint and up): sidebar always visible, no overlay

### `DashboardSidebar`

- **Props:** `{ isOpen: boolean, onClose: () => void }`
- On mobile: `fixed inset-y-0 left-0 z-50`, translated off-screen when closed (`-translate-x-full`), slides in with CSS transition when open
- On desktop: `relative`, always visible, no transform
- **Nav items** (in order): Rosters (`/dashboard`), Seasons (`/dashboard/seasons`), Tournaments (`/dashboard/tournaments`), Profile (`/dashboard/profile`)
- Active item: highlighted with left-border accent using `usePathname()`
- **Bottom section:** `ThemeToggle` component + Sign Out button (calls `signOut()`)
- Branding: `⚡ POKEMON HOOPS` at top, pixel font

### `DashboardLayout` (`layout.tsx`)

- Server component
- Reads session — if no user, renders `<AuthForm />` (same auth guard as today)
- Renders `<DashboardShell>{children}</DashboardShell>`

### Mobile Header

- A slim top bar visible only on mobile (`md:hidden`) inside `DashboardShell`
- Contains: `⚡ POKEMON HOOPS` branding + hamburger button (`☰`) that sets `sidebarOpen = true`
- When drawer is open, the button becomes `✕`

---

## Routing

Existing pages at `/seasons`, `/tournaments`, `/profile` get a redirect so old links don't break:

```tsx
// src/app/seasons/page.tsx
import { redirect } from 'next/navigation'
export default function SeasonsRedirect() {
  redirect('/dashboard/seasons')
}
```

Same pattern for `/tournaments` and `/profile`.

---

## Styling

Follows the existing design system:
- `var(--color-primary)` for active nav item accent
- `var(--color-surface)` / `var(--color-bg)` for sidebar background
- `font-pixel` (`Press Start 2P`) for all text
- Pixel-art borders (`border-3`, shadow offsets) consistent with existing UI
- Sidebar width: `200px` on desktop; full-width drawer on mobile (max `260px`)

---

## Mobile UX

- Drawer slides in from left with `transition-transform duration-200`
- Dark overlay behind drawer (`bg-black/50`) blocks content interaction
- Tapping overlay or `✕` closes drawer
- No scroll lock needed (overlay covers content)

---

## Out of Scope

- Collapsible/icon-only sidebar mode
- Persistent sidebar state (open/closed) across page loads
- Any changes to the content of Seasons, Tournaments, or Profile pages
