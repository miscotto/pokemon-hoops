# Dashboard Sidebar Navigation — Design Spec

**Date:** 2026-03-25
**Status:** Approved

---

## Overview

Add a persistent sidebar navigation to the dashboard so users can easily access Seasons, Tournaments, and Profile from one place. On mobile, the sidebar becomes a slide-in drawer triggered by a hamburger menu. On desktop, it is always visible on the left.

---

## Architecture

A `src/app/dashboard/layout.tsx` wraps all dashboard routes with `DashboardShell` (sidebar + main content). Each section lives at its own route under `/dashboard/*`. The existing `/seasons`, `/tournaments`, and `/profile` routes become thin redirect files.

### New Files

| File | Purpose |
|------|---------|
| `src/app/dashboard/layout.tsx` | Next.js server layout — renders `<DashboardShell>` around child routes |
| `src/app/components/DashboardShell.tsx` | `"use client"` — manages sidebar open/close state, overlay, mobile top bar |
| `src/app/components/DashboardSidebar.tsx` | `"use client"` — nav items, theme toggle, sign out |
| `src/app/dashboard/seasons/page.tsx` | Seasons listing (moved from `/seasons/page.tsx`, see changes below) |
| `src/app/dashboard/tournaments/page.tsx` | Tournaments listing (moved from `/tournaments/page.tsx`, see changes below) |
| `src/app/dashboard/profile/page.tsx` | Server component: reads session → `redirect('/')` or `redirect('/users/[id]')` |

### Modified Files

| File | Change |
|------|--------|
| `src/app/components/RosterDashboard.tsx` | Remove `{/* Header */}` comment + `<header>` block (lines 231–257). Remove the outermost `<div className="min-h-screen" ...>` wrapper (line 228) and its closing tag — the shell `<main>` provides background and height. |
| `src/app/dashboard/page.tsx` | Update loading state: replace the full-screen spinner div (`min-h-screen bg-slate-900`) with a simple centered spinner that works inside the shell's `<main>` — e.g. `<div className="flex h-full items-center justify-center">`. Update `AuthForm` render: wrap in `<div className="flex h-full items-center justify-center">` so it centers in `<main>`. No other changes. |
| `src/app/seasons/page.tsx` | Replace entire file contents with a redirect to `/dashboard/seasons` |
| `src/app/tournaments/page.tsx` | Replace entire file contents with a redirect to `/dashboard/tournaments` |
| `src/app/profile/page.tsx` | Replace entire file contents with a redirect to `/dashboard/profile` |

### Unchanged Files

- `src/app/seasons/[id]/page.tsx` and all sub-routes — stay at their existing paths
- `src/app/tournaments/[id]/page.tsx` — stays at its existing path
- `src/app/users/[id]/page.tsx` — stays at its existing path

---

## Auth Guard Strategy

No auth gate in the layout. Each page handles its own auth.

| Page | Auth behavior |
|------|--------------|
| `dashboard/page.tsx` | `useSession()` client-side; renders centered `<AuthForm />` inside `<main>` if unauthenticated. Sidebar visible around it — acceptable. |
| `dashboard/seasons/page.tsx` | Server-side `auth.api.getSession()`; `redirect('/')` if no session (replaces the broken `/login` redirect in source) |
| `dashboard/tournaments/page.tsx` | No auth check — public page |
| `dashboard/profile/page.tsx` | Server-side `auth.api.getSession()`; `redirect('/')` if no session, then `` redirect(`/users/${session.user.id}`) `` |
| `dashboard/layout.tsx` | Server component, no auth gate |

**Children in client components:** `layout.tsx` is a server component that passes `{children}` to `DashboardShell` (`"use client"`). This is valid in Next.js App Router. Do NOT add `"use client"` to `layout.tsx`.

---

## Components

### `DashboardShell`

- `"use client"`
- **Props:** `{ children: React.ReactNode }`
- **Outer container:** `flex h-screen overflow-hidden` — full viewport height, shell itself does not scroll
- **Layout:** horizontal flex row — `DashboardSidebar` on the left, `<main>` filling the rest
- Holds `sidebarOpen: boolean` state (default `false`)
- **Close on navigation:** `const pathname = usePathname()` (from `next/navigation`); `useEffect(() => { setSidebarOpen(false) }, [pathname])` — closes drawer whenever route changes
- **Mobile overlay:** renders `<div className="fixed inset-0 bg-black/50 z-50" onClick={...} />` only when `sidebarOpen === true`; click closes drawer
- **Mobile top bar:** `<header className="md:hidden sticky top-0 z-40 px-3 py-2 border-b-3 ...">` with `<Link href="/">⚡ POKEMON HOOPS</Link>` (left, `font-pixel`) + `☰` button (right) that sets `sidebarOpen = true`. Background `var(--color-primary)`. z-index `z-40` so the drawer slides over it.
- **`<main>`:** `flex-1 overflow-y-auto bg-[var(--color-bg)]` — all page content scrolls here

### `DashboardSidebar`

- `"use client"`
- **Props:** `{ isOpen: boolean; onClose: () => void }`
- **Mobile:** `fixed inset-y-0 left-0 flex flex-col w-[260px] z-[60]`; transform: `-translate-x-full` when closed, `translate-x-0` when open; `transition-transform duration-200`. z-index `z-[60]` sits above overlay (`z-50`) and top bar (`z-40`).
- **Desktop:** `md:relative md:z-auto md:translate-x-0 md:w-[200px] md:flex md:flex-col md:h-full` — always visible, normal document flow, no z-index stacking
- **Height/scroll:** outer `h-full flex flex-col`; nav items section is `flex-1 overflow-y-auto`; bottom section does not scroll
- **Active nav:** `const pathname = usePathname()` (from `next/navigation`) — read inside the component, not passed as a prop
- **Close button:** `✕` button in drawer top, `md:hidden`, calls `onClose()`
- **Branding:** `⚡ POKEMON HOOPS` in `font-pixel` at top of sidebar
- **Nav items** (in order):

  | Label | Route | Active condition |
  |-------|-------|-----------------|
  | ROSTERS | `/dashboard` | `pathname === '/dashboard'` |
  | SEASONS | `/dashboard/seasons` | `pathname.startsWith('/dashboard/seasons')` |
  | TOURNAMENTS | `/dashboard/tournaments` | `pathname.startsWith('/dashboard/tournaments')` |
  | PROFILE | `/dashboard/profile` | `pathname.startsWith('/dashboard/profile')` |

  Next.js normalizes trailing slashes so exact match on `/dashboard` is reliable.

  Active style: `border-l-[3px] border-[var(--color-primary)] bg-[var(--color-primary)]/10`

- **Bottom section** (pinned, outside the scrolling area): `ThemeToggle` component first, then a `PokeButton` that calls `signOut()` from `@/lib/auth-client` with no arguments
- Note: removing the `RosterDashboard` header also removes the username/profile link. The sidebar's **PROFILE** nav item is the replacement.

### `DashboardLayout` (`layout.tsx`)

- Server component — no `"use client"`
- Body: `return <DashboardShell>{children}</DashboardShell>`
- No auth gate

---

## Routing

```tsx
// src/app/seasons/page.tsx  (and same pattern for tournaments, profile)
import { redirect } from 'next/navigation'
export default function SeasonsRedirect() {
  redirect('/dashboard/seasons')
}
```

Deep-linked sub-routes (`/seasons/[id]/...`, `/tournaments/[id]`) are unaffected.

---

## Moving Existing Page Content

### `dashboard/seasons/page.tsx`

Copy `src/app/seasons/page.tsx` verbatim, then:
- Replace `redirect('/login')` with `redirect('/')` in the auth guard
- Server-side imports (`getSeasons` from `@/lib/season-db`, `auth` from `@/lib/auth`, `headers` from `next/headers`) use absolute `@/` aliases — no path adjustment needed when moving to a deeper directory

### `dashboard/tournaments/page.tsx`

Copy `src/app/tournaments/page.tsx` verbatim, then:
- **Remove** the outermost `<div className="min-h-screen" ...>` wrapper (line 36) and its closing tag — shell `<main>` provides background and height
- **Remove** the `<header>` block inside it — shell provides the header
- **Remove** the `import { ThemeToggle } from "@/app/components/ui"` import — no longer used after header removal
- **Keep** `export const revalidate = 30`
- Update filter tab `href` values: `/tournaments?filter=` → `/dashboard/tournaments?filter=`
- Tournament detail links (`href="/tournaments/[id]"`) stay unchanged

---

## Styling

- `var(--color-primary)` for active nav accent (left border + 10% bg tint)
- `var(--color-surface)` for sidebar background
- `var(--color-bg)` for `<main>` background
- `font-pixel` for all text
- Use standard Tailwind z-indices where available (`z-40`, `z-50`); use arbitrary `z-[60]` only for the sidebar drawer since `z-60` is not a Tailwind preset
- Pixel-art borders consistent with existing UI

---

## Out of Scope

- Collapsible/icon-only sidebar
- Persistent open/closed state across page loads
- Moving `/seasons/[id]/...` sub-routes under `/dashboard/`
- Restyling the seasons listing page (plain Tailwind; leave as-is)
