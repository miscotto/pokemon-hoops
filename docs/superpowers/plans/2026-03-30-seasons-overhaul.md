# Seasons Overhaul Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the seasons feature to support a full-season experience: fix a stats bug, add a schedule page so users can find and watch games live, and replace single-game playoff rounds with NBA-style best-of-7 series.

**Architecture:** A new `seasonPlayoffSeries` table tracks each playoff series; games are linked to their series via a `seriesId` FK; the schedule page is a new Next.js route with a client-side filter component reusing the existing games API (extended with `status`/`userId`/`limit`/`offset` params); the bracket on the season detail page is replaced by a new `PlayoffBracket` component reading series rows.

**Tech Stack:** Next.js 16 (App Router), Drizzle ORM + PostgreSQL (Neon), Vitest, Tailwind CSS 4, TypeScript.

**Spec:** `docs/superpowers/specs/2026-03-30-seasons-overhaul-design.md`

**Chunk execution order is mandatory:** Chunk 2 (schema) must be committed and migrated before Chunk 3 (DB logic) can compile. Do not skip ahead.

---

## Chunk 1: Stats Bug Fix

### File Map
- Modify: `src/lib/season-stats.ts`
- Create: `src/lib/season-stats.test.ts`

---

### Task 1: Fix stats aggregator — filter period events before checking pokemonName

**Context:** `getTeamSeasonStats` in `src/lib/season-stats.ts` processes every game event to aggregate per-player stats. Events like `quarter_start`, `quarter_end`, `halftime`, `game_start`, `game_end` carry strings like "Q2" or "Halftime" in their `pokemonName` field. These pass the current `name` guard and appear as fake player rows in the stats table.

The fix: export a pure `shouldSkipGameEvent(type, name)` helper so it can be tested independently, then use it in the event loop.

**Files:**
- Modify: `src/lib/season-stats.ts`
- Create: `src/lib/season-stats.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/season-stats.test.ts`. The test imports the helper that doesn't exist yet — it will fail with "not exported":

```typescript
import { describe, it, expect } from "vitest";
import { shouldSkipGameEvent } from "./season-stats";

describe("shouldSkipGameEvent", () => {
  it("skips quarter_start events regardless of pokemonName", () => {
    expect(shouldSkipGameEvent("quarter_start", "Q2")).toBe(true);
  });
  it("skips quarter_end events", () => {
    expect(shouldSkipGameEvent("quarter_end", "Q4")).toBe(true);
  });
  it("skips halftime events", () => {
    expect(shouldSkipGameEvent("halftime", "Halftime")).toBe(true);
  });
  it("skips game_start events", () => {
    expect(shouldSkipGameEvent("game_start", "Tip-off")).toBe(true);
  });
  it("skips game_end events", () => {
    expect(shouldSkipGameEvent("game_end", "Final")).toBe(true);
  });
  it("does NOT skip scoring events with a real Pokemon name", () => {
    expect(shouldSkipGameEvent("score_2pt", "Pikachu")).toBe(false);
  });
  it("does NOT skip rebound events", () => {
    expect(shouldSkipGameEvent("rebound", "Snorlax")).toBe(false);
  });
  it("skips events with empty pokemonName (existing guard)", () => {
    expect(shouldSkipGameEvent("assist", "")).toBe(true);
  });
  it("skips events where pokemonName is Tip-off (existing guard)", () => {
    expect(shouldSkipGameEvent("score_2pt", "Tip-off")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/lib/season-stats.test.ts
```

Expected: FAIL — `shouldSkipGameEvent` is not exported from `./season-stats`.

- [ ] **Step 3: Add `shouldSkipGameEvent` to `src/lib/season-stats.ts` and wire it into the event loop**

At module level in `src/lib/season-stats.ts`, directly after the existing `SCORING_TYPES` constant (line ~53), add:

```typescript
// Period-marker events carry non-Pokemon strings in pokemonName (e.g. "Q2", "Halftime").
// Must be skipped before the pokemonName check.
const PERIOD_EVENT_TYPES = new Set([
  "game_start", "game_end", "quarter_start", "quarter_end", "halftime",
]);

export function shouldSkipGameEvent(type: string, name: string | undefined | null): boolean {
  if (PERIOD_EVENT_TYPES.has(type)) return true;
  if (!name || name === "Tip-off" || name === "Final") return true;
  return false;
}
```

Then inside the event loop (line ~138), replace:

```typescript
// BEFORE:
const name = data.pokemonName;
if (!name || name === "Tip-off" || name === "Final") continue;
```

With:

```typescript
// AFTER:
if (shouldSkipGameEvent(ev.type, data.pokemonName)) continue;
const name = data.pokemonName!;
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/lib/season-stats.test.ts
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/season-stats.ts src/lib/season-stats.test.ts
git commit -m "fix: filter period-marker events from season stats player aggregation"
```

---

## Chunk 2: DB Schema + Migration

### File Map
- Modify: `src/lib/schema.ts`
- Generate: `drizzle/000X_seasons_playoff_series.sql` (via `npm run db:generate`)

---

### Task 2: Add seasonPlayoffSeries table and new seasonGames columns to schema

**Context:** Drizzle ORM schema is the source of truth. The new `seasonPlayoffSeries` table must be defined **before** `seasonGames` in the file because `seasonGames.seriesId` holds an FK reference to it. Drizzle's lazy `() =>` syntax does NOT solve same-file forward references at module evaluation time — reordering is required.

**Files:**
- Modify: `src/lib/schema.ts`

- [ ] **Step 1: Add `seasonPlayoffSeries` table to `src/lib/schema.ts` — placed BEFORE `seasonGames`**

Find the `seasonLockedPokemon` table definition (ends around line 166). Immediately after it, insert the new table before the `seasonGames` definition:

```typescript
export const seasonPlayoffSeries = pgTable(
  "season_playoff_series",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    round: integer("round").notNull(), // 1=QF, 2=SF, 3=Finals
    matchupIndex: integer("matchup_index").notNull(), // 0–3 QF, 0–1 SF, 0 Finals
    team1UserId: text("team1_user_id").notNull(),
    team1Name: text("team1_name").notNull(),
    team2UserId: text("team2_user_id").notNull(),
    team2Name: text("team2_name").notNull(),
    team1Wins: integer("team1_wins").notNull().default(0),
    team2Wins: integer("team2_wins").notNull().default(0),
    winnerId: text("winner_id"),
    // 'active' | 'completed'
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("season_playoff_series_season_id_idx").on(t.seasonId),
    index("season_playoff_series_season_round_idx").on(t.seasonId, t.round),
  ]
);
```

- [ ] **Step 2: Add `seriesId` and `gameNumberInSeries` columns to `seasonGames`**

Inside the `seasonGames` column list, add these two columns after `matchupIndex`:

```typescript
seriesId: uuid("series_id").references(() => seasonPlayoffSeries.id, { onDelete: "set null" }),
gameNumberInSeries: integer("game_number_in_series"), // 1–7; null for regular season
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. If there's a circular-reference error, confirm `seasonPlayoffSeries` is defined before `seasonGames` in the file.

- [ ] **Step 4: Generate the Drizzle migration**

```bash
npm run db:generate
```

A new file appears in `drizzle/`. Open it and verify it contains all three of:
- `CREATE TABLE "season_playoff_series"`
- `ALTER TABLE "season_games" ADD COLUMN "series_id" uuid`
- `ALTER TABLE "season_games" ADD COLUMN "game_number_in_series" integer`

- [ ] **Step 5: Apply the migration**

```bash
npm run db:migrate
```

Expected: completes without error.

- [ ] **Step 6: Commit**

```bash
git add src/lib/schema.ts drizzle/
git commit -m "feat: add season_playoff_series table and series columns to season_games"
```

---

## Chunk 3: Playoff Series DB Logic

**Prerequisite:** Chunk 2 must be committed and migrated before this chunk. TypeScript will fail to compile otherwise.

### File Map
- Modify: `src/lib/season-db.ts`
  - Top: add `seasonPlayoffSeries` to imports; add `SeriesResult` interface; add `getSeasonPlayoffSeries` helper
  - `tryStartPlayoffs`: create series rows + link game 1
  - `writeSeasonGameResult`: increment series wins inside transaction, return `SeriesResult`
  - `tryAdvancePlayoffRound`: switch to `seasonPlayoffSeries` as authoritative source
- Modify: `src/lib/simulate-season-game-live.ts`: handle returned `SeriesResult`

---

### Task 3: Update imports and add SeriesResult interface + getSeasonPlayoffSeries helper

**Files:**
- Modify: `src/lib/season-db.ts`

- [ ] **Step 1: Update the schema import in `src/lib/season-db.ts`**

Find (line ~1):
```typescript
import { seasons, seasonTeams, seasonLockedPokemon, seasonGames, seasonGameEvents } from "./schema";
```

Replace with:
```typescript
import { seasons, seasonTeams, seasonLockedPokemon, seasonGames, seasonGameEvents, seasonPlayoffSeries } from "./schema";
```

- [ ] **Step 2: Add the `SeriesResult` interface and `getSeasonPlayoffSeries` helper**

After the existing type/interface definitions at the top of the file (and before the first exported function), add:

```typescript
/**
 * Returned by writeSeasonGameResult for playoff games.
 * Carries all info the caller needs to schedule the next game or advance the round.
 */
export interface SeriesResult {
  seriesId: string;
  round: number;
  matchupIndex: number;
  team1UserId: string;
  team1Name: string;
  team2UserId: string;
  team2Name: string;
  team1Wins: number;
  team2Wins: number;
  winnerId: string | null;
  /** The next game number to schedule, or null if the series is over. */
  nextGameNumber: number | null;
}
```

At the bottom of the `// ─── Playoff Transition ───` section (after `tryAdvancePlayoffRound`), add:

```typescript
/** Returns all playoff series for a season, ordered by round then matchupIndex. */
export async function getSeasonPlayoffSeries(seasonId: string) {
  return db
    .select()
    .from(seasonPlayoffSeries)
    .where(eq(seasonPlayoffSeries.seasonId, seasonId))
    .orderBy(asc(seasonPlayoffSeries.round), asc(seasonPlayoffSeries.matchupIndex));
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/season-db.ts
git commit -m "feat: add SeriesResult interface and getSeasonPlayoffSeries helper"
```

---

### Task 4: Update tryStartPlayoffs to create series records

**Context:** Currently inserts QF `seasonGames` rows directly. Must now also insert `seasonPlayoffSeries` rows and link each game via `seriesId` + `gameNumberInSeries = 1`.

**Files:**
- Modify: `src/lib/season-db.ts`

- [ ] **Step 1: Replace the QF game insertion block in `tryStartPlayoffs`**

Find the comment `// Insert QF games` (around line 436). Replace the entire `for` loop that follows with:

```typescript
// Insert QF series + game 1 of each series
for (let i = 0; i < bracket.length; i++) {
  const m = bracket[i];

  // Create the series record first
  const seriesRows = await tx
    .insert(seasonPlayoffSeries)
    .values({
      seasonId,
      round: 1,
      matchupIndex: m.matchupIndex,
      team1UserId: m.team1UserId,
      team1Name: m.team1Name,
      team2UserId: m.team2UserId,
      team2Name: m.team2Name,
      status: "active",
    })
    .returning({ id: seasonPlayoffSeries.id });

  const seriesId = seriesRows[0].id;

  // Schedule game 1; stagger by 30s per matchup to avoid cron batch collision
  await tx.insert(seasonGames).values({
    seasonId,
    gameType: "playoff",
    team1UserId: m.team1UserId,
    team1Name: m.team1Name,
    team2UserId: m.team2UserId,
    team2Name: m.team2Name,
    scheduledAt: new Date(Date.now() + i * 30_000),
    round: 1,
    matchupIndex: m.matchupIndex,
    seriesId,
    gameNumberInSeries: 1,
    status: "pending",
  });
}
```

Also remove the now-unused `qfInterval` and `qfWindowEnd` variables that were used to calculate staggered schedules — they're no longer needed.

- [ ] **Step 2: Run vitest**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/season-db.ts
git commit -m "feat: update tryStartPlayoffs to create playoff series records"
```

---

### Task 5: Update writeSeasonGameResult for series win tracking

**Context:** After a playoff game completes, the function must: (1) increment the win counter on the linked `seasonPlayoffSeries` row **inside** the existing transaction; (2) return a `SeriesResult` so the caller can act post-commit. The caller (`simulateSeasonGameLive`) then either schedules the next game or calls `tryAdvancePlayoffRound` — both happen **outside** the transaction to avoid nested advisory-lock deadlock.

**Files:**
- Modify: `src/lib/season-db.ts`
- Modify: `src/lib/simulate-season-game-live.ts`

- [ ] **Step 1: Update `writeSeasonGameResult` signature and return type**

Change the function signature from `Promise<void>` to `Promise<SeriesResult | null>`:

```typescript
export async function writeSeasonGameResult(
  gameId: string,
  seasonId: string,
  team1UserId: string,
  team1Score: number,
  team2Score: number,
  winnerId: string,
  loserId: string
): Promise<SeriesResult | null> {
```

- [ ] **Step 2: Add series tracking inside the transaction**

Hoist a result variable before the transaction, populate it inside the closure, return it after:

```typescript
export async function writeSeasonGameResult(
  gameId: string,
  seasonId: string,
  team1UserId: string,
  team1Score: number,
  team2Score: number,
  winnerId: string,
  loserId: string
): Promise<SeriesResult | null> {
  let seriesResult: SeriesResult | null = null;

  await db.transaction(async (tx) => {
    // Write final score
    await tx
      .update(seasonGames)
      .set({ team1Score, team2Score, winnerId, status: "completed", completedAt: new Date() })
      .where(eq(seasonGames.id, gameId));

    const winnerScore = winnerId === team1UserId ? team1Score : team2Score;
    const loserScore = winnerId === team1UserId ? team2Score : team1Score;

    // Update winner stats
    await tx
      .update(seasonTeams)
      .set({
        wins: sql`${seasonTeams.wins} + 1`,
        pointsFor: sql`${seasonTeams.pointsFor} + ${winnerScore}`,
        pointsAgainst: sql`${seasonTeams.pointsAgainst} + ${loserScore}`,
      })
      .where(and(eq(seasonTeams.seasonId, seasonId), eq(seasonTeams.userId, winnerId)));

    // Update loser stats
    await tx
      .update(seasonTeams)
      .set({
        losses: sql`${seasonTeams.losses} + 1`,
        pointsFor: sql`${seasonTeams.pointsFor} + ${loserScore}`,
        pointsAgainst: sql`${seasonTeams.pointsAgainst} + ${winnerScore}`,
      })
      .where(and(eq(seasonTeams.seasonId, seasonId), eq(seasonTeams.userId, loserId)));

    // ── Series tracking (playoff games only) ──────────────────────────────────
    const gameRows = await tx
      .select({
        seriesId: seasonGames.seriesId,
        gameNumberInSeries: seasonGames.gameNumberInSeries,
        round: seasonGames.round,
      })
      .from(seasonGames)
      .where(eq(seasonGames.id, gameId));

    const game = gameRows[0];
    if (!game?.seriesId) return; // regular season game — no series tracking

    const seriesRows = await tx
      .select()
      .from(seasonPlayoffSeries)
      .where(eq(seasonPlayoffSeries.id, game.seriesId));

    const series = seriesRows[0];
    if (!series) return;

    const isTeam1Winner = winnerId === series.team1UserId;
    const newTeam1Wins = series.team1Wins + (isTeam1Winner ? 1 : 0);
    const newTeam2Wins = series.team2Wins + (isTeam1Winner ? 0 : 1);
    const seriesWinnerId =
      newTeam1Wins === 4 ? series.team1UserId :
      newTeam2Wins === 4 ? series.team2UserId :
      null;

    await tx
      .update(seasonPlayoffSeries)
      .set({
        team1Wins: newTeam1Wins,
        team2Wins: newTeam2Wins,
        ...(seriesWinnerId ? { winnerId: seriesWinnerId, status: "completed" } : {}),
      })
      .where(eq(seasonPlayoffSeries.id, game.seriesId));

    // Populate result for caller (closure capture — committed when tx resolves)
    seriesResult = {
      seriesId: game.seriesId,
      round: game.round ?? 1,
      matchupIndex: series.matchupIndex,
      team1UserId: series.team1UserId,
      team1Name: series.team1Name,
      team2UserId: series.team2UserId,
      team2Name: series.team2Name,
      team1Wins: newTeam1Wins,
      team2Wins: newTeam2Wins,
      winnerId: seriesWinnerId,
      nextGameNumber: seriesWinnerId ? null : (game.gameNumberInSeries ?? 1) + 1,
    };
  });

  return seriesResult;
}
```

- [ ] **Step 3: Update `src/lib/simulate-season-game-live.ts` to handle the returned SeriesResult**

The current caller at line ~82 is:

```typescript
await writeSeasonGameResult(gameId, seasonId, game.team1UserId, team1Score, team2Score, winnerId, loserId);

// For playoff games, try to advance the round
if (game.gameType === "playoff" && game.round != null) {
  await tryAdvancePlayoffRound(seasonId, game.round);
}
```

Replace both lines with:

```typescript
const seriesResult = await writeSeasonGameResult(
  gameId, seasonId, game.team1UserId, team1Score, team2Score, winnerId, loserId
);

if (seriesResult) {
  if (seriesResult.nextGameNumber !== null) {
    // Series continues — schedule the next game in this series
    await db.insert(seasonGames).values({
      seasonId,
      gameType: "playoff",
      team1UserId: seriesResult.team1UserId,
      team1Name: seriesResult.team1Name,
      team2UserId: seriesResult.team2UserId,
      team2Name: seriesResult.team2Name,
      scheduledAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
      round: seriesResult.round,
      matchupIndex: seriesResult.matchupIndex,
      seriesId: seriesResult.seriesId,
      gameNumberInSeries: seriesResult.nextGameNumber,
      status: "pending",
    });
  } else {
    // Series clinched — advance the playoff round (opens its own tx with advisory lock)
    await tryAdvancePlayoffRound(seasonId, seriesResult.round);
  }
} else if (game.gameType === "playoff" && game.round != null && !game.seriesId) {
  // Legacy: in-flight playoff games from before the migration have no seriesId.
  // Fall back to the old round-advancement path so they complete cleanly.
  await tryAdvancePlayoffRound(seasonId, game.round);
}
```

Also add `seasonGames` to the imports in `simulate-season-game-live.ts` if not already present:
```typescript
import { db } from "./db";
import { seasonGames } from "./schema";
```
(`seasonGames` is already imported via `schema` — confirm it's in the destructure.)

- [ ] **Step 4: Run vitest**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/season-db.ts src/lib/simulate-season-game-live.ts
git commit -m "feat: track playoff series wins in writeSeasonGameResult, schedule next series game"
```

---

### Task 6: Update tryAdvancePlayoffRound to use seasonPlayoffSeries

**Context:** `tryAdvancePlayoffRound` must check `seasonPlayoffSeries` (not `seasonGames`) for round completion. For Finals (round 3), winner is read from the series `winnerId`. The function is called within its own transaction + advisory lock and is always called from outside `writeSeasonGameResult`'s transaction.

**Files:**
- Modify: `src/lib/season-db.ts`

- [ ] **Step 1: Add a local helper inside `tryAdvancePlayoffRound` for fetching series**

At the start of the `db.transaction(async (tx) => {` callback in `tryAdvancePlayoffRound`, add:

```typescript
// Fetch all series for the completed round — authoritative source for round completion
const seriesInRound = await tx
  .select()
  .from(seasonPlayoffSeries)
  .where(
    and(
      eq(seasonPlayoffSeries.seasonId, seasonId),
      eq(seasonPlayoffSeries.round, completedRound)
    )
  )
  .orderBy(asc(seasonPlayoffSeries.matchupIndex));
```

- [ ] **Step 2: Replace the incomplete-game check**

Remove:
```typescript
const incomplete = await tx
  .select({ count: sql<number>`COUNT(*)::int` })
  .from(seasonGames)
  .where(
    and(
      eq(seasonGames.seasonId, seasonId),
      eq(seasonGames.gameType, "playoff"),
      eq(seasonGames.round, completedRound),
      ne(seasonGames.status, "completed")
    )
  );

if (incomplete[0].count > 0) return;
```

Replace with:
```typescript
if (seriesInRound.length === 0) return; // no series yet for this round
if (seriesInRound.some((s) => s.status !== "completed")) return;
```

- [ ] **Step 3: Replace the Finals logic**

Remove the entire `if (completedRound === 3)` block and replace with:

```typescript
if (completedRound === 3) {
  // Read winner from the Finals series row (not from a seasonGames row)
  const finalsSeries = seriesInRound[0];
  if (!finalsSeries?.winnerId) return;
  const loserId =
    finalsSeries.winnerId === finalsSeries.team1UserId
      ? finalsSeries.team2UserId
      : finalsSeries.team1UserId;
  await tx.update(seasonTeams)
    .set({ result: "champion" })
    .where(and(eq(seasonTeams.seasonId, seasonId), eq(seasonTeams.userId, finalsSeries.winnerId)));
  await tx.update(seasonTeams)
    .set({ result: "finalist" })
    .where(and(eq(seasonTeams.seasonId, seasonId), eq(seasonTeams.userId, loserId)));
  await tx.update(seasons)
    .set({ status: "completed" })
    .where(eq(seasons.id, seasonId));
  return;
}
```

- [ ] **Step 4: Replace the next-round generation logic**

Remove the block from `// Pair winners for next round` through the end of the loop (including the `completedGames` query and all game inserts). Replace with:

```typescript
// Pair series winners for next round
const nextRound = completedRound + 1;
const nextMatchups: Array<{
  team1UserId: string; team1Name: string;
  team2UserId: string; team2Name: string;
  matchupIndex: number;
}> = [];

for (let i = 0; i < seriesInRound.length; i += 2) {
  const s1 = seriesInRound[i];
  const s2 = seriesInRound[i + 1];
  if (!s1 || !s2 || !s1.winnerId || !s2.winnerId) return;
  const w1Name = s1.winnerId === s1.team1UserId ? s1.team1Name : s1.team2Name;
  const w2Name = s2.winnerId === s2.team1UserId ? s2.team1Name : s2.team2Name;
  nextMatchups.push({
    team1UserId: s1.winnerId,
    team1Name: w1Name,
    team2UserId: s2.winnerId,
    team2Name: w2Name,
    matchupIndex: i / 2,
  });
}

// Create next-round series + game 1 for each
for (let i = 0; i < nextMatchups.length; i++) {
  const m = nextMatchups[i];
  const newSeriesRows = await tx
    .insert(seasonPlayoffSeries)
    .values({
      seasonId,
      round: nextRound,
      matchupIndex: m.matchupIndex,
      team1UserId: m.team1UserId,
      team1Name: m.team1Name,
      team2UserId: m.team2UserId,
      team2Name: m.team2Name,
      status: "active",
    })
    .returning({ id: seasonPlayoffSeries.id });

  await tx.insert(seasonGames).values({
    seasonId,
    gameType: "playoff",
    team1UserId: m.team1UserId,
    team1Name: m.team1Name,
    team2UserId: m.team2UserId,
    team2Name: m.team2Name,
    scheduledAt: new Date(Date.now() + i * 30_000),
    round: nextRound,
    matchupIndex: m.matchupIndex,
    seriesId: newSeriesRows[0].id,
    gameNumberInSeries: 1,
    status: "pending",
  });
}

// Mark eliminated teams (loser of each completed series in this round)
for (const s of seriesInRound) {
  if (!s.winnerId) continue;
  const loserId = s.winnerId === s.team1UserId ? s.team2UserId : s.team1UserId;
  await tx.update(seasonTeams)
    .set({ result: "eliminated" })
    .where(and(eq(seasonTeams.seasonId, seasonId), eq(seasonTeams.userId, loserId)));
}
```

- [ ] **Step 5: Run vitest**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/season-db.ts
git commit -m "feat: update tryAdvancePlayoffRound to use seasonPlayoffSeries as authoritative source"
```

---

## Chunk 4: Extend Games API

### File Map
- Modify: `src/lib/season-db.ts` — add `getSeasonGamesFiltered`
- Modify: `src/app/api/seasons/[id]/games/route.ts`
- Create: `src/app/api/seasons/[id]/games/route.test.ts`

---

### Task 7: Extend the games API with status, userId, limit, offset filters

**Files:**
- Modify: `src/lib/season-db.ts`
- Modify: `src/app/api/seasons/[id]/games/route.ts`
- Create: `src/app/api/seasons/[id]/games/route.test.ts`

- [ ] **Step 1: Write failing tests for the route**

Create `src/app/api/seasons/[id]/games/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetSeasonGamesFiltered } = vi.hoisted(() => ({
  mockGetSeasonGamesFiltered: vi.fn(),
}));

vi.mock("@/lib/season-db", () => ({
  getSeasonGamesFiltered: mockGetSeasonGamesFiltered,
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
    },
  },
}));

vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue({}) }));

const SEASON_ID = "season-abc";
const FAKE_GAMES = [{ id: "game-1", status: "pending" }];

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL(`http://localhost/api/seasons/${SEASON_ID}/games`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

describe("GET /api/seasons/[id]/games", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSeasonGamesFiltered.mockResolvedValue(FAKE_GAMES);
  });

  it("returns 401 when not authenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest() as never, { params: Promise.resolve({ id: SEASON_ID }) });
    expect(res.status).toBe(401);
  });

  it("maps status=live to in_progress", async () => {
    const { GET } = await import("./route");
    await GET(makeRequest({ status: "live" }) as never, { params: Promise.resolve({ id: SEASON_ID }) });
    expect(mockGetSeasonGamesFiltered).toHaveBeenCalledWith(
      SEASON_ID,
      expect.objectContaining({ status: "in_progress" })
    );
  });

  it("maps status=upcoming to pending", async () => {
    const { GET } = await import("./route");
    await GET(makeRequest({ status: "upcoming" }) as never, { params: Promise.resolve({ id: SEASON_ID }) });
    expect(mockGetSeasonGamesFiltered).toHaveBeenCalledWith(
      SEASON_ID,
      expect.objectContaining({ status: "pending" })
    );
  });

  it("maps status=completed to completed", async () => {
    const { GET } = await import("./route");
    await GET(makeRequest({ status: "completed" }) as never, { params: Promise.resolve({ id: SEASON_ID }) });
    expect(mockGetSeasonGamesFiltered).toHaveBeenCalledWith(
      SEASON_ID,
      expect.objectContaining({ status: "completed" })
    );
  });

  it("passes userId filter", async () => {
    const { GET } = await import("./route");
    await GET(makeRequest({ userId: "user-99" }) as never, { params: Promise.resolve({ id: SEASON_ID }) });
    expect(mockGetSeasonGamesFiltered).toHaveBeenCalledWith(
      SEASON_ID,
      expect.objectContaining({ userId: "user-99" })
    );
  });

  it("passes limit and offset as numbers", async () => {
    const { GET } = await import("./route");
    await GET(makeRequest({ limit: "25", offset: "50" }) as never, { params: Promise.resolve({ id: SEASON_ID }) });
    expect(mockGetSeasonGamesFiltered).toHaveBeenCalledWith(
      SEASON_ID,
      expect.objectContaining({ limit: 25, offset: 50 })
    );
  });

  it("returns 200 with games array", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest() as never, { params: Promise.resolve({ id: SEASON_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(FAKE_GAMES);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run "src/app/api/seasons/\[id\]/games/route.test.ts"
```

Expected: FAIL — `getSeasonGamesFiltered` does not exist yet.

- [ ] **Step 3: Add `getSeasonGamesFiltered` to `season-db.ts`**

Add after `getSeasonGames`. Import `or` from `drizzle-orm` if not already present at the top of the file:

```typescript
import { eq, and, or, asc, desc, ne, not, inArray, sql } from "drizzle-orm";
```

Then add the function:

```typescript
export interface SeasonGamesFilter {
  status?: string;   // 'pending' | 'in_progress' | 'completed'
  userId?: string;   // games involving this user (team1 or team2)
  gameType?: string; // 'regular' | 'playoff'
  limit?: number;    // default 50, max 200
  offset?: number;   // default 0
}

export async function getSeasonGamesFiltered(
  seasonId: string,
  opts: SeasonGamesFilter = {}
) {
  const { status, userId, gameType, limit = 50, offset = 0 } = opts;

  const conditions = [eq(seasonGames.seasonId, seasonId)];
  if (status) conditions.push(eq(seasonGames.status, status));
  if (gameType) conditions.push(eq(seasonGames.gameType, gameType));
  if (userId) {
    conditions.push(
      or(
        eq(seasonGames.team1UserId, userId),
        eq(seasonGames.team2UserId, userId)
      )!
    );
  }

  const sortOrder =
    status === "pending" ? asc(seasonGames.scheduledAt) : desc(seasonGames.scheduledAt);

  return db
    .select()
    .from(seasonGames)
    .where(and(...conditions))
    .orderBy(sortOrder)
    .limit(Math.min(limit, 200))
    .offset(offset);
}
```

- [ ] **Step 4: Update the route handler `src/app/api/seasons/[id]/games/route.ts`**

Replace the entire file:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getSeasonGamesFiltered } from "@/lib/season-db";

const STATUS_MAP: Record<string, string> = {
  live: "in_progress",
  upcoming: "pending",
  completed: "completed",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: seasonId } = await params;
  const { searchParams } = new URL(req.url);

  const statusParam = searchParams.get("status") ?? undefined;
  const status = statusParam ? (STATUS_MAP[statusParam] ?? undefined) : undefined;
  const userId = searchParams.get("userId") ?? undefined;
  const limitRaw = Number(searchParams.get("limit") ?? "50");
  const offsetRaw = Number(searchParams.get("offset") ?? "0");
  const limit = Number.isFinite(limitRaw) ? limitRaw : 50;
  const offset = Number.isFinite(offsetRaw) ? offsetRaw : 0;

  const games = await getSeasonGamesFiltered(seasonId, { status, userId, limit, offset });
  return NextResponse.json(games);
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run "src/app/api/seasons/\[id\]/games/route.test.ts"
```

Expected: all 7 tests PASS.

- [ ] **Step 6: Run full suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/season-db.ts "src/app/api/seasons/[id]/games/route.ts" "src/app/api/seasons/[id]/games/route.test.ts"
git commit -m "feat: extend games API with status/userId/limit/offset filters"
```

---

## Chunk 5: Schedule Page UI

### File Map
- Create: `src/app/seasons/[id]/schedule/page.tsx`
- Create: `src/app/seasons/[id]/schedule/ScheduleView.tsx`
- Modify: `src/app/seasons/[id]/page.tsx` — add "View Schedule →" link

---

### Task 8: Create the schedule page

**Files:**
- Create: `src/app/seasons/[id]/schedule/page.tsx`
- Create: `src/app/seasons/[id]/schedule/ScheduleView.tsx`
- Modify: `src/app/seasons/[id]/page.tsx`

- [ ] **Step 1: Create the server shell `src/app/seasons/[id]/schedule/page.tsx`**

```typescript
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSeason, getSeasonTeams, getSeasonGamesFiltered } from "@/lib/season-db";
import ScheduleView from "./ScheduleView";

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const { id: seasonId } = await params;

  // Fetch season + teams + live games (limit 50 — also used as initial data if live tab)
  const [season, teams, liveGames] = await Promise.all([
    getSeason(seasonId),
    getSeasonTeams(seasonId),
    getSeasonGamesFiltered(seasonId, { status: "in_progress", limit: 50 }),
  ]);

  if (!season) notFound();

  const defaultTab = liveGames.length > 0 ? "live" : "upcoming";

  // Only fetch upcoming if that's the default tab (avoid extra DB call on live tab)
  const initialGames =
    defaultTab === "live"
      ? liveGames
      : await getSeasonGamesFiltered(seasonId, { status: "pending", limit: 50 });

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="text-sm text-gray-500 space-x-2">
        <Link href="/seasons" className="hover:underline">Seasons</Link>
        <span>›</span>
        <Link href={`/seasons/${seasonId}`} className="hover:underline">{season.name}</Link>
        <span>›</span>
        <span className="text-gray-800 font-medium">Schedule</span>
      </div>

      <h1 className="text-2xl font-bold">{season.name} — Schedule</h1>

      <ScheduleView
        seasonId={seasonId}
        teams={teams.map((t) => ({ userId: t.userId, teamName: t.teamName }))}
        defaultTab={defaultTab}
        initialGames={initialGames}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/seasons/[id]/schedule/ScheduleView.tsx`**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Tab = "live" | "upcoming" | "completed";

interface Game {
  id: string;
  team1Name: string;
  team2Name: string;
  team1Score: number | null;
  team2Score: number | null;
  status: string;
  scheduledAt: string;
  gameType: string;
  round: number | null;
}

interface Team {
  userId: string;
  teamName: string;
}

interface Props {
  seasonId: string;
  teams: Team[];
  defaultTab: Tab;
  initialGames: Game[];
}

const TAB_LABEL: Record<Tab, string> = {
  live: "🔴 Live",
  upcoming: "Upcoming",
  completed: "Completed",
};

export default function ScheduleView({ seasonId, teams, defaultTab, initialGames }: Props) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [userId, setUserId] = useState<string>("");
  const [games, setGames] = useState<Game[]>(initialGames);
  const [offset, setOffset] = useState(initialGames.length);
  const [hasMore, setHasMore] = useState(initialGames.length === 50);
  const [loading, setLoading] = useState(false);

  const fetchGames = useCallback(
    async (nextTab: Tab, nextUserId: string, nextOffset: number, append: boolean) => {
      setLoading(true);
      const params = new URLSearchParams({ status: nextTab, limit: "50", offset: String(nextOffset) });
      if (nextUserId) params.set("userId", nextUserId);
      const res = await fetch(`/api/seasons/${seasonId}/games?${params}`);
      if (!res.ok) { setLoading(false); return; }
      const data: Game[] = await res.json();
      setGames((prev) => (append ? [...prev, ...data] : data));
      setOffset(nextOffset + data.length);
      setHasMore(data.length === 50);
      setLoading(false);
    },
    [seasonId]
  );

  // Re-fetch when tab or team filter changes (skip on first render — initialGames already set)
  const isFirstRender = useState(true);
  useEffect(() => {
    if (isFirstRender[0]) { isFirstRender[1](false); return; }
    setOffset(0);
    fetchGames(tab, userId, 0, false);
  }, [tab, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh live tab every 30 seconds
  useEffect(() => {
    if (tab !== "live") return;
    const id = setInterval(() => fetchGames("live", userId, 0, false), 30_000);
    return () => clearInterval(id);
  }, [tab, userId, fetchGames]);

  function statusPill(game: Game) {
    if (game.status === "in_progress") {
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
          LIVE
        </span>
      );
    }
    if (game.status === "completed") {
      return <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">FINAL</span>;
    }
    return <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600">UPCOMING</span>;
  }

  function gameTypeLabel(game: Game) {
    if (game.gameType === "playoff") {
      const label = game.round === 1 ? "QF" : game.round === 2 ? "SF" : "Finals";
      return <span className="text-xs text-purple-600 font-medium">{label}</span>;
    }
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 border rounded-lg p-1 bg-gray-50">
          {(["live", "upcoming", "completed"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                tab === t ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="text-sm border rounded px-3 py-1.5 bg-white"
        >
          <option value="">All Teams</option>
          {teams.map((t) => (
            <option key={t.userId} value={t.userId}>{t.teamName}</option>
          ))}
        </select>
      </div>

      <div className="border rounded-lg overflow-hidden divide-y">
        {games.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-400 text-sm">
            No {tab} games{userId ? " for this team" : ""}.
          </div>
        )}
        {games.map((game) => (
          <Link
            key={game.id}
            href={`/seasons/${seasonId}/games/${game.id}`}
            className="flex items-center px-4 py-3 hover:bg-gray-50 gap-4"
          >
            <div className="w-32 shrink-0 text-xs text-gray-400">
              {new Date(game.scheduledAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              {" "}
              {new Date(game.scheduledAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-medium text-sm">{game.team1Name}</span>
              <span className="text-gray-400 mx-2">vs</span>
              <span className="font-medium text-sm">{game.team2Name}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {gameTypeLabel(game)}
              {game.status === "completed" && (
                <span className="font-mono text-sm tabular-nums">
                  {game.team1Score}–{game.team2Score}
                </span>
              )}
              {statusPill(game)}
            </div>
          </Link>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => fetchGames(tab, userId, offset, true)}
          disabled={loading}
          className="w-full py-2 text-sm text-blue-600 border rounded-lg hover:bg-blue-50 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add "View Full Schedule →" link to `src/app/seasons/[id]/page.tsx`**

Find the line with `<h1 className="text-2xl font-bold mt-1">{season.name}</h1>` (around line 44). Add a link immediately after it:

```typescript
<Link href={`/seasons/${id}/schedule`} className="text-sm text-blue-600 hover:underline mt-1 inline-block">
  View Full Schedule →
</Link>
```

- [ ] **Step 4: Run vitest**

```bash
npx vitest run
```

Expected: all tests pass (no tests for UI components).

- [ ] **Step 5: Manual smoke test**

```bash
npm run dev
```

Navigate to a season → click "View Full Schedule →" → confirm:
- Page loads at `/seasons/[id]/schedule`
- Tabs switch between Live / Upcoming / Completed
- Team filter narrows results
- Game rows link to `/seasons/[id]/games/[gameId]`

- [ ] **Step 6: Commit**

```bash
git add "src/app/seasons/[id]/schedule/" "src/app/seasons/[id]/page.tsx"
git commit -m "feat: add season schedule page with live/upcoming/completed filters and team filter"
```

---

## Chunk 6: Playoff Bracket UI

### File Map
- Create: `src/app/seasons/[id]/components/PlayoffBracket.tsx`
- Modify: `src/app/seasons/[id]/page.tsx` — add `getSeasonPlayoffSeries` import, pass series data, swap in `PlayoffBracket`

---

### Task 9: Create PlayoffBracket component and wire into season detail page

**Files:**
- Create: `src/app/seasons/[id]/components/PlayoffBracket.tsx`
- Modify: `src/app/seasons/[id]/page.tsx`

- [ ] **Step 1: Create `src/app/seasons/[id]/components/PlayoffBracket.tsx`**

```typescript
import Link from "next/link";

interface Series {
  id: string;
  round: number;
  matchupIndex: number;
  team1UserId: string;
  team1Name: string;
  team2UserId: string;
  team2Name: string;
  team1Wins: number;
  team2Wins: number;
  winnerId: string | null;
  status: string;
}

interface GameSummary {
  id: string;
  seriesId: string | null;
  gameNumberInSeries: number | null;
  team1Score: number | null;
  team2Score: number | null;
  status: string;
}

interface Props {
  seasonId: string;
  series: Series[];
  games: GameSummary[];
}

function seriesStatusLabel(s: Series): string {
  if (s.status === "completed") {
    const isTeam1 = s.team1Wins > s.team2Wins;
    const winnerName = isTeam1 ? s.team1Name : s.team2Name;
    return `${winnerName} wins ${Math.max(s.team1Wins, s.team2Wins)}–${Math.min(s.team1Wins, s.team2Wins)}`;
  }
  if (s.team1Wins === 0 && s.team2Wins === 0) return "Not started";
  if (s.team1Wins === s.team2Wins) return `Series tied ${s.team1Wins}–${s.team2Wins}`;
  const leadingName = s.team1Wins > s.team2Wins ? s.team1Name : s.team2Name;
  return `${leadingName} leads ${Math.max(s.team1Wins, s.team2Wins)}–${Math.min(s.team1Wins, s.team2Wins)}`;
}

function SeriesCard({ s, games, seasonId }: { s: Series; games: GameSummary[]; seasonId: string }) {
  const seriesGames = games
    .filter((g) => g.seriesId === s.id)
    .sort((a, b) => (a.gameNumberInSeries ?? 0) - (b.gameNumberInSeries ?? 0));

  // Link to the live game if one exists, otherwise to the last completed game
  const liveGame = seriesGames.find((g) => g.status === "in_progress");
  const lastCompleted = [...seriesGames].reverse().find((g) => g.status === "completed");
  const linkGame = liveGame ?? lastCompleted ?? seriesGames[0];

  const card = (
    <div className={`border rounded-lg p-3 space-y-2 transition-colors ${
      s.status === "completed" ? "bg-gray-50" : "bg-white hover:bg-blue-50/30"
    }`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium truncate">{s.team1Name}</span>
        <span className={`text-lg font-bold tabular-nums ml-2 ${
          s.team1Wins > s.team2Wins ? "text-blue-700" : "text-gray-400"
        }`}>{s.team1Wins}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium truncate">{s.team2Name}</span>
        <span className={`text-lg font-bold tabular-nums ml-2 ${
          s.team2Wins > s.team1Wins ? "text-blue-700" : "text-gray-400"
        }`}>{s.team2Wins}</span>
      </div>
      <div className="text-xs text-gray-500 pt-1 border-t">{seriesStatusLabel(s)}</div>
      {seriesGames.filter((g) => g.status === "completed").length > 0 && (
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer hover:text-gray-700">Game results</summary>
          <div className="mt-1 space-y-0.5 pl-2">
            {seriesGames
              .filter((g) => g.status === "completed")
              .map((g) => (
                <div key={g.id}>
                  Game {g.gameNumberInSeries}: {g.team1Score}–{g.team2Score}
                </div>
              ))}
          </div>
        </details>
      )}
    </div>
  );

  if (!linkGame) return card;
  // Use absolute path to avoid fragile relative-path resolution
  return <Link href={`/seasons/${seasonId}/games/${linkGame.id}`}>{card}</Link>;
}

const ROUND_LABELS: Record<number, string> = {
  1: "Quarterfinals",
  2: "Semifinals",
  3: "Finals",
};

export default function PlayoffBracket({ seasonId, series, games }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {[1, 2, 3].map((round) => {
        const roundSeries = series.filter((s) => s.round === round);
        return (
          <div key={round} className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              {ROUND_LABELS[round]}
            </h3>
            {roundSeries.length === 0 ? (
              <div className="border rounded-lg p-4 text-center text-sm text-gray-300">TBD</div>
            ) : (
              roundSeries.map((s) => (
                <SeriesCard key={s.id} s={s} games={games} seasonId={seasonId} />
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Update `src/app/seasons/[id]/page.tsx`**

Add to the imports at the top:

```typescript
import { getSeasonPlayoffSeries } from "@/lib/season-db";
import PlayoffBracket from "./components/PlayoffBracket";
```

In the data-fetching section, replace the existing `playoffGames` fetch with:

```typescript
const isPlayoffs = season.status === "playoffs" || season.status === "completed";
const playoffSeries = isPlayoffs ? await getSeasonPlayoffSeries(id) : [];
const playoffGames = playoffSeries.length > 0
  ? await getSeasonGames(id, { gameType: "playoff" })
  : [];
```

Find the `{/* Playoff bracket (if in playoffs) */}` section and replace the entire section with:

```typescript
{/* Playoff bracket */}
{isPlayoffs && playoffSeries.length > 0 && (
  <section>
    <h2 className="text-lg font-semibold mb-3">Playoffs</h2>
    <PlayoffBracket seasonId={id} series={playoffSeries} games={playoffGames} />
  </section>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Fix any type errors (common issue: `playoffGames` type from `getSeasonGames` may not include `seriesId`/`gameNumberInSeries` — if so, the `GameSummary` interface in `PlayoffBracket` must match the actual Drizzle return type).

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Manual smoke test**

```bash
npm run dev
```

Navigate to a season in `playoffs` or `completed` status → confirm:
- Bracket shows QF / SF / Finals columns
- Each series card shows team names, wins, and series status label
- Completed game results are expandable
- Clicking a series card navigates to the correct game viewer

- [ ] **Step 6: Commit**

```bash
git add "src/app/seasons/[id]/components/" "src/app/seasons/[id]/page.tsx"
git commit -m "feat: add playoff bracket component with best-of-7 series display"
```

---

## Final Verification

- [ ] **Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Manual end-to-end checklist**

Start dev server (`npm run dev`) and verify each item:

1. **Stats bug fixed:** Visit `/seasons/[id]/teams/[userId]` → player stats table shows only real Pokemon names (no Q2, Q3, Halftime, Q4)
2. **Schedule page accessible:** Visit `/seasons/[id]` → "View Full Schedule →" link appears and routes to `/seasons/[id]/schedule`
3. **Schedule tabs work:** Live tab shows `in_progress` games with red LIVE pill; Upcoming shows `pending` with scheduled times; Completed shows scores
4. **Team filter works:** Selecting a team narrows the game list
5. **Live game accessible:** Clicking a game row opens the game viewer at `/seasons/[id]/games/[gameId]` with scoreboard and play-by-play
6. **Playoff bracket:** Season in `playoffs` status shows 3-column bracket with series records; clicking a series card opens the active or most recent game
7. **Series advancement:** (Requires playthrough) Winning 4 games in a series causes the next game in the series to be scheduled; after 4 wins in all QF series, SF series are created automatically
