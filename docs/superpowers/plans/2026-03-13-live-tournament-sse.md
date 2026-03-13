# Live Tournament SSE Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace upfront tournament simulation with real-time SSE-streamed event generation, where games simulate live during their 5-minute window driven by a Vercel Cron job.

**Architecture:** A Vercel Cron job fires every minute, detects pending games whose round window has opened, claims them atomically, and dispatches a long-running `simulateGameLive` background function per game via `waitUntil`. Events are written one-at-a-time to a new `tournament_game_events` DB table. Clients subscribe via `EventSource` to an SSE endpoint that bursts existing events on connect then polls DB every 500ms for new ones.

**Tech Stack:** Next.js 14, Drizzle ORM, Neon PostgreSQL (`@neondatabase/serverless`), `@vercel/functions` (waitUntil), Vitest, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-13-live-tournament-sse-design.md`

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `vercel.json` | Cron schedule + maxDuration config |
| Modify | `src/lib/schema.ts` | Add `tournamentGameEvents` table; update `tournamentGames` (add `claimedAt`, `startedAt`; remove `events`) |
| Modify | `src/lib/tournament-db.ts` | `claimGame` (add claimedAt), `writeGameResult` (remove events), add `insertGameEvent`, `getGameEvents`, `tryAdvanceRound`; update `appendNextRound`+`completeTournament` to accept tx |
| Create | `src/lib/game-iterator.ts` | Pure stateful iterator that yields one `GameEvent` at a time |
| Create | `src/lib/game-iterator.test.ts` | Unit tests for game iterator |
| Create | `src/lib/simulate-game-live.ts` | `simulateGameLive(gameId)` — long-running background simulation |
| Create | `src/app/api/cron/tick/route.ts` | Cron handler — detects pending rounds, dispatches simulations |
| Create | `src/app/api/live-tournaments/[id]/games/[gameId]/stream/route.ts` | SSE stream endpoint |
| Modify | `src/app/api/live-tournaments/[id]/games/[gameId]/route.ts` | GET: query `tournament_game_events`; DELETE: remove POST handler |
| Modify | `src/app/api/live-tournaments/route.ts` | Remove `simulateAllRounds` and its call |
| Modify | `src/app/tournaments/[id]/page.tsx` | Replace polling + displayAtMs with EventSource |
| Modify | `src/app/utils/tournamentEngine.ts` | Export `calculateTeamFactors`; remove `generateGameEvents` and `simulateLiveGame` only — keep `simulateMatchup` (still called by `simulateBracketForSize`) |
| Modify | `package.json` | Add `@vercel/functions` |

---

## Chunk 1: Schema Migration

### Task 1: Add `@vercel/functions` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

```bash
npm install @vercel/functions
```

Expected: package added to `dependencies` in `package.json`.

- [ ] **Step 2: Verify import works**

```bash
node -e "require('@vercel/functions')" && echo "OK"
```

Expected: `OK` (no error).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @vercel/functions dependency"
```

---

### Task 2: Update DB schema

**Files:**
- Modify: `src/lib/schema.ts`

- [ ] **Step 1: Update `tournamentGames` — add `claimedAt`, `startedAt`, remove `events`**

In `src/lib/schema.ts`, replace the `tournamentGames` table definition:

```ts
export const tournamentGames = pgTable(
  "tournament_games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => liveTournaments.id, { onDelete: "cascade" }),
    round: integer("round").notNull(),
    matchupIndex: integer("matchup_index").notNull(),
    team1UserId: text("team1_user_id"),
    team1Name: text("team1_name"),
    team2UserId: text("team2_user_id"),
    team2Name: text("team2_name"),
    team1Score: integer("team1_score"),
    team2Score: integer("team2_score"),
    winnerId: text("winner_id"),
    status: text("status").notNull().default("pending"), // "pending" | "in_progress" | "completed"
    startedAt: timestamp("started_at", { withTimezone: true }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    playedAt: timestamp("played_at", { withTimezone: true }),
  },
  (t) => [index("tournament_games_tournament_id_idx").on(t.tournamentId)]
);
```

Note: `events: jsonb("events")` is removed.

- [ ] **Step 2: Add `tournamentGameEvents` table at the bottom of `src/lib/schema.ts`**

```ts
export const tournamentGameEvents = pgTable(
  "tournament_game_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => tournamentGames.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("tournament_game_events_game_seq_uniq").on(t.gameId, t.sequence),
    index("tournament_game_events_game_id_idx").on(t.gameId),
    index("tournament_game_events_game_seq_idx").on(t.gameId, t.sequence),
  ]
);
```

- [ ] **Step 3: Generate migration**

```bash
npm run db:generate
```

Expected: a new migration file created under `drizzle/` with `ALTER TABLE tournament_games DROP COLUMN events`, `ADD COLUMN started_at`, `ADD COLUMN claimed_at`, and `CREATE TABLE tournament_game_events`.

- [ ] **Step 4: Apply migration**

```bash
npm run db:migrate
```

Expected: migration applied successfully. Verify with:

```bash
npm run db:studio
```

Open the studio and confirm `tournament_games` has `started_at` and `claimed_at` columns but no `events` column, and `tournament_game_events` table exists.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schema.ts drizzle/
git commit -m "feat(db): add tournament_game_events table, update tournament_games schema"
```

---

## Chunk 2: Tournament DB Functions

### Task 3: Update `claimGame` and `writeGameResult`

**Files:**
- Modify: `src/lib/tournament-db.ts`

- [ ] **Step 1: Update `claimGame` to set `claimedAt`**

Find the `claimGame` function and replace the `.set()` call:

```ts
export async function claimGame(gameId: string) {
  const rows = await db
    .update(tournamentGames)
    .set({ status: "in_progress", claimedAt: new Date() })
    .where(and(eq(tournamentGames.id, gameId), eq(tournamentGames.status, "pending")))
    .returning();
  return rows[0] ?? null;
}
```

- [ ] **Step 2: Update `writeGameResult` — remove `events` parameter**

```ts
export async function writeGameResult(
  gameId: string,
  team1Score: number,
  team2Score: number,
  winnerId: string,
): Promise<void> {
  await db
    .update(tournamentGames)
    .set({
      status: "completed",
      team1Score,
      team2Score,
      winnerId,
      playedAt: new Date(),
    })
    .where(eq(tournamentGames.id, gameId));
}
```

- [ ] **Step 3: Fix the TypeScript error in `src/app/api/live-tournaments/[id]/games/[gameId]/route.ts` (POST handler calls `writeGameResult` with 5 args)**

The POST handler in `games/[gameId]/route.ts` will now have a type error — it passes `result.events` as a 5th arg. That POST handler will be fully deleted in Chunk 8. For now, just remove the 5th argument from its `writeGameResult` call to make it compile:

```ts
// In games/[gameId]/route.ts POST handler, line ~100:
await writeGameResult(gameId, team1Score, team2Score, winnerId);
// (remove ", result.events")
```

Also remove the `events: result.events` from the POST handler's return JSON (it won't have events anymore). Replace with `events: []`.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to `writeGameResult`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament-db.ts src/app/api/live-tournaments/[id]/games/[gameId]/route.ts
git commit -m "feat(db): update claimGame (claimedAt) and writeGameResult (drop events param)"
```

---

### Task 4: Add `insertGameEvent` and `getGameEvents`

**Files:**
- Modify: `src/lib/tournament-db.ts`

- [ ] **Step 1: Add import for `tournamentGameEvents` at the top of `tournament-db.ts`**

```ts
import { eq, and, asc, desc, inArray, sql, ne, gt } from "drizzle-orm";
import { liveTournaments, liveTournamentTeams, tournamentGames, tournamentGameEvents } from "./schema";
```

Add `ne` and `gt` to the drizzle-orm import (both are needed in this task).

- [ ] **Step 2: Add `insertGameEvent`**

```ts
export async function insertGameEvent(
  gameId: string,
  sequence: number,
  type: string,
  data: Record<string, unknown>
): Promise<void> {
  await db
    .insert(tournamentGameEvents)
    .values({ gameId, sequence, type, data })
    .onConflictDoNothing(); // UNIQUE(game_id, sequence) — safe on retry
}
```

- [ ] **Step 3: Add `getGameEvents`**

```ts
export async function getGameEvents(gameId: string, afterSequence = -1) {
  const rows = await db
    .select()
    .from(tournamentGameEvents)
    .where(
      and(
        eq(tournamentGameEvents.gameId, gameId),
        gt(tournamentGameEvents.sequence, afterSequence)
      )
    )
    .orderBy(asc(tournamentGameEvents.sequence));
  return rows;
}
```

- [ ] **Step 4: Add `deleteGameEvents` (used in crash recovery)**

```ts
export async function deleteGameEvents(gameId: string): Promise<void> {
  await db
    .delete(tournamentGameEvents)
    .where(eq(tournamentGameEvents.gameId, gameId));
}
```

- [ ] **Step 5: Update `getTournamentGames` return type — remove `events` field**

The existing `getTournamentGames` function maps rows and returns an `events` field from the now-deleted column. Remove it:

```ts
// In the return rows.map(...) inside getTournamentGames, remove:
// events: r.events,
// The field simply disappears from the return type.
```

Also update the `getGame` function similarly — remove `events` from the select/return if it references `r.events`.

- [ ] **Step 6: Run TypeScript check**

```bash
npx tsc --noEmit
```

Fix any remaining references to `game.events` or `r.events` that the compiler flags.

- [ ] **Step 7: Commit**

```bash
git add src/lib/tournament-db.ts
git commit -m "feat(db): add insertGameEvent, getGameEvents, deleteGameEvents"
```

---

### Task 5: Add `tryAdvanceRound` and update `appendNextRound` / `completeTournament` with tx support

**Files:**
- Modify: `src/lib/tournament-db.ts`

- [ ] **Step 1: Update `appendNextRound` to accept optional transaction**

Add a `tx?` parameter. When provided, use it instead of the global `db`:

```ts
export async function appendNextRound(
  tournamentId: string,
  round: number,
  matchups: Array<{
    matchupIndex: number;
    team1UserId: string;
    team1Name: string;
    team2UserId: string;
    team2Name: string;
  }>,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0]
): Promise<string[]> {
  const executor = tx ?? db;

  // Create game rows
  const rows = await executor
    .insert(tournamentGames)
    .values(
      matchups.map((m) => ({
        tournamentId,
        round,
        matchupIndex: m.matchupIndex,
        team1UserId: m.team1UserId,
        team1Name: m.team1Name,
        team2UserId: m.team2UserId,
        team2Name: m.team2Name,
        status: "pending" as const,
      }))
    )
    .returning({ id: tournamentGames.id });

  const gameIds = rows.map((r) => r.id);

  // Read current bracketData
  const tRows = await executor
    .select({ bracketData: liveTournaments.bracketData })
    .from(liveTournaments)
    .where(eq(liveTournaments.id, tournamentId));

  const bracket = tRows[0]?.bracketData as BracketStructure;

  const newMatchups: BracketMatchup[] = matchups.map((m, i) => ({
    gameId: gameIds[i],
    round,
    matchupIndex: m.matchupIndex,
    team1UserId: m.team1UserId,
    team1Name: m.team1Name,
    team2UserId: m.team2UserId,
    team2Name: m.team2Name,
  }));

  await executor
    .update(liveTournaments)
    .set({
      bracketData: {
        ...bracket,
        matchups: [...bracket.matchups, ...newMatchups],
      },
    })
    .where(eq(liveTournaments.id, tournamentId));

  return gameIds;
}
```

Note: This inlines the logic from the old `appendNextRound` + `createRoundGames` into one function. Remove the now-redundant `createRoundGames` function.

**Important:** `startTournament` currently calls `createRoundGames` directly. After deleting `createRoundGames`, update `startTournament` to use the new `appendNextRound` instead:

```ts
// In startTournament, replace:
//   const gameIds = await createRoundGames(tournamentId, 1, round1Matchups);
// With:
const gameIds = await appendNextRound(tournamentId, 1, round1Matchups);
```

Then remove the `buildBracketData` block that follows — `appendNextRound` now handles writing the bracketData. Update the `db.update(liveTournaments)` call in `startTournament` to only set `status`, `startedAt` (it no longer needs to set `bracketData` since `appendNextRound` does that). Keep the initial `bracketData` write in `startTournament` for the `totalRounds` field by initializing it first:

```ts
// Initialize empty bracket structure before calling appendNextRound
await db
  .update(liveTournaments)
  .set({ status: "active", startedAt: new Date(), bracketData: { totalRounds, matchups: [] } })
  .where(eq(liveTournaments.id, tournamentId));

// Then append round 1 games (this reads + updates bracketData)
await appendNextRound(tournamentId, 1, round1Matchups);
```

- [ ] **Step 2: Update `completeTournament` to accept optional transaction**

```ts
export async function completeTournament(
  tournamentId: string,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0]
): Promise<void> {
  const executor = tx ?? db;
  await executor
    .update(liveTournaments)
    .set({ status: "completed" })
    .where(
      and(
        eq(liveTournaments.id, tournamentId),
        eq(liveTournaments.status, "active")
      )
    );
}
```

- [ ] **Step 3: Add `tryAdvanceRound`**

```ts
export async function tryAdvanceRound(
  tournamentId: string,
  completedRound: number
): Promise<void> {
  await db.transaction(async (tx) => {
    // Advisory lock — prevents concurrent advancement from two games finishing at the same time.
    // The lock key is a 32-bit int derived from the tournament+round string.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${tournamentId + ":" + completedRound}))`
    );

    // Check if all games in this round are completed
    const result = await tx
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(tournamentGames)
      .where(
        and(
          eq(tournamentGames.tournamentId, tournamentId),
          eq(tournamentGames.round, completedRound),
          ne(tournamentGames.status, "completed")
        )
      );

    if (result[0].count > 0) return; // other games still running

    // Fetch tournament to check total rounds
    const tRows = await tx
      .select({ bracketData: liveTournaments.bracketData, totalRounds: sql<number>`(bracket_data->>'totalRounds')::int` })
      .from(liveTournaments)
      .where(eq(liveTournaments.id, tournamentId));

    const totalRounds = tRows[0]?.totalRounds ?? 1;

    // Fetch all completed games in this round to get winners
    const roundGames = await tx
      .select({
        id: tournamentGames.id,
        team1UserId: tournamentGames.team1UserId,
        team1Name: tournamentGames.team1Name,
        team2UserId: tournamentGames.team2UserId,
        team2Name: tournamentGames.team2Name,
        winnerId: tournamentGames.winnerId,
      })
      .from(tournamentGames)
      .where(
        and(
          eq(tournamentGames.tournamentId, tournamentId),
          eq(tournamentGames.round, completedRound)
        )
      );

    const winners = roundGames.map((g) => ({
      userId: g.winnerId!,
      name: g.winnerId === g.team1UserId ? g.team1Name! : g.team2Name!,
    }));

    if (completedRound >= totalRounds) {
      // Final round complete — mark champion and finalist
      if (roundGames.length === 1) {
        const finalGame = roundGames[0];
        const champId = finalGame.winnerId!;
        const finalistId = champId === finalGame.team1UserId
          ? finalGame.team2UserId!
          : finalGame.team1UserId!;
        await tx
          .update(liveTournamentTeams)
          .set({ result: "champion", roundReached: completedRound })
          .where(and(eq(liveTournamentTeams.tournamentId, tournamentId), eq(liveTournamentTeams.userId, champId)));
        await tx
          .update(liveTournamentTeams)
          .set({ result: "finalist", roundReached: completedRound })
          .where(and(eq(liveTournamentTeams.tournamentId, tournamentId), eq(liveTournamentTeams.userId, finalistId)));
      }
      await completeTournament(tournamentId, tx);
    } else {
      // Advance winners to next round
      const nextRound = completedRound + 1;
      for (const w of winners) {
        await tx
          .update(liveTournamentTeams)
          .set({ result: "in_progress", roundReached: nextRound })
          .where(and(eq(liveTournamentTeams.tournamentId, tournamentId), eq(liveTournamentTeams.userId, w.userId)));
      }

      // Pair winners: 0 vs last, 1 vs second-last (seeded bracket style)
      const nextMatchups = [];
      for (let i = 0; i < Math.floor(winners.length / 2); i++) {
        nextMatchups.push({
          matchupIndex: i,
          team1UserId: winners[i].userId,
          team1Name: winners[i].name,
          team2UserId: winners[winners.length - 1 - i].userId,
          team2Name: winners[winners.length - 1 - i].name,
        });
      }
      await appendNextRound(tournamentId, nextRound, nextMatchups, tx);
    }
  });
}
```

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament-db.ts
git commit -m "feat(db): add tryAdvanceRound with advisory lock; update appendNextRound+completeTournament with tx support"
```

---

## Chunk 3: Game Iterator

### Task 6: Extract `createGameIterator` from `tournamentEngine.ts`

**Files:**
- Create: `src/lib/game-iterator.ts`
- Create: `src/lib/game-iterator.test.ts`

The iterator is a pure function: no DB, no async, no side effects. It encapsulates all the mutable state that `generateGameEvents` currently manages in a for-loop.

- [ ] **Step 1: Write a failing test first**

Create `src/lib/game-iterator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createGameIterator } from "./game-iterator";
import type { TournamentTeam } from "../app/utils/tournamentEngine";

// Minimal team fixture — enough to run the iterator
function makeTeam(name: string): TournamentTeam {
  const pokemon = Array.from({ length: 6 }, (_, i) => ({
    id: i + 1,
    name: `Pokemon${i}`,
    sprite: "",
    types: ["normal"],
    stats: { hp: 45, attack: 49, defense: 49, specialAttack: 65, specialDefense: 65, speed: 45 },
    height: 7,
    weight: 69,
    bball: { ppg: 15, rpg: 5, apg: 4, spg: 1, bpg: 1, per: 18, fgp: 0.45, tpp: 0.35, ftp: 0.75 },
  }));
  return { id: name, name, coast: "west", seed: 1, isPlayer: false, roster: pokemon as TournamentTeam["roster"] };
}

describe("createGameIterator", () => {
  it("returns events until null (game ends)", () => {
    const iter = createGameIterator(makeTeam("Home"), makeTeam("Away"));
    const events = [];
    let event;
    while ((event = iter.next()) !== null) {
      events.push(event);
    }
    expect(events.length).toBeGreaterThan(10);
    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).toBe("game_end");
  });

  it("first event is game_start", () => {
    const iter = createGameIterator(makeTeam("Home"), makeTeam("Away"));
    const first = iter.next();
    expect(first?.type).toBe("game_start");
  });

  it("events have monotonically increasing sequence", () => {
    const iter = createGameIterator(makeTeam("Home"), makeTeam("Away"));
    const events = [];
    let event;
    while ((event = iter.next()) !== null) events.push(event);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].sequence).toBeGreaterThan(events[i - 1].sequence);
    }
  });

  it("final scores are not tied", () => {
    const iter = createGameIterator(makeTeam("Home"), makeTeam("Away"));
    let last;
    let event;
    while ((event = iter.next()) !== null) last = event;
    expect(last!.homeScore).not.toBe(last!.awayScore);
  });

  it("events include quarter_start events for Q2, Q3, Q4", () => {
    const iter = createGameIterator(makeTeam("Home"), makeTeam("Away"));
    const events = [];
    let event;
    while ((event = iter.next()) !== null) events.push(event);
    const quarterStarts = events.filter((e) => e.type === "quarter_start");
    expect(quarterStarts.length).toBe(3); // Q2, Q3, Q4
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test src/lib/game-iterator.test.ts
```

Expected: FAIL — "Cannot find module './game-iterator'"

- [ ] **Step 3: Export `calculateTeamFactors` from `tournamentEngine.ts`**

In `src/app/utils/tournamentEngine.ts`, find the `calculateTeamFactors` function (around line 273) and add `export`:

```ts
export function calculateTeamFactors(  // was: function calculateTeamFactors(
```

This allows `game-iterator.ts` to import it rather than duplicating the logic.

- [ ] **Step 4: Create `src/lib/game-iterator.ts`**

This is a port of `generateGameEvents` from `src/app/utils/tournamentEngine.ts` into an iterator. Copy all the helper logic (team factors, event generation) but restructure the for-loop as a `next()` method with state in closure.

Note: `displayAtMs` still exists on the `GameEvent` type until the frontend migration in Chunk 7. The `IteratorEvent` type uses `Omit<GameEvent, "displayAtMs">` which is valid as long as `displayAtMs` remains in the base type.

```ts
import { TournamentTeam, GameEvent, GameEventType } from "../app/utils/tournamentEngine";
import { calcTypeAdvantage } from "../app/utils/typeChart";
import { computeAbilityModifier } from "../app/utils/abilityModifier";
import abilitiesData from "../../public/abilities.json";

// ─── Re-exported constants (same values as tournamentEngine.ts) ───────────────

export const QUARTER_DURATION = 720;
export const GAME_DURATION = 2880;
const TARGET_EVENTS = 150;

// ─── Helpers (copied from tournamentEngine.ts) ────────────────────────────────

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function gameSecToQuarter(sec: number): 1 | 2 | 3 | 4 {
  if (sec < QUARTER_DURATION) return 1;
  if (sec < QUARTER_DURATION * 2) return 2;
  if (sec < QUARTER_DURATION * 3) return 3;
  return 4;
}

function gameSecToClock(sec: number): string {
  const qIdx = Math.min(3, Math.floor(sec / QUARTER_DURATION));
  const secInQ = sec - qIdx * QUARTER_DURATION;
  const remaining = Math.max(0, QUARTER_DURATION - secInQ);
  const mins = Math.floor(remaining / 60);
  const secs = Math.floor(remaining % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

// ─── Sleep duration per event type (ms) ───────────────────────────────────────

export function getSleepMs(type: GameEventType, isBurst: boolean): number {
  if (isBurst) return rand(1200, 2200);
  if (type === "quarter_start" || type === "quarter_end" || type === "halftime") return rand(3000, 5000);
  if (["score_2pt", "score_3pt", "dunk", "layup", "clutch"].includes(type)) return rand(1500, 2500);
  if (["block", "steal", "rebound"].includes(type)) return rand(1200, 2000);
  return rand(2000, 4000);
}

// ─── Iterator ─────────────────────────────────────────────────────────────────

type Phase = "playing" | "tiebreak_check" | "game_end" | "done";

export interface IteratorEvent extends Omit<GameEvent, "displayAtMs"> {
  sequence: number;
  sleepMs: number;
}

export function createGameIterator(
  homeTeam: TournamentTeam,
  awayTeam: TournamentTeam,
): { next(): IteratorEvent | null } {
  // Mutable state
  let homeScore = 0;
  let awayScore = 0;
  let homeMomentum = 0;
  let awayMomentum = 0;
  let sequence = 0;
  let phase: Phase = "playing";
  let halftimeDone = false;
  const quarterStartsDone = new Set<number>();
  let burstRemaining = 0;
  let consecutiveScoringEvents = 0;

  // Per-player stats (for injury tracking)
  const statsMap = new Map<string, { fouls: number; injured: boolean; points: number; rebounds: number; assists: number; steals: number; blocks: number }>();
  for (const p of homeTeam.roster) {
    statsMap.set(`home-${p.name}`, { fouls: 0, injured: false, points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0 });
  }
  for (const p of awayTeam.roster) {
    statsMap.set(`away-${p.name}`, { fouls: 0, injured: false, points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0 });
  }

  // Game time cursor
  const spacing = GAME_DURATION / TARGET_EVENTS;
  let sec = 0; // current game time position

  // Queue for structural events (quarter_start, halftime) that precede the main event at a given sec
  const structuralQueue: IteratorEvent[] = [];

  // Peek queue for post-loop events
  const postQueue: IteratorEvent[] = [];

  function makeEvent(
    type: GameEventType,
    team: "home" | "away",
    pokemonName: string,
    description: string,
    gameSec: number,
    opts: Partial<IteratorEvent> = {},
    isBurst = false,
  ): IteratorEvent {
    const quarter = gameSecToQuarter(gameSec);
    const clock = gameSecToClock(gameSec);
    const sleepMs = getSleepMs(type, isBurst);
    return {
      gameTimeSec: gameSec,
      quarter,
      clock,
      type,
      team,
      pokemonName,
      description,
      homeScore,
      awayScore,
      sequence: sequence++,
      sleepMs,
      ...opts,
    };
  }

  return {
    next(): IteratorEvent | null {
      // Drain structural queue first
      if (structuralQueue.length > 0) return structuralQueue.shift()!;
      // Drain post-loop queue
      if (postQueue.length > 0) return postQueue.shift()!;

      // game_start
      if (phase === "playing" && sequence === 0) {
        return makeEvent("game_start", "home", "Tip-off",
          `${homeTeam.name} vs ${awayTeam.name} — Tip-off!`, 0);
      }

      if (phase === "tiebreak_check") {
        if (homeScore === awayScore) {
          const clutchSide: "home" | "away" = Math.random() < 0.5 ? "home" : "away";
          const clutchTeam = clutchSide === "home" ? homeTeam : awayTeam;
          const clutchPlayer = pick(clutchTeam.roster);
          const pts = Math.random() < 0.5 ? 2 : 3;
          if (clutchSide === "home") homeScore += pts; else awayScore += pts;
          const ev = makeEvent("clutch", clutchSide, clutchPlayer.name,
            `BUZZER BEATER! ${clutchPlayer.name} wins it at the horn!`,
            GAME_DURATION - 5,
            { pointsScored: pts, pokemonSprite: clutchPlayer.sprite });
          postQueue.push(makeEvent("game_end", homeScore > awayScore ? "home" : "away", "Final",
            `Game Over! ${homeScore > awayScore ? homeTeam.name : awayTeam.name} wins ${Math.max(homeScore, awayScore)}-${Math.min(homeScore, awayScore)}!`,
            GAME_DURATION));
          phase = "game_end";
          return ev;
        }
        phase = "game_end";
        return makeEvent("game_end", homeScore > awayScore ? "home" : "away", "Final",
          `Game Over! ${homeScore > awayScore ? homeTeam.name : awayTeam.name} wins ${Math.max(homeScore, awayScore)}-${Math.min(homeScore, awayScore)}!`,
          GAME_DURATION);
      }

      if (phase === "game_end" || phase === "done") return null;

      // Advance game time cursor
      sec += rand(spacing * 0.5, spacing * 1.5);
      if (sec >= GAME_DURATION) {
        phase = "tiebreak_check";
        return this.next();
      }

      const gameSec = Math.round(sec);
      const quarter = gameSecToQuarter(gameSec);

      // Inject structural events into queue
      if (quarter > 1 && !quarterStartsDone.has(quarter)) {
        quarterStartsDone.add(quarter);
        structuralQueue.push(makeEvent("quarter_start", "home", `Q${quarter}`,
          `Quarter ${quarter} begins!`, (quarter - 1) * QUARTER_DURATION));
      }
      if (quarter >= 3 && !halftimeDone) {
        halftimeDone = true;
        structuralQueue.push(makeEvent("halftime", "home", "Halftime",
          `Halftime! ${homeTeam.name} ${homeScore} - ${awayScore} ${awayTeam.name}`,
          QUARTER_DURATION * 2));
      }
      if (structuralQueue.length > 0) {
        // Re-queue current sec to process after structural events
        sec -= rand(spacing * 0.5, spacing * 1.5); // undo advance so we retry this sec
        return structuralQueue.shift()!;
      }

      // Determine which team acts
      // (team factors logic — identical to tournamentEngine.ts calculateTeamFactors)
      const hFactors = calculateTeamFactors(homeTeam, awayTeam, { home: homeScore, away: awayScore }, gameSec, "home");
      const aFactors = calculateTeamFactors(awayTeam, homeTeam, { home: homeScore, away: awayScore }, gameSec, "away");
      const hPower = hFactors.finalRating + homeMomentum;
      const aPower = aFactors.finalRating + awayMomentum;
      const side: "home" | "away" = Math.random() < hPower / (hPower + aPower) ? "home" : "away";
      const activeTeam = side === "home" ? homeTeam : awayTeam;
      const statsPrefix = side;

      const activeRoster = activeTeam.roster.filter(
        (p) => !statsMap.get(`${statsPrefix}-${p.name}`)?.injured
      );
      if (activeRoster.length === 0) return this.next(); // all injured, skip

      const player = pick(activeRoster);
      const pKey = `${statsPrefix}-${player.name}`;
      const pStats = statsMap.get(pKey)!;

      // Generate event (identical branching logic as generateGameEvents in tournamentEngine.ts)
      const isBurst = burstRemaining > 0;
      if (isBurst) burstRemaining--;

      const { type, description, points, statType } = generateEventForPlayer(
        player, activeTeam, side === "home" ? awayTeam : homeTeam,
        side, gameSec, homeScore, awayScore, pStats, isBurst
      );

      // Update scores and momentum
      if (points > 0) {
        if (side === "home") { homeScore += points; homeMomentum += points === 3 ? 2 : 1; }
        else { awayScore += points; awayMomentum += points === 3 ? 2 : 1; }
        pStats.points += points;
      }
      updateMomentum(type, side, { homeMomentum, awayMomentum }, (hm, am) => {
        homeMomentum = hm; awayMomentum = am;
      });

      // Burst logic
      if (type === "steal") { burstRemaining = 2; consecutiveScoringEvents = 0; }
      else if (type === "block") { burstRemaining = Math.floor(rand(2, 4)); consecutiveScoringEvents = 0; }
      else if (["score_2pt", "score_3pt", "dunk", "layup", "clutch"].includes(type)) {
        consecutiveScoringEvents++;
        if (consecutiveScoringEvents >= 3) { burstRemaining = 2; consecutiveScoringEvents = 0; }
      } else { consecutiveScoringEvents = 0; }

      homeMomentum *= 0.97;
      awayMomentum *= 0.97;

      return makeEvent(type, side, player.name, description, gameSec, {
        pointsScored: points || undefined,
        statType,
        pokemonSprite: player.sprite,
      }, isBurst);
    }
  };
}
```

**Note:** `calculateTeamFactors`, `generateEventForPlayer`, and `updateMomentum` are helper functions to extract from `tournamentEngine.ts`. They contain the large branching logic for event type selection. Extract them as module-level functions in `game-iterator.ts` — copy the logic verbatim from `tournamentEngine.ts`'s `generateGameEvents` body. Do not rewrite the logic; just restructure its location.

The key helpers to extract:
- `calculateTeamFactors` — already exists in `tournamentEngine.ts` as a module-level function; **import it** from there rather than duplicating
- Event type selection + descriptions — extract to `generateEventForPlayer(player, activeTeam, opponent, side, gameSec, homeScore, awayScore, pStats, isBurst)` returning `{ type, description, points, statType }`
- Momentum update — small helper inline or extracted

- [ ] **Step 5: Run tests — verify they pass**

```bash
npm test src/lib/game-iterator.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/utils/tournamentEngine.ts src/lib/game-iterator.ts src/lib/game-iterator.test.ts
git commit -m "feat: add createGameIterator with phase state machine and unit tests; export calculateTeamFactors"
```

---

## Chunk 4: simulateGameLive

### Task 7: Write `simulateGameLive`

**Files:**
- Create: `src/lib/simulate-game-live.ts`

- [ ] **Step 1: Create the file**

```ts
import { db } from "./db";
import { tournamentGames } from "./schema";
import { eq } from "drizzle-orm";
import {
  insertGameEvent,
  writeGameResult,
  deleteGameEvents,
  getTeamRosterData,
  tryAdvanceRound,
  updateTeamResult,
} from "./tournament-db";
import { toTournamentPokemon, TournamentTeam } from "../app/utils/tournamentEngine";
import { createGameIterator, getSleepMs } from "./game-iterator";

const DEADLINE_MS = 280_000; // flush remaining events without sleep if approaching limit

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeTeam(userId: string, name: string, rosterData: unknown): TournamentTeam {
  return {
    id: userId,
    name,
    coast: "west",
    seed: 1,
    isPlayer: true,
    roster: (rosterData as Parameters<typeof toTournamentPokemon>[0][]).map(toTournamentPokemon),
  };
}

export async function simulateGameLive(gameId: string): Promise<void> {
  // Load game to get tournament context
  const gameRows = await db
    .select()
    .from(tournamentGames)
    .where(eq(tournamentGames.id, gameId));

  const game = gameRows[0];
  if (!game || game.status !== "in_progress") return;

  const tournamentId = game.tournamentId;
  const round = game.round;

  // Load rosters
  const [team1Data, team2Data] = await Promise.all([
    getTeamRosterData(tournamentId, game.team1UserId!),
    getTeamRosterData(tournamentId, game.team2UserId!),
  ]);

  if (!team1Data || !team2Data) {
    console.error(`[simulateGameLive] Missing roster data for game ${gameId}`);
    return;
  }

  // Clear any partial events from a previous crashed attempt
  await deleteGameEvents(gameId);

  // Mark started_at
  await db
    .update(tournamentGames)
    .set({ startedAt: new Date() })
    .where(eq(tournamentGames.id, gameId));

  const homeTeam = makeTeam(game.team1UserId!, team1Data.team_name, team1Data.roster_data);
  const awayTeam = makeTeam(game.team2UserId!, team2Data.team_name, team2Data.roster_data);

  const iterator = createGameIterator(homeTeam, awayTeam);
  const startMs = Date.now();

  let event;
  while ((event = iterator.next()) !== null) {
    // Write event to DB
    await insertGameEvent(gameId, event.sequence, event.type, event as Record<string, unknown>);

    // Sleep (skip if we're approaching the Vercel deadline)
    const elapsed = Date.now() - startMs;
    if (elapsed < DEADLINE_MS && event.type !== "game_end") {
      await sleep(event.sleepMs);
    }
  }

  // After the loop — find the game_end event to get final scores
  const allEvents = await getGameEvents(gameId);
  const gameEndEvt = allEvents.findLast((e) => e.type === "game_end");
  const scores = gameEndEvt?.data as { homeScore: number; awayScore: number } | undefined;

  if (!scores) {
    console.error(`[simulateGameLive] No game_end event found for game ${gameId}`);
    return;
  }

  const team1Score = scores.homeScore;
  const team2Score = scores.awayScore;
  const winnerId = team1Score > team2Score ? game.team1UserId! : game.team2UserId!;
  const loserId = winnerId === game.team1UserId ? game.team2UserId! : game.team1UserId!;

  // game_end is already in DB — safe to set status=completed now
  await writeGameResult(gameId, team1Score, team2Score, winnerId);
  await updateTeamResult(tournamentId, loserId, "eliminated", round);
  await tryAdvanceRound(tournamentId, round);
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/simulate-game-live.ts
git commit -m "feat: add simulateGameLive background simulation function"
```

---

## Chunk 5: Cron Job + Vercel Config

### Task 8: Create `vercel.json`

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Create `vercel.json` at the project root**

```json
{
  "crons": [
    { "path": "/api/cron/tick", "schedule": "*/1 * * * *" }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore: add vercel.json with cron schedule for tournament tick"
```

---

### Task 9: Create the cron route

**Files:**
- Create: `src/app/api/cron/tick/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { db } from "@/lib/db";
import { liveTournaments, tournamentGames } from "@/lib/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import { claimGame } from "@/lib/tournament-db";
import { simulateGameLive } from "@/lib/simulate-game-live";

export const maxDuration = 800;

// How long each round lasts (seconds)
const ROUND_DURATION_S = 300;

const ROUND_BUFFER_S = 15;

export async function GET(req: NextRequest) {
  // Verify Vercel Cron authorization header in production
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Reset stale in_progress games (claimed > 800s ago — function must have crashed)
  await db
    .update(tournamentGames)
    .set({ status: "pending", claimedAt: null })
    .where(
      and(
        eq(tournamentGames.status, "in_progress"),
        lt(tournamentGames.claimedAt, new Date(Date.now() - 800_000))
      )
    );

  // 2. Find all active tournaments
  const activeTournaments = await db
    .select({ id: liveTournaments.id, startedAt: liveTournaments.startedAt })
    .from(liveTournaments)
    .where(eq(liveTournaments.status, "active"));

  for (const tournament of activeTournaments) {
    if (!tournament.startedAt) continue;
    const startedAtMs = tournament.startedAt.getTime();
    const now = Date.now();

    // Find all pending games for this tournament
    const pendingGames = await db
      .select({
        id: tournamentGames.id,
        round: tournamentGames.round,
      })
      .from(tournamentGames)
      .where(
        and(
          eq(tournamentGames.tournamentId, tournament.id),
          eq(tournamentGames.status, "pending")
        )
      );

    for (const game of pendingGames) {
      // Check if this round's window has opened
      const roundStartMs = startedAtMs + (game.round - 1) * (ROUND_DURATION_S + ROUND_BUFFER_S) * 1000;
      if (now < roundStartMs) continue; // round hasn't started yet

      // Atomically claim and dispatch
      const claimed = await claimGame(game.id);
      if (!claimed) continue; // already claimed by concurrent request

      // Fire-and-forget background simulation
      waitUntil(simulateGameLive(game.id));
    }
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Smoke test the cron locally**

Start the dev server and hit the endpoint manually:

```bash
npm run dev
# In another terminal:
curl http://localhost:3000/api/cron/tick
```

Expected: `{"ok":true}` — no crashes.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/tick/route.ts
git commit -m "feat: add /api/cron/tick route for real-time tournament simulation"
```

---

## Chunk 6: SSE Endpoint + Updated Games Route

### Task 10: Create the SSE stream endpoint

**Files:**
- Create: `src/app/api/live-tournaments/[id]/games/[gameId]/stream/route.ts`

- [ ] **Step 1: Create the SSE route**

```ts
import { NextRequest } from "next/server";
import { dbHttp } from "@/lib/db-http";
import { tournamentGames, tournamentGameEvents } from "@/lib/schema";
import { eq, and, gt, asc } from "drizzle-orm";

export const maxDuration = 800;

const POLL_INTERVAL_MS = 500;

function sseMessage(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; gameId: string }> }
) {
  const { gameId } = await params;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseMessage(event, data)));
      };

      // 1. Load current game state
      const gameRows = await dbHttp
        .select({
          status: tournamentGames.status,
          team1Score: tournamentGames.team1Score,
          team2Score: tournamentGames.team2Score,
          team1Name: tournamentGames.team1Name,
          team2Name: tournamentGames.team2Name,
          winnerId: tournamentGames.winnerId,
          round: tournamentGames.round,
        })
        .from(tournamentGames)
        .where(eq(tournamentGames.id, gameId));

      const game = gameRows[0];
      if (!game) {
        controller.close();
        return;
      }

      // 2. Send initial game_state
      send("game_state", {
        status: game.status,
        team1Score: game.team1Score ?? 0,
        team2Score: game.team2Score ?? 0,
        team1Name: game.team1Name,
        team2Name: game.team2Name,
        round: game.round,
      });

      // 3. Burst all existing events
      const existingEvents = await dbHttp
        .select()
        .from(tournamentGameEvents)
        .where(eq(tournamentGameEvents.gameId, gameId))
        .orderBy(asc(tournamentGameEvents.sequence));

      for (const ev of existingEvents) {
        // Inject row-level sequence into payload so frontend can deduplicate on reconnect
        send("game_event", { ...(ev.data as object), sequence: ev.sequence });
      }

      let lastSequence = existingEvents.length > 0
        ? existingEvents[existingEvents.length - 1].sequence
        : -1;

      // If game already completed and game_end was in the burst, close
      const hasGameEnd = existingEvents.some((e) => e.type === "game_end");
      if (hasGameEnd) {
        send("game_end", {
          team1Score: game.team1Score,
          team2Score: game.team2Score,
          winnerId: game.winnerId,
        });
        controller.close();
        return;
      }

      // 4. Poll for new events
      while (!req.signal.aborted) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (req.signal.aborted) break;

        const newEvents = await dbHttp
          .select()
          .from(tournamentGameEvents)
          .where(
            and(
              eq(tournamentGameEvents.gameId, gameId),
              gt(tournamentGameEvents.sequence, lastSequence)
            )
          )
          .orderBy(asc(tournamentGameEvents.sequence));

        for (const ev of newEvents) {
          send("game_event", { ...(ev.data as object), sequence: ev.sequence });
          lastSequence = ev.sequence;

          if (ev.type === "game_end") {
            // Fetch final scores from game row
            const finalRows = await dbHttp
              .select({ team1Score: tournamentGames.team1Score, team2Score: tournamentGames.team2Score, winnerId: tournamentGames.winnerId })
              .from(tournamentGames)
              .where(eq(tournamentGames.id, gameId));
            send("game_end", finalRows[0] ?? {});
            controller.close();
            return;
          }
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering if behind proxy
    },
  });
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/live-tournaments/[id]/games/[gameId]/stream/route.ts
git commit -m "feat: add SSE stream endpoint for live game events"
```

---

### Task 11: Update `GET /api/live-tournaments/[id]/games/[gameId]`

**Files:**
- Modify: `src/app/api/live-tournaments/[id]/games/[gameId]/route.ts`

The GET handler currently returns `game.events` from the jsonb column (now deleted). Update it to query `tournament_game_events`.

- [ ] **Step 1: Update the GET handler**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getGame, getGameEvents } from "@/lib/tournament-db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; gameId: string }> }
) {
  const { gameId } = await params;
  const game = await getGame(gameId);
  if (!game) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const eventRows = await getGameEvents(gameId);
  const events = eventRows.map((r) => r.data);

  return NextResponse.json({
    status: game.status,
    team1Score: game.team1Score,
    team2Score: game.team2Score,
    winnerId: game.winnerId,
    events,
  });
}
```

Remove the entire `POST` handler from this file — it contained the old per-game simulation logic which is now replaced by `simulateGameLive`. Delete everything below the GET handler.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/live-tournaments/[id]/games/[gameId]/route.ts
git commit -m "feat: update games/[gameId] GET to query tournament_game_events; remove POST handler"
```

---

## Chunk 7: Frontend Changes

### Task 12: Replace polling + `displayAtMs` with `EventSource` in `GameDetailView`

**Files:**
- Modify: `src/app/tournaments/[id]/page.tsx`

- [ ] **Step 1: Remove dead constants and functions**

At the top of the file (around line 289), remove:
- `ROUND_DURATION_MS`
- `ROUND_BUFFER_MS`
- `TOTAL_GAME_SEC`
- `QUARTER_SEC`
- `computeLiveClock` function

- [ ] **Step 2: Rewrite `GameDetailView`**

The component currently takes `game: ViewingGame` which includes `startedAt` and `events` (pre-loaded). The new flow:
1. On mount, open `EventSource` to `/api/live-tournaments/${game.tournamentId}/games/${game.gameId}/stream`
2. On `game_state` event: set initial scores and status
3. On `game_event` event: append to `allEvents`
4. On `game_end` event: set `isDone = true`, close `EventSource`

```tsx
function GameDetailView({ game, onBack }: { game: ViewingGame; onBack: () => void }) {
  const [allEvents, setAllEvents] = useState<GameEvent[]>(game.events ?? []);
  const [liveScore, setLiveScore] = useState({ home: game.team1Score, away: game.team2Score });
  const [isDone, setIsDone] = useState(
    game.winnerId !== null || (game.events?.some((e) => e.type === "game_end") ?? false)
  );
  const [currentClock, setCurrentClock] = useState({ quarter: 1, clock: "12:00" });

  useEffect(() => {
    if (isDone) return; // already completed, no need to stream

    const es = new EventSource(
      `/api/live-tournaments/${game.tournamentId}/games/${game.gameId}/stream`
    );

    es.addEventListener("game_state", (e) => {
      const d = JSON.parse(e.data);
      setLiveScore({ home: d.team1Score ?? 0, away: d.team2Score ?? 0 });
      if (d.status === "completed") setIsDone(true);
    });

    es.addEventListener("game_event", (e) => {
      const ev = JSON.parse(e.data) as GameEvent;
      setAllEvents((prev) => {
        // Deduplicate by sequence (for burst on reconnect)
        if (prev.some((p) => p.sequence === ev.sequence)) return prev;
        return [...prev, ev];
      });
      setLiveScore({ home: ev.homeScore, away: ev.awayScore });
      setCurrentClock({ quarter: ev.quarter, clock: ev.clock });
    });

    es.addEventListener("game_end", (e) => {
      const d = JSON.parse(e.data);
      if (d.team1Score != null) setLiveScore({ home: d.team1Score, away: d.team2Score });
      setIsDone(true);
      es.close();
    });

    es.onerror = () => es.close();

    return () => es.close();
  }, [game.gameId, game.tournamentId, isDone]);

  const team1Wins = liveScore.home > liveScore.away;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <PokeButton variant="ghost" size="sm" onClick={onBack} className="flex items-center gap-1">
          ← BACK TO BRACKET
        </PokeButton>
        {!isDone && (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            <span className="font-pixel text-[5px]" style={{ color: "var(--color-danger)" }}>
              LIVE
            </span>
          </div>
        )}
      </div>

      {/* Scoreboard */}
      <PokeCard variant="highlighted" className="overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5">
          <div className="flex-1">
            <div className="font-pixel text-[8px]" style={{ color: "var(--color-text)" }}>{game.team1Name}</div>
          </div>
          <div className="text-center px-8">
            <div className="flex items-center gap-4">
              <span
                className="font-pixel text-[24px] tabular-nums"
                style={{ color: liveScore.home >= liveScore.away ? "var(--color-primary)" : "var(--color-text-muted)" }}
              >
                {liveScore.home}
              </span>
              <span className="font-pixel text-[16px]" style={{ color: "var(--color-border)" }}>-</span>
              <span
                className="font-pixel text-[24px] tabular-nums"
                style={{ color: liveScore.away > liveScore.home ? "var(--color-primary)" : "var(--color-text-muted)" }}
              >
                {liveScore.away}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-center gap-1.5">
              {!isDone && <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />}
              <span
                className="font-pixel text-[6px] px-2 py-0.5"
                style={{ backgroundColor: isDone ? "var(--color-danger)" : "var(--color-primary)", color: "#fff" }}
              >
                {isDone ? "FINAL" : `Q${currentClock.quarter} ${currentClock.clock}`}
              </span>
            </div>
          </div>
          <div className="flex-1 text-right">
            <div className="font-pixel text-[8px]" style={{ color: "var(--color-text)" }}>{game.team2Name}</div>
          </div>
        </div>
        {isDone && (
          <div
            className="px-6 py-2 text-center font-pixel text-[6px]"
            style={{ backgroundColor: "var(--color-surface)", color: "var(--color-primary)" }}
          >
            {team1Wins ? game.team1Name : game.team2Name} WINS!
          </div>
        )}
      </PokeCard>

      {/* Event Feed + Box Score */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <EventFeed events={allEvents} />
        </div>
        <div className="lg:col-span-2">
          <BoxScore events={allEvents} allEvents={allEvents} team1Name={game.team1Name} team2Name={game.team2Name} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update `ViewingGame` interface and `handleViewGameData`**

Remove `startedAt` and `round` from the `ViewingGame` interface:

```ts
interface ViewingGame {
  gameId: string;
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
  winnerId: string | null;
  events: GameEvent[];
  tournamentId: string;
}
```

Replace `handleViewGameData` — remove the `startedAtOverride` parameter and the dead `startedAt` guard:

```ts
const handleViewGameData = async (matchup: MatchupState, tournamentId: string) => {
  try {
    const res = await fetch(`/api/live-tournaments/${tournamentId}/games/${matchup.gameId}`);
    const data = await res.json();
    if (data.error) { setError(data.error); return; }
    setViewingGame({
      gameId: matchup.gameId,
      team1Name: matchup.team1Name,
      team2Name: matchup.team2Name,
      team1Score: data.team1Score ?? matchup.team1Score ?? 0,
      team2Score: data.team2Score ?? matchup.team2Score ?? 0,
      winnerId: data.winnerId ?? matchup.winnerId,
      events: (data.events as GameEvent[]) ?? [],
      tournamentId,
    });
  } catch {
    setError("Failed to load game");
  }
};
```

Also update `handleJoin` (around line 751) — it calls `handleViewGameData(firstGame, id, tData.startedAt ?? undefined)` with a third argument that no longer exists. Remove the third argument:

```ts
await handleViewGameData(firstGame, id);
```

And update `handleViewGame` similarly — it calls `handleViewGameData(matchup, id)` which already has the right signature.

Update any remaining calls to `handleViewGameData` in `handleJoin` to match the new 2-argument signature.

- [ ] **Step 4: Add `sequence` to the client-side `GameEvent` interface**

The events coming from SSE now include a `sequence` field (used for deduplication). Add it to the interface at the top of `page.tsx`:

```ts
interface GameEvent {
  // ... existing fields ...
  sequence?: number;  // present on SSE events, may be absent on legacy loaded events
}
```

- [ ] **Step 5: TypeScript check + lint**

```bash
npx tsc --noEmit && npm run lint
```

Fix any errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/tournaments/[id]/page.tsx
git commit -m "feat(ui): replace displayAtMs polling with EventSource SSE in GameDetailView"
```

---

## Chunk 8: Cleanup

### Task 13: Remove `simulateAllRounds` from the tournament join handler

**Files:**
- Modify: `src/app/api/live-tournaments/route.ts`

- [ ] **Step 1: Remove `simulateAllRounds` function and its call**

Delete the entire `simulateAllRounds` async function (lines 50–122 in the current file).

In the `POST` handler, replace the block that calls `simulateAllRounds`:

```ts
// Before (remove this):
await startTournament(tournamentId, round1Matchups, totalRounds);
await simulateAllRounds(tournamentId, totalRounds);
return NextResponse.json({ tournamentId, status: "active" });

// After:
await startTournament(tournamentId, round1Matchups, totalRounds);
return NextResponse.json({ tournamentId, status: "active" });
```

Remove all now-unused imports from `live-tournaments/route.ts`. After deleting `simulateAllRounds`, these are all unused:
- From `tournament-db`: `claimGame`, `writeGameResult`, `updateTeamResult`, `appendNextRound`, `completeTournament`, `getTeamRosterData`, `getTournamentGames`
- From `tournamentEngine`: `toTournamentPokemon`, `simulateMatchup`, `TournamentTeam`

The only imports that remain needed are: `findOpenTournament`, `createTournament`, `joinTournament`, `getTournamentTeamCount`, `getTournamentTeams`, `getTournament`, `startTournament`, `getUserActiveTournament`, `getAllTournaments`.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/live-tournaments/route.ts
git commit -m "feat: remove simulateAllRounds — simulation now driven by cron + simulateGameLive"
```

---

### Task 14: Remove `generateGameEvents` from `tournamentEngine.ts`

**Files:**
- Modify: `src/app/utils/tournamentEngine.ts`

- [ ] **Step 1: Remove `generateGameEvents` and `simulateLiveGame` from `tournamentEngine.ts`**

`generateGameEvents` is superseded by `createGameIterator`. Remove it and `simulateLiveGame` (legacy wrapper that calls it).

**Do NOT remove `simulateMatchup`** — it is still called by `simulateConferenceRounds` (line ~896) and `simulateBracketForSize` (lines ~942, ~953), which are used by the single-player tournament flow.

Keep: all types, `generateAITeam`, `generateTournamentBracket`, `calculateTeamFactors` (now exported), `toTournamentPokemon`, `advanceBracket`, `isMatchupPlayable`, `isTournamentComplete`, `simulateMatchup`, `simulateBracketForSize`, `simulateConferenceRounds`.

Also remove `LIVE_GAME_REAL_SECONDS` and `LIVE_ROUND_BUFFER` constants (no longer used).

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Fix any remaining references to the deleted functions.

- [ ] **Step 3: Final lint**

```bash
npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/app/utils/tournamentEngine.ts
git commit -m "refactor: remove generateGameEvents and simulateMatchup from tournamentEngine (superseded by createGameIterator)"
```

---

### Task 15: End-to-end smoke test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Create and join a 2-player tournament**

Open two browser windows logged in as two different users. Both join the same tournament. When the last player joins, the tournament should start with `status: "active"` and games should appear as `pending`.

- [ ] **Step 3: Trigger the cron manually**

```bash
curl http://localhost:3000/api/cron/tick
```

This should claim pending games and start `simulateGameLive` in the background.

- [ ] **Step 4: Open a game stream**

Navigate to the tournament page and open a game. Verify:
- Events appear one at a time over ~5 minutes
- Scoreboard updates with each scoring event
- LIVE indicator is shown
- After ~5 minutes, FINAL state appears
- Tournaments list page shows the tournament as ACTIVE (not immediately DONE)

- [ ] **Step 5: Final build check**

```bash
npm run build
```

Expected: successful build with no TypeScript or lint errors.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: live tournament SSE implementation complete"
```
