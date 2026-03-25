# Bot Fill Tournament Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let tournament creators instantly fill all remaining open slots with generated bot teams, starting the tournament immediately.

**Architecture:** A new `POST /api/live-tournaments/[id]/fill-bots` endpoint generates bot teams with Pokemon-themed names and random rosters, inserts them inside a Postgres advisory-locked transaction, then starts the tournament outside the transaction. The `GET /api/live-tournaments/[id]` response is updated to return `isCreator` and `userTeamName` in the waiting branch so the frontend can show a "FILL WITH BOTS" button only to the creator.

**Tech Stack:** Next.js App Router, Drizzle ORM, PostgreSQL, Vitest, React

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `src/lib/pokemon-pool.ts` | Shared cached loader for augmented pokemon JSON |
| Modify | `src/lib/tournament-db.ts` | Add `created_by` to `getTournament()` return type + value; add optional `tx` param to `joinTournament` |
| Modify | `src/app/api/live-tournaments/route.ts` | Pass `createdBy: user.id` on implicit create; use shared pool loader |
| Modify | `src/app/api/live-tournaments/[id]/route.ts` | Add `isCreator` + `userTeamName` to waiting branch and `isCreator` to active/completed branch |
| Create | `src/app/api/live-tournaments/[id]/fill-bots/route.ts` | New fill-bots endpoint |
| Create | `src/app/api/live-tournaments/[id]/fill-bots/route.test.ts` | Tests for fill-bots endpoint |
| Modify | `src/app/tournaments/[id]/page.tsx` | Add `isCreator` to type, "FILL WITH BOTS" button + handler |

---

## Chunk 1: Backend Foundation

### Task 1: Extract `loadPokemonPool` to a shared module

**Files:**
- Create: `src/lib/pokemon-pool.ts`
- Modify: `src/app/api/live-tournaments/route.ts` (remove local `cachedPool` + `loadPokemonPool`, import from shared)

- [ ] **Step 1: Create `src/lib/pokemon-pool.ts`**

```ts
// src/lib/pokemon-pool.ts
import { readFileSync } from "fs";
import { join } from "path";

let cachedPool: Record<number, Record<string, unknown>> | null = null;

export function loadPokemonPool(): Record<number, Record<string, unknown>> {
  if (cachedPool) return cachedPool;
  const filePath = join(process.cwd(), "public", "pokemon-bball-stats-augmented.json");
  const data: Record<string, unknown>[] = JSON.parse(readFileSync(filePath, "utf-8"));
  cachedPool = {};
  for (const p of data) {
    cachedPool[p.id as number] = p;
  }
  return cachedPool;
}
```

- [ ] **Step 2: Update `src/app/api/live-tournaments/route.ts` to use shared loader**

At the top of the file, remove lines 27–39 (the `cachedPool` variable and `loadPokemonPool` function definition). Add this import:

```ts
import { loadPokemonPool } from "@/lib/pokemon-pool";
```

The `loadPokemonPool()` call at line 119 continues to work unchanged.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pokemon-pool.ts src/app/api/live-tournaments/route.ts
git commit -m "refactor: extract loadPokemonPool to shared module"
```

---

### Task 2: Update `getTournament()` and `joinTournament()` in `tournament-db.ts`

**Files:**
- Modify: `src/lib/tournament-db.ts`

Two changes in this file:
1. Add `created_by` to `getTournament`'s return type declaration and return value
2. Add optional `tx` parameter to `joinTournament` so it can participate in a transaction

- [ ] **Step 1: Update the `getTournament` return type declaration**

Find the function signature (around line 100):

```ts
export async function getTournament(tournamentId: string): Promise<{
  id: string;
  name: string;
  status: string;
  max_teams: number;
  created_at: Date;
  started_at: Date | null;
  bracket_data: unknown;
} | null> {
```

Replace with:

```ts
export async function getTournament(tournamentId: string): Promise<{
  id: string;
  name: string;
  status: string;
  max_teams: number;
  created_at: Date;
  started_at: Date | null;
  bracket_data: unknown;
  created_by: string | null;
} | null> {
```

- [ ] **Step 2: Add `created_by` to the return value**

Find the return statement inside `getTournament` (around line 115). Change:

```ts
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    max_teams: r.maxTeams,
    created_at: r.createdAt,
    started_at: r.startedAt ?? null,
    bracket_data: r.bracketData,
  };
```

To:

```ts
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    max_teams: r.maxTeams,
    created_at: r.createdAt,
    started_at: r.startedAt ?? null,
    bracket_data: r.bracketData,
    created_by: r.createdBy ?? null,
  };
```

- [ ] **Step 3: Add optional `tx` parameter to `joinTournament`**

Find the `joinTournament` function (around line 54). Change:

```ts
export async function joinTournament(
  tournamentId: string,
  userId: string,
  rosterId: string,
  teamName: string,
  rosterData: unknown
): Promise<void> {
  await db
    .insert(liveTournamentTeams)
    .values({ tournamentId, userId, rosterId, teamName, rosterData, result: "waiting" })
    .onConflictDoNothing();
}
```

To:

```ts
export async function joinTournament(
  tournamentId: string,
  userId: string,
  rosterId: string,
  teamName: string,
  rosterData: unknown,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0]
): Promise<void> {
  const executor = tx ?? db;
  await executor
    .insert(liveTournamentTeams)
    .values({ tournamentId, userId, rosterId, teamName, rosterData, result: "waiting" })
    .onConflictDoNothing();
}
```

- [ ] **Step 4: Fix `createdBy` on implicit tournament creation in `src/app/api/live-tournaments/route.ts`**

Find line 157 (inside the `else` branch of `if (requestedId)`):

```ts
    const found = await findOpenTournament();
    tournamentId = found ?? await createTournament();
```

Change to:

```ts
    const found = await findOpenTournament();
    tournamentId = found ?? await createTournament({ createdBy: user.id });
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tournament-db.ts src/app/api/live-tournaments/route.ts
git commit -m "feat: add created_by to getTournament, tx support to joinTournament, fix implicit createdBy"
```

---

### Task 3: Add `isCreator` and `userTeamName` to `GET /api/live-tournaments/[id]`

**Files:**
- Modify: `src/app/api/live-tournaments/[id]/route.ts`

- [ ] **Step 1: Update the waiting branch**

The current waiting branch (lines 26–39) does no session lookup. Replace it with:

```ts
  // Waiting state: return lobby info
  if (tournament.status === "waiting") {
    const teams = await getTournamentTeams(id);

    // Optional session lookup for isCreator + userTeamName
    let isCreator = false;
    let userTeamName: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: await headers() });
      if (session?.user) {
        isCreator = tournament.created_by === session.user.id;
        const rows = await db
          .select({ teamName: liveTournamentTeams.teamName })
          .from(liveTournamentTeams)
          .where(
            and(
              eq(liveTournamentTeams.tournamentId, id),
              eq(liveTournamentTeams.userId, session.user.id)
            )
          );
        userTeamName = rows[0]?.teamName ?? null;
      }
    } catch {
      // Not authenticated — that's fine, page is public
    }

    return NextResponse.json({
      id: tournament.id,
      name: tournament.name,
      status: "waiting",
      maxTeams: tournament.max_teams,
      teamCount: teams.length,
      teams: teams.map((t) => ({
        teamName: t.team_name,
        userId: t.user_id,
        joinedAt: t.joined_at,
      })),
      userTeamName,
      isCreator,
    });
  }
```

- [ ] **Step 2: Update the active/completed branch to include `isCreator`**

Find the `let userTeamName: string | null = null;` declaration around line 70. Add `isCreator` alongside it:

```ts
  let userTeamName: string | null = null;
  let isCreator = false;
```

Inside the existing `if (session?.user)` block (around line 73), after `userTeamName = rows[0]?.teamName ?? null;`, add:

```ts
      isCreator = tournament.created_by === session.user.id;
```

Add `isCreator` to the final return object (around line 89):

```ts
  return NextResponse.json({
    id: tournament.id,
    name: tournament.name,
    status: tournament.status,
    maxTeams: tournament.max_teams,
    totalRounds: bracketData.totalRounds,
    matchups,
    userTeamName,
    isCreator,
    startedAt: tournament.started_at?.toISOString() ?? null,
  });
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/live-tournaments/\\[id\\]/route.ts
git commit -m "feat: add isCreator and userTeamName to tournament GET response"
```

---

## Chunk 2: Fill-Bots Endpoint

### Task 4: Write failing tests for `POST /api/live-tournaments/[id]/fill-bots`

**Files:**
- Create: `src/app/api/live-tournaments/[id]/fill-bots/route.test.ts`

- [ ] **Step 1: Create the test file**

```ts
// src/app/api/live-tournaments/[id]/fill-bots/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const {
  mockGetSession,
  mockGetTournament,
  mockGetTournamentTeamCount,
  mockGetTournamentTeams,
  mockJoinTournament,
  mockStartTournament,
  mockDbTransaction,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetTournament: vi.fn(),
  mockGetTournamentTeamCount: vi.fn(),
  mockGetTournamentTeams: vi.fn(),
  mockJoinTournament: vi.fn(),
  mockStartTournament: vi.fn(),
  mockDbTransaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mockGetSession } },
}));

vi.mock("@/lib/tournament-db", () => ({
  getTournament: mockGetTournament,
  getTournamentTeamCount: mockGetTournamentTeamCount,
  getTournamentTeams: mockGetTournamentTeams,
  joinTournament: mockJoinTournament,
  startTournament: mockStartTournament,
}));

vi.mock("@/lib/db", () => ({
  db: { transaction: mockDbTransaction },
}));

vi.mock("@/lib/pokemon-pool", () => ({
  loadPokemonPool: vi.fn(() => {
    const pool: Record<number, Record<string, unknown>> = {};
    for (let i = 1; i <= 20; i++) {
      pool[i] = {
        id: i,
        name: `pokemon-${i}`,
        sprite: `sprite-${i}.png`,
        types: ["fire"],
        stats: {},
        height: 10,
        weight: 50,
        ability: "blaze",
        rivals: [],
        allies: [],
        physicalProfile: {},
        bball: { ppg: 10, rpg: 5, apg: 3, per: 15 },
        playstyle: ["scorer"],
        salary: 1000000,
      };
    }
    return pool;
  }),
}));

function makeRequest(tournamentId: string) {
  return new NextRequest(
    `http://localhost/api/live-tournaments/${tournamentId}/fill-bots`,
    { method: "POST" }
  );
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

const WAITING_TOURNAMENT = {
  id: "t1",
  name: "Test Cup",
  status: "waiting",
  max_teams: 4,
  created_at: new Date(),
  started_at: null,
  bracket_data: null,
  created_by: "user-1",
};

function makeMockRoster() {
  return Array.from({ length: 6 }, (_, i) => ({
    id: i + 1,
    name: `pokemon-${i + 1}`,
    sprite: `sprite-${i + 1}.png`,
    types: ["fire"],
    stats: {},
    height: 10,
    weight: 50,
    bball: { ppg: 10, rpg: 5, apg: 3, per: 15 },
  }));
}

const MOCK_TEAMS = [
  { id: "tt1", user_id: "user-1", roster_id: "r1", team_name: "Team A", roster_data: makeMockRoster(), joined_at: new Date() },
  { id: "tt2", user_id: "user-2", roster_id: "r2", team_name: "Team B", roster_data: makeMockRoster(), joined_at: new Date() },
];

// Helper: simulate the transaction executing its callback with a fake tx object.
// The fake tx provides execute() returning advisory lock (no rows) by default,
// and the in-transaction count/status query results.
function setupTransactionMock({
  liveCount,
  liveStatus,
}: { liveCount: number; liveStatus: string }) {
  mockDbTransaction.mockImplementation(
    async (cb: (tx: { execute: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
      const mockExecute = vi.fn()
        .mockResolvedValueOnce([]) // advisory lock — no rows needed
        .mockResolvedValueOnce([{ count: liveCount, status: liveStatus }]); // count+status check
      return cb({ execute: mockExecute });
    }
  );
}

describe("POST /api/live-tournaments/[id]/fill-bots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJoinTournament.mockResolvedValue(undefined);
    mockStartTournament.mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    mockGetTournament.mockResolvedValue(WAITING_TOURNAMENT);
    const { POST } = await import("./route");
    const res = await POST(makeRequest("t1"), makeParams("t1"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when tournament not found", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockGetTournament.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest("t1"), makeParams("t1"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Tournament not found" });
  });

  it("returns 403 when caller is not the creator", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "other-user" } });
    mockGetTournament.mockResolvedValue(WAITING_TOURNAMENT);
    const { POST } = await import("./route");
    const res = await POST(makeRequest("t1"), makeParams("t1"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only the tournament creator can fill with bots" });
  });

  it("returns 400 when tournament has already started (pre-check)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockGetTournament.mockResolvedValue({ ...WAITING_TOURNAMENT, status: "active" });
    const { POST } = await import("./route");
    const res = await POST(makeRequest("t1"), makeParams("t1"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Tournament has already started" });
  });

  it("returns 400 when tournament is already full (pre-check)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockGetTournament.mockResolvedValue(WAITING_TOURNAMENT); // max_teams: 4
    mockGetTournamentTeamCount.mockResolvedValue(4);
    const { POST } = await import("./route");
    const res = await POST(makeRequest("t1"), makeParams("t1"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Tournament is already full" });
  });

  it("returns 400 when tournament was grabbed by a concurrent request (in-transaction check)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockGetTournament.mockResolvedValue(WAITING_TOURNAMENT);
    mockGetTournamentTeamCount.mockResolvedValue(2);
    // Simulate: by the time we're inside the transaction, status changed to active
    setupTransactionMock({ liveCount: 4, liveStatus: "active" });
    const { POST } = await import("./route");
    const res = await POST(makeRequest("t1"), makeParams("t1"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Tournament no longer available" });
  });

  it("fills remaining slots with bots and starts tournament", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockGetTournament.mockResolvedValue(WAITING_TOURNAMENT); // max_teams: 4
    mockGetTournamentTeamCount.mockResolvedValue(2); // 2 real players, need 2 bots
    mockGetTournamentTeams.mockResolvedValue(MOCK_TEAMS);
    setupTransactionMock({ liveCount: 2, liveStatus: "waiting" });

    const { POST } = await import("./route");
    const res = await POST(makeRequest("t1"), makeParams("t1"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tournamentId: "t1", status: "active" });

    // Should have joined exactly 2 bots (inside transaction)
    expect(mockJoinTournament).toHaveBeenCalledTimes(2);
    const [firstCall] = mockJoinTournament.mock.calls;
    expect(firstCall[0]).toBe("t1");
    expect(firstCall[1]).toMatch(/^bot_/);

    // Tournament should have been started (outside transaction)
    expect(mockStartTournament).toHaveBeenCalledTimes(1);
    const [tId, matchups, totalRounds] = mockStartTournament.mock.calls[0];
    expect(tId).toBe("t1");
    expect(matchups).toHaveLength(2); // 4 teams → 2 round-1 matchups
    expect(totalRounds).toBe(2);      // log2(4) = 2
  });

  it("bot team names follow '<City> <Mascot>' format", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockGetTournament.mockResolvedValue(WAITING_TOURNAMENT);
    mockGetTournamentTeamCount.mockResolvedValue(2);
    mockGetTournamentTeams.mockResolvedValue(MOCK_TEAMS);
    setupTransactionMock({ liveCount: 2, liveStatus: "waiting" });

    const { POST } = await import("./route");
    await POST(makeRequest("t1"), makeParams("t1"));

    const botNames = mockJoinTournament.mock.calls.map((c: unknown[]) => c[3] as string);
    for (const name of botNames) {
      expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+/);
    }
  });

  it("each bot roster has exactly 6 pokemon with correct slot labels", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockGetTournament.mockResolvedValue({ ...WAITING_TOURNAMENT, max_teams: 2 });
    mockGetTournamentTeamCount.mockResolvedValue(1);
    mockGetTournamentTeams.mockResolvedValue([MOCK_TEAMS[0]]);
    setupTransactionMock({ liveCount: 1, liveStatus: "waiting" });

    const { POST } = await import("./route");
    await POST(makeRequest("t1"), makeParams("t1"));

    const rosterData = mockJoinTournament.mock.calls[0][4] as Array<{ position: string }>;
    expect(rosterData).toHaveLength(6);
    expect(rosterData.map((p) => p.position)).toEqual(["PG", "SG", "SF", "PF", "C", "6MAN"]);
  });
});
```

- [ ] **Step 2: Run tests — they should fail (route doesn't exist yet)**

```bash
npx vitest run src/app/api/live-tournaments/\\[id\\]/fill-bots/route.test.ts
```

Expected: fails with module import error.

- [ ] **Step 3: Commit the tests**

```bash
git add "src/app/api/live-tournaments/[id]/fill-bots/route.test.ts"
git commit -m "test: add failing tests for fill-bots endpoint"
```

---

### Task 5: Implement the `fill-bots` endpoint

**Files:**
- Create: `src/app/api/live-tournaments/[id]/fill-bots/route.ts`

- [ ] **Step 1: Create the route file**

```ts
// src/app/api/live-tournaments/[id]/fill-bots/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  getTournament,
  getTournamentTeamCount,
  getTournamentTeams,
  joinTournament,
  startTournament,
} from "@/lib/tournament-db";
import { loadPokemonPool } from "@/lib/pokemon-pool";
import { toTournamentPokemon } from "@/app/utils/tournamentEngine";

// ─── Bot name data ────────────────────────────────────────────────────────────

const BOT_CITIES = [
  "Pallet", "Cerulean", "Vermilion", "Lavender", "Celadon",
  "Fuchsia", "Saffron", "Cinnabar", "Viridian", "Pewter",
  "Goldenrod", "Ecruteak", "Olivine", "Mahogany", "Blackthorn", "Azalea",
];

const BOT_MASCOTS = [
  "Charizards", "Arcanines", "Gengars", "Machamps", "Alakazams",
  "Gyaradoses", "Snorlaxes", "Electrodes", "Nidokings", "Tauros",
  "Rhydons", "Onixes",
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateBotNames(count: number): string[] {
  const cities = shuffle(BOT_CITIES);
  const mascots = shuffle(BOT_MASCOTS);
  return Array.from({ length: count }, (_, i) => {
    const city = cities[i % cities.length];
    const mascot = mascots[i % mascots.length];
    return `${city} ${mascot}`;
  });
}

// ─── Bot roster generation ────────────────────────────────────────────────────

const SLOT_LABELS = ["PG", "SG", "SF", "PF", "C", "6MAN"];

function generateBotRoster(pool: Record<number, Record<string, unknown>>) {
  const ids = shuffle(Object.keys(pool).map(Number)).slice(0, 6);
  return ids.map((id, i) => {
    const p = pool[id];
    return {
      id,
      name: p.name as string,
      sprite: (p.sprite as string) ?? undefined,
      types: (p.types as string[]) ?? [],
      stats: p.stats ?? {},
      height: (p.height as number) ?? undefined,
      weight: (p.weight as number) ?? undefined,
      position: SLOT_LABELS[i],
      ability: (p.ability as string) ?? undefined,
      rivals: (p.rivals as string[]) ?? [],
      allies: (p.allies as string[]) ?? [],
      physicalProfile: p.physicalProfile ?? undefined,
      bball: p.bball ?? {},
      playstyle: (p.playstyle as string[]) ?? undefined,
      salary: (p.salary as number) ?? undefined,
    };
  });
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;

  // Auth
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Tournament exists?
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  // Creator check
  if (tournament.created_by !== session.user.id) {
    return NextResponse.json(
      { error: "Only the tournament creator can fill with bots" },
      { status: 403 }
    );
  }

  // Fast-path pre-checks (avoid acquiring the lock unnecessarily)
  if (tournament.status !== "waiting") {
    return NextResponse.json({ error: "Tournament has already started" }, { status: 400 });
  }
  const currentCount = await getTournamentTeamCount(tournamentId);
  if (currentCount >= tournament.max_teams) {
    return NextResponse.json({ error: "Tournament is already full" }, { status: 400 });
  }

  // Load pool before transaction
  const pool = loadPokemonPool();

  // ── Transaction: advisory lock + re-check + bot inserts ───────────────────
  // Bot inserts run inside the transaction. startTournament runs outside
  // (it uses db directly and doesn't support tx), but the re-check ensures
  // only one concurrent request will reach the startTournament call.
  let aborted = false;
  let remaining = 0;
  const botNames: string[] = [];
  const botRosters: ReturnType<typeof generateBotRoster>[] = [];
  const botUserIds: string[] = [];

  await db.transaction(async (tx) => {
    // Advisory transaction lock — blocks concurrent fill-bots for the same tournament
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${tournamentId + ":fill"}))`
    );

    // Re-check status + count atomically inside the lock
    const [row] = await tx.execute(
      sql`SELECT status, (SELECT COUNT(*)::int FROM live_tournament_teams WHERE tournament_id = ${tournamentId}) AS count FROM live_tournaments WHERE id = ${tournamentId}`
    ) as [{ status: string; count: number }];

    if (!row || row.status !== "waiting" || row.count >= tournament.max_teams) {
      aborted = true;
      return;
    }

    remaining = tournament.max_teams - row.count;
    const names = generateBotNames(remaining);

    for (let i = 0; i < remaining; i++) {
      const botUserId = `bot_${crypto.randomUUID()}`;
      const rosterData = generateBotRoster(pool);
      botUserIds.push(botUserId);
      botNames.push(names[i]);
      botRosters.push(rosterData);
      await joinTournament(tournamentId, botUserId, botUserId, names[i], rosterData, tx);
    }
  });

  if (aborted) {
    return NextResponse.json({ error: "Tournament no longer available" }, { status: 400 });
  }

  // ── Seed and start (outside transaction) ──────────────────────────────────
  const teams = await getTournamentTeams(tournamentId);
  const rankedTeams = teams
    .map((t) => {
      const roster = (t.roster_data as Parameters<typeof toTournamentPokemon>[0][]).map(
        toTournamentPokemon
      );
      const power = roster.reduce(
        (sum, p) =>
          sum +
          p.bball.ppg * 2.5 +
          p.bball.rpg * 1.2 +
          p.bball.apg * 1.8 +
          p.bball.per * 1.0,
        0
      );
      return { userId: t.user_id, teamName: t.team_name, power };
    })
    .sort((a, b) => b.power - a.power);

  const totalRounds = Math.floor(Math.log2(tournament.max_teams));
  const round1Matchups = [];
  for (let i = 0; i < rankedTeams.length / 2; i++) {
    round1Matchups.push({
      matchupIndex: i,
      team1UserId: rankedTeams[i].userId,
      team1Name: rankedTeams[i].teamName,
      team2UserId: rankedTeams[rankedTeams.length - 1 - i].userId,
      team2Name: rankedTeams[rankedTeams.length - 1 - i].teamName,
    });
  }

  await startTournament(tournamentId, round1Matchups, totalRounds);

  return NextResponse.json({ tournamentId, status: "active" });
}
```

- [ ] **Step 2: Run tests — they should now pass**

```bash
npx vitest run src/app/api/live-tournaments/\\[id\\]/fill-bots/route.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/live-tournaments/[id]/fill-bots/route.ts"
git commit -m "feat: add POST /api/live-tournaments/[id]/fill-bots endpoint"
```

---

## Chunk 3: Frontend

### Task 6: Add "FILL WITH BOTS" button to the waiting lobby

**Files:**
- Modify: `src/app/tournaments/[id]/page.tsx`

- [ ] **Step 1: Add `isCreator` to `TournamentState` interface**

Find the `TournamentState` interface (around line 26). Add `isCreator?: boolean`:

```ts
interface TournamentState {
  id: string;
  name: string;
  status: string;
  maxTeams: number;
  totalRounds?: number;
  teamCount?: number;
  teams?: { teamName: string; userId: string; joinedAt: string }[];
  matchups?: MatchupState[];
  userTeamName?: string | null;
  isCreator?: boolean;
  startedAt?: string | null;
}
```

- [ ] **Step 2: Add `fillingBots` state**

Near the `const [leaving, setLeaving] = useState(false);` line, add:

```ts
  const [fillingBots, setFillingBots] = useState(false);
```

- [ ] **Step 3: Add `handleFillBots` handler**

After the `handleLeave` function, add:

```ts
  const handleFillBots = async () => {
    setFillingBots(true);
    setError("");
    try {
      const res = await fetch(`/api/live-tournaments/${id}/fill-bots`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to fill with bots");
        return;
      }
      await fetchTournament();
    } catch {
      setError("Failed to fill with bots");
    } finally {
      setFillingBots(false);
    }
  };
```

- [ ] **Step 4: Add the button to the waiting lobby section**

In the `{tournament.status === "waiting" && (...)}` block, after the "LEAVE TOURNAMENT" `PokeButton` (around line 845), add:

```tsx
            {tournament.isCreator && (tournament.teamCount ?? 0) < tournament.maxTeams && (
              <PokeButton
                variant="primary"
                size="md"
                onClick={handleFillBots}
                disabled={fillingBots}
                className="mb-4"
              >
                {fillingBots ? "FILLING..." : "⚡ FILL WITH BOTS"}
              </PokeButton>
            )}
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add "src/app/tournaments/[id]/page.tsx"
git commit -m "feat: add Fill with Bots button to tournament waiting lobby"
```

---

## Final Verification

- [ ] **Manual smoke test (optional but recommended):**
  1. Create a tournament with `maxTeams: 4` via `/api/tournaments` (POST)
  2. Join as 1 real player
  3. Visit `/tournaments/[id]` — confirm "FILL WITH BOTS" button is visible only for the creator
  4. As a different user, confirm the button is NOT visible
  5. Click "FILL WITH BOTS" as the creator — tournament starts and bracket renders

- [ ] **Final commit count check**

```bash
git log --oneline -7
```

Should show: pokemon-pool refactor, tournament-db + createdBy fix, GET route update, test commit, fill-bots endpoint, UI button.
