# Live Tournament SSE Design

**Date:** 2026-03-13
**Status:** Approved
**Scope:** Replace upfront tournament simulation with real-time event generation streamed via Server-Sent Events

---

## Problem

The current system simulates all tournament games synchronously when the last player joins. All rounds, all events, and all scores are written to the database immediately and marked `completed` before the API even returns. The "live" experience is a client-side illusion using `displayAtMs` offsets. Any page reading game status from the DB sees games as done instantly.

---

## Goal

Games simulate in real time during their scheduled time window. Events are written to the DB one at a time as they occur. Clients receive events via SSE as they are generated. The DB is the live source of truth — no client-side clock math.

---

## Deployment

Vercel Pro — supports streaming functions up to 800s. A 5-minute game (300s) is well within budget.

---

## Architecture

### Components

| Component | Responsibility |
|---|---|
| `GET /api/cron/tick` | Fires every 1 minute via Vercel Cron; detects rounds to start; dispatches background simulations |
| `simulateGameLive(gameId)` | Long-running background function (~300s); generates events one at a time with real sleeps; writes to DB incrementally |
| `GET /api/live-tournaments/[id]/games/[gameId]/stream` | SSE endpoint; sends initial burst of existing events then polls DB every 500ms for new ones |
| `GameDetailView` (frontend) | Subscribes via `EventSource`; appends events as they arrive; no clock math |
| `vercel.json` | New file — schedules `/api/cron/tick` every minute |

### Data Flow

```
Player joins → tournament starts → game rows created (status: pending) → NO simulation

Cron fires (every 1 minute)
  └─ finds pending games whose round window has opened
  └─ claimGame() atomically per game (sets status in_progress + claimed_at)
  └─ waitUntil(simulateGameLive(gameId))  ← concurrent, one per game, fire-and-forget

simulateGameLive(gameId) [runs ~300s in background]
  └─ loads team rosters from DB
  └─ initializes in-memory state: scores, momentum, injuries, sequence counter
  └─ loop: generate next event → INSERT into tournament_game_events → sleep
  └─ wall-clock guard: if elapsed ≥ 280s, flush remaining events with 0 sleep
  └─ on finish: writeGameResult() (no events param) → tryAdvanceRound(round)

tryAdvanceRound(tournamentId, round) [atomic]
  └─ DB-level atomic check: are all games in this round completed?
  └─ if yes (and not already advanced): appendNextRound() or completeTournament()

Cron also handles stale recovery:
  └─ games with status=in_progress and claimed_at > 800s ago → reset to pending

Client opens game view
  └─ GET /api/.../stream  (public endpoint, no auth required)
      └─ burst: current game_state + all existing tournament_game_events for this game
      └─ poll loop: SELECT events WHERE sequence > $last every 500ms → stream
      └─ game_end event written BEFORE writeGameResult sets status=completed
      └─ close when game_end event sent
```

---

## DB Schema Changes

### New table: `tournament_game_events`

**Drizzle schema:**
```ts
export const tournamentGameEvents = pgTable(
  "tournament_game_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id").notNull().references(() => tournamentGames.id),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    gameSequenceUniq: unique().on(t.gameId, t.sequence),  // prevents duplicate on retry
    gameIdIdx: index().on(t.gameId),
    gameSeqIdx: index().on(t.gameId, t.sequence),
  })
);
```

Events are written here incrementally, one per simulation step.

### Changes to `tournament_games`

- **Remove** `events` jsonb column — events now live in `tournament_game_events`
- **Add** `started_at` timestamptz — when simulation actually began
- **Add** `claimed_at` timestamptz — set by `claimGame()` for stale-game recovery

### Changes to `claimGame()`

Must be updated to also set `claimed_at = now()`:
```ts
.set({ status: "in_progress", claimedAt: new Date() })
```

### Changes to `writeGameResult()`

Remove the `events` parameter — events are now in `tournament_game_events`:
```ts
// Before: writeGameResult(gameId, team1Score, team2Score, winnerId, events)
// After:  writeGameResult(gameId, team1Score, team2Score, winnerId)
```

### `GameEvent` type

- **Remove** `displayAtMs` field — timing is now wall-clock
- All other fields unchanged
- `BoxScore` / `EventFeed` receive `GameEvent[]` incrementally (appended as SSE events arrive); the `computeBoxScore` `allEvents` parameter receives the same growing array — no behavior change needed

### Migration note

The `events` jsonb column removal is a breaking change for any already-completed tournaments. Before running the migration:
- If data preservation is needed: write a one-time script to backfill `tournament_game_events` from existing `events` jsonb rows
- If not needed: truncate existing tournament data before applying the migration
- New `GET /api/live-tournaments/[id]/games/[gameId]` route must query `tournament_game_events` instead of `game.events`

---

## New dependency

```bash
npm install @vercel/functions
```

Used in the cron route for `waitUntil`:
```ts
import { waitUntil } from "@vercel/functions";
```

---

## Vercel Configuration

**New file: `vercel.json`** at project root:
```json
{
  "crons": [{ "path": "/api/cron/tick", "schedule": "*/1 * * * *" }]
}
```

Note: Vercel Cron minimum granularity is 1 minute. The worst-case delay for a round starting is ~60s — acceptable for a 5-minute game window.

**Route-level max duration** — add to each long-running route file:
```ts
export const maxDuration = 800; // required in Next.js 14 for Vercel Pro
```

Required in:
- `src/app/api/cron/tick/route.ts`
- `src/app/api/live-tournaments/[id]/games/[gameId]/stream/route.ts`

---

## Cron Job

**File:** `src/app/api/cron/tick/route.ts`
**Schedule:** Every 1 minute

**Logic:**
1. Query all tournaments with `status = "active"`
2. For each tournament, compute which round is currently active based on `tournament.started_at` + cumulative round offsets (each round = 300s game + 15s buffer)
3. Reset stale games: `UPDATE tournament_games SET status='pending', claimed_at=NULL WHERE status='in_progress' AND claimed_at < now() - interval '800 seconds'`
4. Query `tournament_games` where `round = active_round AND status = "pending"`
5. For each pending game: `claimGame()` atomically; if claimed → `waitUntil(simulateGameLive(gameId))`
6. Return 200 immediately

**Round timing formula:**
```
roundStartOffset(r) = (r - 1) * (300 + 15) seconds from tournament.started_at
```

---

## Background Simulation: `simulateGameLive`

**File:** `src/lib/simulate-game-live.ts`

**Signature:**
```ts
export async function simulateGameLive(gameId: string): Promise<void>
```

Internally fetches both teams' roster data from DB using `getTeamRosterData()`. Constructs `TournamentTeam` objects the same way the current `simulateAllRounds` does.

**Refactor of `tournamentEngine.ts`:**

Extract the per-event generation logic from `generateGameEvents` into a step function:
```ts
export function createGameIterator(
  homeTeam: TournamentTeam,
  awayTeam: TournamentTeam
): { next(): GameEvent | null }
```

Maintains all mutable state (scores, momentum, statsMap, halftimeDone, etc.) in closure. Returns `null` when the game is complete. `simulateGameLive` calls `iterator.next()` in a loop.

**Sleep timing between events:**

| Event type | Sleep duration |
|---|---|
| `quarter_start`, `quarter_end`, `halftime` | 3–5s |
| `score_2pt`, `score_3pt`, `dunk`, `layup`, `clutch` | 1.5–2.5s |
| `block`, `steal`, `rebound` | 1.2–2s |
| Other | 2–4s |

Total sleep budget across ~150 events ≈ 300s (5 minutes).

**Wall-clock deadline guard:**

```ts
const startMs = Date.now();
const DEADLINE_MS = 280_000; // flush remaining events if approaching Vercel limit

// In loop:
const remaining = DEADLINE_MS - (Date.now() - startMs);
if (remaining <= 0) {
  // flush all remaining events with 0 sleep
}
```

**Ordering guarantee for `game_end`:**

The `game_end` event row must be INSERTed into `tournament_game_events` BEFORE calling `writeGameResult()` which sets `status = "completed"`. This ensures any SSE client polling for `completed` status can always find the `game_end` row.

**On completion:**
1. INSERT `game_end` event into `tournament_game_events`
2. Call `writeGameResult(gameId, homeScore, awayScore, winnerId)` — no events param
3. Call `tryAdvanceRound(tournamentId, round)`

**Crash recovery:**

If the function crashes mid-game, partial `tournament_game_events` rows remain. When the cron resets the game back to `pending` and re-dispatches:
1. Delete all existing `tournament_game_events` for that `game_id`
2. Clear `started_at` on the game row (reset to null)
3. Re-simulate from sequence 0

The `UNIQUE(game_id, sequence)` constraint provides a safety net against silent corruption in any other scenario.

**`waitUntil` and `maxDuration` scope:** `simulateGameLive` runs inside the cron route's `waitUntil()` call and inherits the cron route's `maxDuration = 800` budget. No separate export is needed for `simulateGameLive` itself.

**Iterator tie-breaking and post-loop events:** The `createGameIterator` must handle post-loop events (buzzer-beater tie-breaker and `game_end`) as part of the iterator's own state machine, not as an afterthought. The iterator should have an internal phase (`playing` → `tiebreak_check` → `game_end` → `done`) so `next()` returns all events in sequence before returning `null`.

---

## Round Advancement: `tryAdvanceRound`

**File:** `src/lib/tournament-db.ts` (new function)

**Signature:**
```ts
export async function tryAdvanceRound(
  tournamentId: string,
  completedRound: number
): Promise<void>
```

Uses a PostgreSQL advisory lock to prevent the double-call race when multiple concurrent games finish simultaneously. `SELECT COUNT(*) ... FOR UPDATE` does not acquire row-level locks in PostgreSQL — an advisory lock is the correct mechanism:

```ts
await db.transaction(async (tx) => {
  // Advisory lock keyed on (tournamentId, round) — released at end of transaction
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${tournamentId || ":" || completedRound}))`
  );

  // Now safely check if all games in the round are done
  const pending = await tx
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(tournamentGames)
    .where(
      and(
        eq(tournamentGames.tournamentId, tournamentId),
        eq(tournamentGames.round, completedRound),
        ne(tournamentGames.status, "completed")
      )
    );

  if (pending[0].count > 0) return; // other games still running

  // Advance: appendNextRound or completeTournament (both called within tx)
  const tournament = await getTournament(tournamentId); // reads inside tx
  if (completedRound < tournament!.bracket_data.totalRounds) {
    await appendNextRound(tournamentId, completedRound + 1, winners, tx);
  } else {
    await completeTournament(tournamentId, tx);
  }
});
```

`appendNextRound` and `completeTournament` must be updated to accept an optional Drizzle transaction context (`tx`) so the entire check + advance is atomic. This prevents the partial-update risk of `appendNextRound`'s current read-modify-write on `bracketData`.

This replaces the inline round-advancement logic currently in `simulateAllRounds`.

---

## SSE Endpoint

**File:** `src/app/api/live-tournaments/[id]/games/[gameId]/stream/route.ts`

**Authentication:** Public — no auth required (consistent with the existing `GET /api/live-tournaments/[id]` route which is also public).

**SSE event types:**

```
event: game_state
data: {
  "status": "in_progress",
  "team1Score": 0,
  "team2Score": 0,
  "team1Name": "Bay Area Currents",
  "team2Name": "NY Thunderbolts",
  "round": 1
}

event: game_event
data: { "sequence": 1, "type": "score_2pt", "quarter": 1, "clock": "11:32", ... }

event: game_end
data: { "team1Score": 112, "team2Score": 98, "winnerId": "..." }
```

**Flow:**
1. Load current game metadata from `tournament_games` → send `game_state` event
2. Query all existing `tournament_game_events` ORDER BY sequence → send each as `game_event` (initial burst for late joiners — Option C from design)
3. Track `$lastSequence`
4. Poll loop every 500ms:
   - `SELECT * FROM tournament_game_events WHERE game_id = $1 AND sequence > $lastSequence ORDER BY sequence`
   - Stream any new `game_event` messages
   - Update `$lastSequence`
   - Check `req.signal.aborted` — exit if client disconnected
   - If `game_end` event received (type = `game_end` in the new events) → send `game_end` SSE → close stream
5. Must use the **pooled** DB connection string (not direct) to avoid exhausting connection limits under concurrent viewers

**DB adapter for SSE endpoint:** Use `dbHttp` from `@/lib/db-http` (neon-http transport). Each 500ms poll becomes a stateless HTTP request to Neon — no persistent WebSocket connection held open for the full 300s stream duration. This avoids exhausting the Neon WebSocket pool under concurrent viewers. The `db` (WebSocket Pool) from `@/lib/db` is used in `simulateGameLive` and `tryAdvanceRound` where Drizzle transactions are required.

---

## Frontend Changes

### `GameDetailView`

- Remove `displayAtMs` filter, `now` state, 200ms clock ticker, `ROUND_DURATION_MS`, `ROUND_BUFFER_MS`, `gameVirtualStartMs`, `computeLiveClock`
- Replace 750ms polling interval with `EventSource` subscription
- `isDone` set to `true` on `game_end` SSE event
- `allEvents` state: append each incoming `game_event` to array
- Live clock: display `event.quarter` / `event.clock` from the latest received event directly
- `EventSource` closed on component unmount and on `game_end`

### Bracket status (`MatchupCard` / `GET /api/live-tournaments/[id]`)

No change needed — `game.status` in DB is now accurate in real time. The existing 5s bracket polling reflects live status correctly.

---

## Updated Route: `GET /api/live-tournaments/[id]/games/[gameId]`

Currently returns `game.events` from the jsonb column. After removing that column, must be updated to:
```ts
const events = await db
  .select()
  .from(tournamentGameEvents)
  .where(eq(tournamentGameEvents.gameId, gameId))
  .orderBy(asc(tournamentGameEvents.sequence));
```

---

## What Gets Removed

| Item | Location |
|---|---|
| `simulateAllRounds()` | `POST /api/live-tournaments` |
| `displayAtMs` | `GameEvent` type, `tournamentEngine.ts`, `page.tsx` |
| `ROUND_DURATION_MS`, `ROUND_BUFFER_MS`, `gameVirtualStartMs`, `computeLiveClock` | `page.tsx` |
| 750ms polling interval + 200ms clock ticker | `GameDetailView` |
| `events` jsonb column | `tournament_games` DB table |
| `events` param from `writeGameResult()` | `tournament-db.ts` |

---

## What Stays the Same

- All simulation math: team factors, event type probabilities, scoring, momentum, ability triggers (restructured into iterator, logic unchanged)
- `appendNextRound()`, `completeTournament()` DB functions (unchanged)
- `claimGame()` logic — updated to also set `claimed_at` (additive change)
- `EventFeed`, `BoxScore`, `MatchupCard`, `BracketView` UI components
- Tournament join / lobby flow
- `BracketStructure` type in `tournament-db.ts`

---

## Error Handling

| Scenario | Handling |
|---|---|
| Simulation crash mid-game | `claimed_at` timeout (800s) in cron resets game to `pending`; restart deletes partial `tournament_game_events` rows and re-simulates from sequence 0 |
| Cron fires while simulation running | `claimGame()` is atomic — second claim returns null, safely skipped |
| Two games finish simultaneously (round advancement race) | `tryAdvanceRound` uses DB transaction with `pg_advisory_xact_lock` keyed on `(tournamentId, round)` |
| Client disconnect | SSE poll loop checks `req.signal.aborted` each iteration |
| Event count exceeds sleep budget | Wall-clock guard at 280s flushes remaining events with 0 sleep |
| Duplicate sequence on retry | `UNIQUE(game_id, sequence)` constraint prevents silent corruption |
| `game_end` / `status=completed` ordering | `game_end` event row inserted before `writeGameResult()` — ordering guaranteed |

---

## Out of Scope

- WebSockets (SSE is one-way server→client, sufficient here)
- Redis / pub-sub (DB polling at 500ms is adequate for this event rate)
- Sub-minute cron precision (Vercel minimum is 1 minute; up to 60s round-start delay is acceptable)
