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
| `GET /api/cron/tick` | Fires every 30s via Vercel Cron; detects rounds to start; dispatches background simulations |
| `simulateGameLive(gameId)` | Long-running background function (~300s); generates events one at a time with real sleeps; writes to DB incrementally |
| `GET /api/live-tournaments/[id]/games/[gameId]/stream` | SSE endpoint; sends initial burst of existing events then polls DB every 500ms for new ones |
| `GameDetailView` (frontend) | Subscribes via `EventSource`; appends events as they arrive; no clock math |
| Vercel Cron config (`vercel.json`) | Schedules `/api/cron/tick` every 30s |

### Data Flow

```
Player joins → tournament starts → game rows created (status: pending) → NO simulation

Cron fires (every 30s)
  └─ finds pending games whose round window has opened
  └─ claimGame() atomically per game
  └─ waitUntil(simulateGameLive(gameId))  ← concurrent, one per game

simulateGameLive(gameId) [runs ~300s in background]
  └─ loads team rosters from DB
  └─ initializes in-memory state: scores, momentum, injuries, sequence counter
  └─ loop: generate next event → INSERT into tournament_game_events → sleep
  └─ on finish: writeGameResult() → check if round done → appendNextRound()

Client opens game view
  └─ GET /api/.../stream
      └─ burst: all existing tournament_game_events for this game
      └─ poll loop: SELECT events WHERE sequence > $last every 500ms → stream
      └─ close on game_end event + status = completed

Next cron tick picks up next-round pending games automatically
```

---

## DB Schema Changes

### New table: `tournament_game_events`

```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
game_id     uuid NOT NULL REFERENCES tournament_games(id)
sequence    integer NOT NULL
type        text NOT NULL
data        jsonb NOT NULL
created_at  timestamptz NOT NULL DEFAULT now()

INDEX (game_id, sequence)
INDEX (game_id, created_at)
```

Events are written here incrementally, one per simulation step.

### Changes to `tournament_games`

- **Remove** `events` jsonb column — events now live in `tournament_game_events`
- **Add** `started_at` timestamptz — when simulation actually began (distinct from `tournament.started_at`)

### `GameEvent` type

- **Remove** `displayAtMs` field — timing is now wall-clock, not a pre-computed offset
- All other fields unchanged

---

## Cron Job

**Endpoint:** `GET /api/cron/tick`
**Schedule:** Every 30s via `vercel.json`

```json
{
  "crons": [{ "path": "/api/cron/tick", "schedule": "*/1 * * * *" }]
}
```

**Logic:**
1. Query all tournaments with `status = "active"`
2. For each tournament, compute which round is currently active based on `tournament.started_at` + cumulative round offsets (each round = 300s game + 15s buffer)
3. Query `tournament_games` where `round = active_round AND status = "pending"`
4. For each pending game: `claimGame()` atomically; if claimed → `waitUntil(simulateGameLive(gameId))`
5. Return 200 immediately

The 30s cron interval means a round could start up to 30s late — acceptable given the 5-minute game window.

**Round timing formula:**
```
roundStartOffset(r) = (r - 1) * (300 + 15) seconds from tournament.started_at
```

---

## Background Simulation: `simulateGameLive`

Refactor `generateGameEvents` in `tournamentEngine.ts` from "generate all at once" into a **step iterator** that returns one event at a time, maintaining mutable state between calls.

**State maintained in memory** (for duration of the function):
- `homeScore`, `awayScore`
- `homeMomentum`, `awayMomentum`
- `statsMap` (per-player stats including injury/foul-out tracking)
- `sequence` counter
- Structural event tracking (`halftimeDone`, `quarterStartsDone`)

**Sleep timing between events:**

| Event type | Sleep duration |
|---|---|
| `quarter_start`, `quarter_end`, `halftime` | 3–5s |
| `score_2pt`, `score_3pt`, `dunk`, `layup`, `clutch` | 1.5–2.5s |
| `block`, `steal`, `rebound` | 1.2–2s |
| Other | 2–4s |

Total sleep budget across ~150 events ≈ 300s (5 minutes). Sleep durations are scaled to fit within the game window.

**On completion:**
1. Write `game_end` event
2. Call `writeGameResult()` — writes final scores, winner, marks game `completed`
3. Check if all games in the round are `completed`
4. If yes → `appendNextRound()` with winners (next cron tick starts round N+1)
5. If this was the final round → `completeTournament()`

---

## SSE Endpoint

**Route:** `GET /api/live-tournaments/[id]/games/[gameId]/stream`

**SSE event types:**

```
event: game_state
data: { "status": "in_progress", "team1Score": 0, "team2Score": 0 }

event: game_event
data: { "sequence": 1, "type": "score_2pt", "quarter": 1, "clock": "11:32", ... }

event: game_end
data: { "team1Score": 112, "team2Score": 98, "winnerId": "..." }
```

**Flow:**
1. Query `tournament_games` for current scores and status (initial `game_state` event)
2. Query all existing `tournament_game_events` — send as immediate burst
3. Poll loop every 500ms:
   - `SELECT * FROM tournament_game_events WHERE game_id = $1 AND sequence > $lastSequence ORDER BY sequence`
   - Stream any new events
   - If `game.status = completed` and no pending events → send `game_end` → close
4. Check `req.signal.aborted` each iteration — stop polling on client disconnect

---

## Frontend Changes

### `GameDetailView`

- Replace 750ms polling interval + `displayAtMs` filter with `EventSource`
- Replace 200ms clock ticker + `computeLiveClock` with clock from latest received event (`event.quarter` / `event.clock`)
- `isDone` set by `game_end` SSE event, not clock math
- `allEvents` state appended to as SSE events arrive
- `EventSource` closed on component unmount or `game_end`

### Bracket status (`MatchupCard` / `GET /api/live-tournaments/[id]`)

- No change needed — `game.status` in DB is now accurate in real time (`pending` → `in_progress` → `completed`)
- Existing 5s bracket polling already reflects live status correctly

---

## What Gets Removed

| Item | Location |
|---|---|
| `simulateAllRounds()` | `POST /api/live-tournaments` |
| `displayAtMs` | `GameEvent` type, `tournamentEngine.ts`, `page.tsx` |
| `ROUND_DURATION_MS`, `ROUND_BUFFER_MS`, `gameVirtualStartMs`, `computeLiveClock` | `page.tsx` |
| 750ms polling interval + 200ms clock ticker | `GameDetailView` |
| `events` jsonb column | `tournament_games` DB table |

---

## What Stays the Same

- All simulation math: team factors, event type probabilities, scoring, momentum, ability triggers
- `claimGame()`, `appendNextRound()`, `completeTournament()` DB functions
- `EventFeed`, `BoxScore`, `MatchupCard`, `BracketView` UI components
- Tournament join / lobby flow
- `GET /api/live-tournaments/[id]/games/[gameId]` route (kept for direct game data fetches)

---

## Error Handling

- **Simulation crash mid-game:** Game stays `in_progress`. Next cron tick skips it (already claimed). Add a `claimed_at` timestamp + 10-minute timeout: cron resets stale `in_progress` games back to `pending` for retry.
- **Cron fires while simulation running:** `claimGame()` is atomic — second claim returns null, safely skipped.
- **Client disconnect:** SSE poll loop checks `req.signal.aborted` and exits cleanly.
- **No viewers:** Simulation runs entirely in background via `waitUntil` — independent of client connections.

---

## Out of Scope

- WebSockets (SSE is one-way server→client, sufficient here)
- Redis / pub-sub (DB polling at 500ms is adequate for this event rate)
- True per-event real-time generation with sub-second precision
