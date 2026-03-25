# Dashboard Sidebar Navigation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent slide-in sidebar to the dashboard that links to Rosters, Seasons, Tournaments, and Profile, with a hamburger drawer on mobile.

**Architecture:** A `dashboard/layout.tsx` server component wraps all `/dashboard/*` routes in `DashboardShell`, which renders `DashboardSidebar` on the left and a scrollable `<main>` on the right. Season and tournament listing pages move under `/dashboard/*`; old routes become redirects.

**Tech Stack:** Next.js 15 App Router, React, Tailwind CSS, `better-auth` (`@/lib/auth-client`), Vitest

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/app/components/DashboardSidebar.tsx` | Nav items, active state, theme toggle, sign out |
| Create | `src/app/components/DashboardShell.tsx` | Sidebar open/close state, overlay, mobile top bar, layout |
| Create | `src/app/dashboard/layout.tsx` | Server layout — wraps children in DashboardShell |
| Create | `src/app/dashboard/seasons/page.tsx` | Seasons listing (moved from /seasons) |
| Create | `src/app/dashboard/tournaments/page.tsx` | Tournaments listing (moved from /tournaments) |
| Create | `src/app/dashboard/profile/page.tsx` | Session read → redirect to /users/[id] |
| Modify | `src/app/components/RosterDashboard.tsx` | Strip header + outer wrapper |
| Modify | `src/app/dashboard/page.tsx` | Center loading/auth states for shell |
| Modify | `src/app/seasons/page.tsx` | Replace with redirect |
| Modify | `src/app/tournaments/page.tsx` | Replace with redirect |
| Modify | `src/app/profile/page.tsx` | Replace with redirect |

---

## Chunk 1: Core Navigation Components

### Task 1: `DashboardSidebar` component

**Files:**
- Create: `src/app/components/DashboardSidebar.tsx`

- [ ] **Step 1: Create the sidebar component**

```tsx
// src/app/components/DashboardSidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { PokeButton, ThemeToggle } from "./ui";

interface DashboardSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const NAV_ITEMS = [
  { label: "ROSTERS", href: "/dashboard" },
  { label: "SEASONS", href: "/dashboard/seasons" },
  { label: "TOURNAMENTS", href: "/dashboard/tournaments" },
  { label: "PROFILE", href: "/dashboard/profile" },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

export default function DashboardSidebar({ isOpen, onClose }: DashboardSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={[
        "fixed inset-y-0 left-0 flex flex-col w-65 z-60",
        "transition-transform duration-200",
        isOpen ? "translate-x-0" : "-translate-x-full",
        "md:relative md:z-auto md:translate-x-0 md:w-50 md:flex md:flex-col md:h-full",
      ].join(" ")}
      style={{ backgroundColor: "var(--color-surface)", borderRight: "2px solid var(--color-border)" }}
    >
      {/* Sidebar header: branding + mobile close */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b-2"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-primary)" }}
      >
        <span
          className="font-pixel text-[8px]"
          style={{ color: "var(--color-primary-text)" }}
        >
          ⚡ POKEMON HOOPS
        </span>
        <PokeButton
          variant="ghost"
          size="sm"
          className="md:hidden"
          onClick={onClose}
          aria-label="Close menu"
        >
          ✕
        </PokeButton>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_ITEMS.map(({ label, href }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center px-4 py-3 font-pixel text-[7px] transition-colors"
              style={{
                color: active ? "var(--color-primary)" : "var(--color-text-muted)",
                borderLeft: active ? "3px solid var(--color-primary)" : "3px solid transparent",
                backgroundColor: active ? "color-mix(in srgb, var(--color-primary) 10%, transparent)" : "transparent",
              }}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: theme + sign out */}
      <div
        className="px-4 py-3 border-t-2 flex flex-col gap-2"
        style={{ borderColor: "var(--color-border)" }}
      >
        <ThemeToggle />
        <PokeButton
          variant="ghost"
          size="sm"
          onClick={() => signOut()}
        >
          SIGN OUT
        </PokeButton>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

```bash
npm run build 2>&1 | tail -20
```

Expected: No TypeScript errors for the new file (other errors from missing layout are fine at this stage).

- [ ] **Step 3: Write a unit test for the active nav logic**

The `isActive` function is pure — test it directly.

```ts
// src/app/components/DashboardSidebar.test.ts
import { describe, it, expect } from "vitest";
import { isActive } from "./DashboardSidebar";

describe("isActive", () => {
  it("matches /dashboard exactly", () => {
    expect(isActive("/dashboard", "/dashboard")).toBe(true);
  });

  it("does not match /dashboard/seasons as active for /dashboard", () => {
    expect(isActive("/dashboard/seasons", "/dashboard")).toBe(false);
  });

  it("matches /dashboard/seasons for seasons link", () => {
    expect(isActive("/dashboard/seasons", "/dashboard/seasons")).toBe(true);
  });

  it("matches /dashboard/seasons/123 as active for seasons link", () => {
    expect(isActive("/dashboard/seasons/123", "/dashboard/seasons")).toBe(true);
  });

  it("does not match /dashboard/tournaments as active for seasons", () => {
    expect(isActive("/dashboard/tournaments", "/dashboard/seasons")).toBe(false);
  });
});
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/app/components/DashboardSidebar.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/DashboardSidebar.tsx src/app/components/DashboardSidebar.test.ts
git commit -m "feat: add DashboardSidebar component with active nav and sign out"
```

---

### Task 2: `DashboardShell` component

**Files:**
- Create: `src/app/components/DashboardShell.tsx`

- [ ] **Step 1: Create the shell component**

```tsx
// src/app/components/DashboardShell.tsx
"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import DashboardSidebar from "./DashboardSidebar";

interface DashboardShellProps {
  children: React.ReactNode;
}

export default function DashboardShell({ children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "var(--color-bg)" }}>
      {/* Mobile overlay — sits below drawer, above content */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <DashboardSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Right side: mobile top bar + scrollable content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile top bar */}
        <header
          className="md:hidden flex items-center justify-between sticky top-0 z-40 px-3 py-2 border-b-3 border-[var(--color-shadow)] shrink-0"
          style={{ backgroundColor: "var(--color-primary)" }}
        >
          <Link
            href="/"
            className="font-pixel text-[9px]"
            style={{ color: "var(--color-primary-text)" }}
          >
            ⚡ POKEMON HOOPS
          </Link>
          <button
            className="font-pixel text-[14px] leading-none px-2 py-1"
            style={{ color: "var(--color-primary-text)" }}
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            aria-expanded={sidebarOpen}
          >
            ☰
          </button>
        </header>

        {/* Main content — all scrolling happens here */}
        <main
          className="flex-1 overflow-y-auto"
          style={{ backgroundColor: "var(--color-bg)" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

```bash
npm run build 2>&1 | tail -20
```

Expected: No TypeScript errors for the new component files.

- [ ] **Step 3: Commit**

```bash
git add src/app/components/DashboardShell.tsx
git commit -m "feat: add DashboardShell with mobile drawer, overlay, and top bar"
```

---

### Task 3: `dashboard/layout.tsx`

**Files:**
- Create: `src/app/dashboard/layout.tsx`

- [ ] **Step 1: Create the layout**

```tsx
// src/app/dashboard/layout.tsx
import DashboardShell from "@/app/components/DashboardShell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
```

- [ ] **Step 2: Start the dev server and verify the layout renders**

```bash
npm run dev
```

Navigate to `http://localhost:3000/dashboard`. Expected:
- Desktop: sidebar visible on left with nav items ROSTERS, SEASONS, TOURNAMENTS, PROFILE
- Mobile (resize browser to < 768px): sidebar hidden, hamburger `☰` visible in top bar
- Clicking `☰` opens the drawer
- Clicking overlay or `✕` closes the drawer

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/layout.tsx
git commit -m "feat: add dashboard layout wrapping routes in DashboardShell"
```

---

## Chunk 2: Update Existing Components

### Task 4: Strip header and wrapper from `RosterDashboard`

**Files:**
- Modify: `src/app/components/RosterDashboard.tsx`

- [ ] **Step 1: Remove the header block**

In [RosterDashboard.tsx](src/app/components/RosterDashboard.tsx), find and delete lines 231–257: the `{/* Header */}` comment and the entire `<header>...</header>` element.

The deleted block starts with:
```tsx
      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b-3 border-[var(--color-shadow)] px-3 sm:px-4 py-2 sm:py-3"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
```
and ends with `</header>`.

- [ ] **Step 2: Remove the outer `min-h-screen` wrapper**

Find and delete line 228 (the outer `<div className="min-h-screen" ...>` opening tag):
```tsx
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
```
and its matching closing `</div>` at line 760 (the very last `</div>` in the return).

After removal, the component's `return` will have two sibling `<div className="max-w-4xl ...">` blocks. Wrap them in a React Fragment:
```tsx
  return (
    <>
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* ... rosters content ... */}
      </div>

      {/* Create Tournament Section */}
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* ... tournament form ... */}
      </div>
    </>
  );
```

- [ ] **Step 3: Build and check for TypeScript errors**

```bash
npm run build 2>&1 | grep -E 'error|Error' | head -20
```

Expected: No errors in `RosterDashboard.tsx`.

- [ ] **Step 4: Verify in the browser**

With `npm run dev` running, visit `http://localhost:3000/dashboard`.

Expected:
- No duplicate header (the shell provides the only header/branding on mobile)
- On desktop: sidebar on left, roster content on right
- Rosters load and display normally

- [ ] **Step 5: Commit**

```bash
git add src/app/components/RosterDashboard.tsx
git commit -m "refactor: remove header and min-h-screen wrapper from RosterDashboard"
```

---

### Task 5: Update loading and auth states in `dashboard/page.tsx`

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Update the loading state**

In [dashboard/page.tsx](src/app/dashboard/page.tsx), find the loading spinner return (lines 14–20):
```tsx
  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="inline-block w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
```

Replace with:
```tsx
  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <div
          className="inline-block w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }
```

- [ ] **Step 2: Update the unauthenticated state**

Find the `AuthForm` return (lines 22–24):
```tsx
  if (!session?.user) {
    return <AuthForm />;
  }
```

Replace with:
```tsx
  if (!session?.user) {
    return (
      <div className="flex h-full items-center justify-center">
        <AuthForm />
      </div>
    );
  }
```

- [ ] **Step 3: Verify the `"use client"` directive is still at line 1**

The file must begin with:
```tsx
"use client";
```

Do NOT remove this — `useSession()` and `useRouter()` require a client component.

- [ ] **Step 4: Verify in the browser**

Sign out, then visit `http://localhost:3000/dashboard`.

Expected:
- The sign-in form is centered within the shell's main area
- The sidebar is visible on desktop with nav items (unauthenticated state is acceptable)

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "fix: center loading and auth states inside DashboardShell main area"
```

---

## Chunk 3: Page Migrations and Redirects

### Task 6: Create `dashboard/seasons/page.tsx`

**Files:**
- Create: `src/app/dashboard/seasons/page.tsx`

- [ ] **Step 1: Create the seasons page under dashboard**

```bash
mkdir -p src/app/dashboard/seasons
```

Copy the content of [seasons/page.tsx](src/app/seasons/page.tsx) to `src/app/dashboard/seasons/page.tsx`, then change the auth guard from:
```tsx
  if (!session?.user) redirect("/login");
```
to:
```tsx
  if (!session?.user) redirect("/");
```

Full file:
```tsx
// src/app/dashboard/seasons/page.tsx
import Link from "next/link";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSeasons } from "@/lib/season-db";

export default async function SeasonsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/");

  const allSeasons = await getSeasons(50);

  const statusLabel: Record<string, string> = {
    registration: "Open",
    active: "Regular Season",
    playoffs: "Playoffs",
    completed: "Completed",
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Seasons</h1>
      {allSeasons.length === 0 && (
        <p className="text-gray-500">No seasons yet. Check back soon!</p>
      )}
      <div className="flex flex-col gap-4">
        {allSeasons.map((s) => (
          <Link
            key={s.id}
            href={`/seasons/${s.id}`}
            className="block border rounded-lg p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-lg">{s.name}</span>
              <span className="text-sm px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                {statusLabel[s.status] ?? s.status}
              </span>
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {s.teamCount} / {s.maxTeams} teams &middot; Reg. season:{" "}
              {new Date(s.regularSeasonStart).toLocaleDateString()} –{" "}
              {new Date(s.regularSeasonEnd).toLocaleDateString()}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

```bash
npm run build 2>&1 | grep -E 'error|Error' | head -20
```

Expected: No errors.

- [ ] **Step 3: Verify in the browser**

Visit `http://localhost:3000/dashboard/seasons` while signed in.

Expected:
- Seasons list renders inside the shell (sidebar visible on desktop)
- SEASONS nav item is highlighted in the sidebar

- [ ] **Step 4: Replace the old `/seasons` route with a redirect**

Overwrite [src/app/seasons/page.tsx](src/app/seasons/page.tsx) with:
```tsx
import { redirect } from "next/navigation";

export default function SeasonsRedirect() {
  redirect("/dashboard/seasons");
}
```

- [ ] **Step 5: Verify the redirect**

Visit `http://localhost:3000/seasons`.

Expected: Browser redirects to `/dashboard/seasons`.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/seasons/page.tsx src/app/seasons/page.tsx
git commit -m "feat: move seasons listing to /dashboard/seasons, add redirect from /seasons"
```

---

### Task 7: Create `dashboard/tournaments/page.tsx`

**Files:**
- Create: `src/app/dashboard/tournaments/page.tsx`

- [ ] **Step 1: Create the tournaments page under dashboard**

```bash
mkdir -p src/app/dashboard/tournaments
```

Create `src/app/dashboard/tournaments/page.tsx` with the content of [tournaments/page.tsx](src/app/tournaments/page.tsx) modified as follows:
- Remove the `import { ThemeToggle } from "@/app/components/ui"` line
- Remove the `export const revalidate = 30` line... wait, keep it — it's `export const revalidate = 30` which should be **kept**
- Remove the outermost `<div className="min-h-screen" ...>` wrapper and its closing `</div>`
- Remove the `<header>...</header>` block (everything from `<header` to `</header>`)
- Update filter tab hrefs from `/tournaments?filter=${tab}` to `/dashboard/tournaments?filter=${tab}`

Full file:
```tsx
// src/app/dashboard/tournaments/page.tsx
import Link from "next/link";
import { getAllTournaments } from "@/lib/tournament-db";

export const revalidate = 30;

type FilterTab = "all" | "waiting" | "active" | "completed";

const STATUS_LABEL: Record<string, string> = {
  waiting: "⏳ WAITING",
  active: "⚡ ACTIVE",
  completed: "✅ DONE",
};

const STATUS_COLOR: Record<string, string> = {
  waiting: "var(--color-primary)",
  active: "#60ff60",
  completed: "var(--color-text-muted)",
};

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "all" } = await searchParams;
  const currentFilter = (["all", "waiting", "active", "completed"].includes(filter)
    ? filter
    : "all") as FilterTab;

  const all = await getAllTournaments(100);
  const tournaments =
    currentFilter === "all" ? all : all.filter((t) => t.status === currentFilter);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="font-pixel text-[11px] mb-6" style={{ color: "var(--color-text)" }}>
        ALL TOURNAMENTS
      </h1>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(["all", "waiting", "active", "completed"] as const).map((tab) => (
          <Link
            key={tab}
            href={`/dashboard/tournaments?filter=${tab}`}
            className="font-pixel text-[6px] px-3 py-1.5 border-2"
            style={{
              borderColor: currentFilter === tab ? "var(--color-primary)" : "var(--color-border)",
              backgroundColor: currentFilter === tab ? "var(--color-primary)" : "var(--color-surface)",
              color: currentFilter === tab ? "var(--color-primary-text)" : "var(--color-text)",
              boxShadow: currentFilter === tab ? "2px 2px 0 var(--color-shadow)" : "none",
            }}
          >
            {tab.toUpperCase()}
          </Link>
        ))}
      </div>

      {tournaments.length === 0 ? (
        <div className="text-center py-20">
          <p className="font-pixel text-[8px] mb-2" style={{ color: "var(--color-text)" }}>
            NO TOURNAMENTS
          </p>
          <p className="font-pixel text-[6px]" style={{ color: "var(--color-text-muted)" }}>
            CHECK BACK LATER
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => (
            <div
              key={t.id}
              className="border-3 p-4 flex items-center justify-between"
              style={{
                borderColor:
                  t.status === "active"
                    ? "#60ff60"
                    : t.status === "waiting"
                    ? "var(--color-primary)"
                    : "var(--color-border)",
                backgroundColor: "var(--color-surface)",
                boxShadow: "3px 3px 0 var(--color-shadow)",
              }}
            >
              <div>
                <div
                  className="font-pixel text-[5px] mb-1"
                  style={{ color: STATUS_COLOR[t.status] ?? "var(--color-text-muted)" }}
                >
                  {STATUS_LABEL[t.status] ?? t.status.toUpperCase()}
                </div>
                <p className="font-pixel text-[8px]" style={{ color: "var(--color-text)" }}>
                  {t.name.toUpperCase()}
                </p>
                <p className="font-pixel text-[5px] mt-1" style={{ color: "var(--color-text-muted)" }}>
                  {t.team_count}/{t.max_teams} TEAMS
                  {t.status === "completed" && t.winner_name
                    ? ` · 🏆 ${t.winner_name.toUpperCase()}`
                    : ""}
                </p>
              </div>
              <Link
                href={`/tournaments/${t.id}`}
                className="font-pixel text-[6px] px-3 py-2 border-2 border-[var(--color-shadow)] shrink-0"
                style={{
                  backgroundColor:
                    t.status === "waiting" ? "var(--color-primary)" : "var(--color-surface-alt)",
                  color:
                    t.status === "waiting" ? "var(--color-primary-text)" : "var(--color-text)",
                }}
              >
                {t.status === "waiting" ? "JOIN →" : t.status === "active" ? "WATCH →" : "RESULTS →"}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

```bash
npm run build 2>&1 | grep -E 'error|Error' | head -20
```

Expected: No errors.

- [ ] **Step 3: Verify in the browser**

Visit `http://localhost:3000/dashboard/tournaments`.

Expected:
- Tournaments list renders inside the shell (no extra header, no duplicate branding)
- TOURNAMENTS nav item is highlighted in the sidebar
- Filter tabs work (clicking "WAITING" updates the URL to `/dashboard/tournaments?filter=waiting` and filters the list)
- Tournament detail links (JOIN →, WATCH →, RESULTS →) still point to `/tournaments/[id]`

- [ ] **Step 4: Replace the old `/tournaments` route with a redirect**

Overwrite [src/app/tournaments/page.tsx](src/app/tournaments/page.tsx) with:
```tsx
import { redirect } from "next/navigation";

export default function TournamentsRedirect() {
  redirect("/dashboard/tournaments");
}
```

- [ ] **Step 5: Verify the redirect**

Visit `http://localhost:3000/tournaments`.

Expected: Browser redirects to `/dashboard/tournaments`.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/tournaments/page.tsx src/app/tournaments/page.tsx
git commit -m "feat: move tournaments listing to /dashboard/tournaments, add redirect from /tournaments"
```

---

### Task 8: Create `dashboard/profile/page.tsx`

**Files:**
- Create: `src/app/dashboard/profile/page.tsx`

- [ ] **Step 1: Create the profile redirect page under dashboard**

```bash
mkdir -p src/app/dashboard/profile
```

Create `src/app/dashboard/profile/page.tsx`:
```tsx
// src/app/dashboard/profile/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function DashboardProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/");
  }
  redirect(`/users/${session.user.id}`);
}
```

- [ ] **Step 2: Verify in the browser**

Visit `http://localhost:3000/dashboard/profile` while signed in.

Expected: Browser redirects to `/users/[your-user-id]`.

Visit `http://localhost:3000/dashboard/profile` while signed out.

Expected: Browser redirects to `/`.

- [ ] **Step 3: Replace the old `/profile` route with a redirect**

> Note: the existing `/profile/page.tsx` currently redirects directly to `/users/[id]`. This is intentionally being replaced with a two-hop chain (`/profile` → `/dashboard/profile` → `/users/[id]`) so all sidebar navigation routes go through `/dashboard/*`.

Overwrite [src/app/profile/page.tsx](src/app/profile/page.tsx) with:
```tsx
import { redirect } from "next/navigation";

export default function ProfileRedirect() {
  redirect("/dashboard/profile");
}
```

- [ ] **Step 4: Verify the redirect chain**

Visit `http://localhost:3000/profile` while signed in.

Expected: Browser follows `/profile` → `/dashboard/profile` → `/users/[id]`.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/profile/page.tsx src/app/profile/page.tsx
git commit -m "feat: add dashboard/profile redirect page, update /profile route"
```

---

### Task 9: Final verification

- [ ] **Step 1: Full build check**

```bash
npm run build 2>&1
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: All tests pass, including the new `DashboardSidebar.test.ts` (created in Task 1).

- [ ] **Step 3: Manual smoke test checklist**

With `npm run dev` running:

**Desktop (browser width ≥ 768px):**
- [ ] `/dashboard` — sidebar visible, ROSTERS highlighted, roster cards load
- [ ] `/dashboard/seasons` — SEASONS highlighted, seasons list renders
- [ ] `/dashboard/tournaments` — TOURNAMENTS highlighted, tournament list renders; filter tabs update URL
- [ ] `/dashboard/profile` — redirects to `/users/[id]`
- [ ] `/seasons` — redirects to `/dashboard/seasons`
- [ ] `/tournaments` — redirects to `/dashboard/tournaments`
- [ ] `/profile` — redirects (via `/dashboard/profile`) to `/users/[id]`
- [ ] Theme toggle in sidebar — switches light/dark theme
- [ ] Sign out button in sidebar — signs user out and returns to home

**Mobile (browser width < 768px):**
- [ ] `/dashboard` — hamburger `☰` visible in top bar, sidebar hidden
- [ ] Tap `☰` — sidebar slides in from left
- [ ] Tap overlay — sidebar closes
- [ ] Tap `✕` inside drawer — sidebar closes
- [ ] Navigate to SEASONS via sidebar — drawer closes, SEASONS page loads
- [ ] Seasons, Tournaments nav items navigate correctly

- [ ] **Step 4: Final commit (if any remaining changes)**

```bash
git status
# Only commit if there are uncommitted changes
git add -p
git commit -m "chore: final cleanup for dashboard sidebar feature"
```
