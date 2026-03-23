# User Tournament Creation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow any authenticated user to create a tournament from the dashboard.

**Architecture:** Add a `POST` handler to the existing public `GET /api/tournaments` route, protected by session auth. Add an inline "Create Tournament" form to `RosterDashboard.tsx` that calls the new endpoint and navigates to the new tournament on success.

**Tech Stack:** Next.js 15 App Router, Better Auth (`auth.api.getSession`), Drizzle ORM (`createTournament` from `@/lib/tournament-db`), Vitest for tests, React (client component with `useState`), PokeInput/PokeButton/PokeCard UI primitives.

**Spec:** `docs/superpowers/specs/2026-03-23-user-tournament-creation-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/app/api/tournaments/route.ts` | Modify | Add `POST` handler — auth, validation, DB call |
| `src/app/api/tournaments/route.test.ts` | Create | Unit tests for the new POST handler |
| `src/app/components/RosterDashboard.tsx` | Modify | Add tournament create form, state, and submit handler |

---

## Chunk 1: Backend — POST /api/tournaments

### Task 1: Write failing tests for POST /api/tournaments

**Files:**
- Create: `src/app/api/tournaments/route.test.ts`

- [ ] **Step 1.1: Create the test file**

```ts
// src/app/api/tournaments/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const { mockGetSession, mockCreateTournament } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockCreateTournament: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: mockGetSession,
    },
  },
}));

vi.mock("@/lib/tournament-db", () => ({
  getAllTournaments: vi.fn().mockResolvedValue([]),
  createTournament: mockCreateTournament,
}));

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/tournaments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tournaments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTournament.mockResolvedValue("new-tournament-id");
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ name: "Test Cup", maxTeams: 8 }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when name is missing", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(makeRequest({ name: "", maxTeams: 8 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Tournament name is required" });
  });

  it("returns 400 when name is whitespace only", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(makeRequest({ name: "   ", maxTeams: 8 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Tournament name is required" });
  });

  it("returns 400 when name exceeds 100 characters", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    const longName = "a".repeat(101);
    const res = await POST(makeRequest({ name: longName, maxTeams: 8 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Tournament name must be 100 characters or fewer" });
  });

  it("returns 400 when maxTeams is not a valid power-of-2 size", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(makeRequest({ name: "Test Cup", maxTeams: 6 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Team size must be 2, 4, 8, 16, or 32" });
  });

  it("returns 400 when maxTeams is not in allowed set", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(makeRequest({ name: "Test Cup", maxTeams: 100 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Team size must be 2, 4, 8, 16, or 32" });
  });

  it("returns 400 when maxTeams is a float (e.g. 8.5)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(makeRequest({ name: "Test Cup", maxTeams: 8.5 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Team size must be 2, 4, 8, 16, or 32" });
  });

  it("creates tournament and returns 201 on valid input", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(makeRequest({ name: "  Test Cup  ", maxTeams: 8 }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      id: "new-tournament-id",
      name: "Test Cup",
      maxTeams: 8,
      status: "waiting",
    });
    expect(mockCreateTournament).toHaveBeenCalledWith({
      name: "Test Cup",
      maxTeams: 8,
      createdBy: "u1",
    });
  });

  it("accepts all valid maxTeams values", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    for (const size of [2, 4, 8, 16, 32]) {
      vi.clearAllMocks();
      mockCreateTournament.mockResolvedValue("tid");
      mockGetSession.mockResolvedValue({ user: { id: "u1" } });
      const res = await POST(makeRequest({ name: "Cup", maxTeams: size }));
      expect(res.status).toBe(201);
    }
  });
});
```

- [ ] **Step 1.2: Run tests to confirm they all fail**

```bash
npx vitest run src/app/api/tournaments/route.test.ts
```

Expected: multiple failures — `POST` is not exported from `./route`.

---

### Task 2: Implement POST /api/tournaments

**Files:**
- Modify: `src/app/api/tournaments/route.ts`

- [ ] **Step 2.1: Add the POST handler**

Current file only has a `GET` export. The existing file already imports `NextResponse` from `"next/server"` and `getAllTournaments` from `"@/lib/tournament-db"`. **Extend those existing import lines** — do not add duplicate import statements. The updated imports should look like:

```ts
// Extend existing imports — do NOT duplicate:
import { NextRequest, NextResponse } from "next/server";  // add NextRequest
import { auth } from "@/lib/auth";                        // new
import { headers } from "next/headers";                   // new
import { getAllTournaments, createTournament } from "@/lib/tournament-db";  // add createTournament

// Keep existing GET export unchanged, then add:

// POST /api/tournaments — Any authenticated user can create a tournament
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, maxTeams } = body;

  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) {
    return NextResponse.json({ error: "Tournament name is required" }, { status: 400 });
  }
  if (trimmedName.length > 100) {
    return NextResponse.json(
      { error: "Tournament name must be 100 characters or fewer" },
      { status: 400 }
    );
  }

  const size = Number(maxTeams);
  if (!Number.isInteger(size) || ![2, 4, 8, 16, 32].includes(size)) {
    return NextResponse.json(
      { error: "Team size must be 2, 4, 8, 16, or 32" },
      { status: 400 }
    );
  }

  const id = await createTournament({
    name: trimmedName,
    maxTeams: size,
    createdBy: user.id,
  });

  return NextResponse.json(
    { id, name: trimmedName, maxTeams: size, status: "waiting" },
    { status: 201 }
  );
}
```

- [ ] **Step 2.2: Run tests to confirm they all pass**

```bash
npx vitest run src/app/api/tournaments/route.test.ts
```

Expected: all tests PASS.

- [ ] **Step 2.3: Run the full test suite to check for regressions**

```bash
npm test
```

Expected: all tests pass (no regressions).

- [ ] **Step 2.4: Commit**

```bash
git add src/app/api/tournaments/route.ts src/app/api/tournaments/route.test.ts
git commit -m "feat: add POST /api/tournaments for user tournament creation"
```

---

## Chunk 2: Frontend — Create Tournament Form in RosterDashboard

### Task 3: Add tournament creation UI to RosterDashboard

**Files:**
- Modify: `src/app/components/RosterDashboard.tsx`

- [ ] **Step 3.1: Add new state variables**

In `RosterDashboard`, after the existing `error` state declaration (line 35: `const [error, setError] = useState("")`), add:

```ts
const [showCreateTournamentForm, setShowCreateTournamentForm] = useState(false);
const [newTournamentName, setNewTournamentName] = useState("");
const [newTournamentMaxTeams, setNewTournamentMaxTeams] = useState(8);
const [creatingTournament, setCreatingTournament] = useState(false);
const [tournamentCreateError, setTournamentCreateError] = useState("");
```

- [ ] **Step 3.2: Add the submit handler**

After the existing `handleUnsetTournament` function (around line 142), add:

```ts
const handleCreateTournament = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!newTournamentName.trim()) return;
  setCreatingTournament(true);
  setTournamentCreateError("");

  try {
    const res = await fetch("/api/tournaments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTournamentName.trim(), maxTeams: newTournamentMaxTeams }),
    });

    if (res.ok) {
      const data = await res.json();
      onJoinLiveTournament(data.id);
    } else {
      const data = await res.json();
      setTournamentCreateError(data.error || "Failed to create tournament");
    }
  } catch {
    setTournamentCreateError("Failed to create tournament");
  } finally {
    setCreatingTournament(false);
  }
};
```

- [ ] **Step 3.3: Add the "Create Tournament" section to the JSX**

Place the new section **after the entire rosters block** — after the closing `</div>` that wraps the roster grid (the outermost `</div>` that closes the `max-w-4xl mx-auto` container div, currently around line 451 in the file). This means the Tournament section appears below all roster content, not within it.

```tsx
{/* Create Tournament Section */}
<div className="flex items-center justify-between mb-4">
  <div>
    <h2 className="font-pixel text-[9px]" style={{ color: "var(--color-text)" }}>
      TOURNAMENTS
    </h2>
  </div>
  {!showCreateTournamentForm && (
    <PokeButton
      variant="primary"
      size="sm"
      onClick={() => {
        setShowCreateTournamentForm(true);
        setTournamentCreateError("");
      }}
    >
      + NEW TOURNAMENT
    </PokeButton>
  )}
</div>

{showCreateTournamentForm && (
  <div
    className="mb-6 p-4 border-3 border-[var(--color-border)]"
    style={{ backgroundColor: "var(--color-surface)", boxShadow: "4px 4px 0 var(--color-shadow)" }}
  >
    <form onSubmit={handleCreateTournament} className="flex flex-col gap-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <PokeInput
          type="text"
          value={newTournamentName}
          onChange={(e) => setNewTournamentName(e.target.value)}
          placeholder="Tournament name"
          autoFocus
        />
        <select
          value={newTournamentMaxTeams}
          onChange={(e) => setNewTournamentMaxTeams(Number(e.target.value))}
          className="font-pixel text-[7px] px-2 py-1 border-2 border-[var(--color-border)]"
          style={{ backgroundColor: "var(--color-surface)", color: "var(--color-text)" }}
        >
          {[2, 4, 8, 16, 32].map((n) => (
            <option key={n} value={n}>{n} TEAMS</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <PokeButton
          type="submit"
          variant="primary"
          size="md"
          disabled={creatingTournament || !newTournamentName.trim()}
        >
          {creatingTournament ? "CREATING..." : "CREATE"}
        </PokeButton>
        <PokeButton
          type="button"
          variant="ghost"
          size="md"
          onClick={() => {
            setShowCreateTournamentForm(false);
            setNewTournamentName("");
            setNewTournamentMaxTeams(8);
            setTournamentCreateError("");
          }}
        >
          CANCEL
        </PokeButton>
      </div>
    </form>
    {tournamentCreateError && (
      <p className="font-pixel text-[6px] mt-2" style={{ color: "var(--color-danger)" }}>
        {tournamentCreateError}
      </p>
    )}
  </div>
)}
```

- [ ] **Step 3.4: Run the full test suite**

```bash
npm test
```

Expected: all tests pass. (The frontend component has no unit tests — that's acceptable for this iteration.)

- [ ] **Step 3.5: Smoke-test manually in the browser**

1. Start dev server: `npm run dev`
2. Log in as any user (not admin)
3. Go to `/dashboard`
4. Confirm "TOURNAMENTS" section with "+ NEW TOURNAMENT" button appears
5. Click the button — form should appear, button should hide
6. Enter a name and select team size, submit
7. Should navigate to `/tournaments/<new-id>`
8. Click CANCEL — form should close, state should reset
9. Try submitting with empty name — button should be disabled

- [ ] **Step 3.6: Commit**

```bash
git add src/app/components/RosterDashboard.tsx
git commit -m "feat: add create tournament form to dashboard for all users"
```
