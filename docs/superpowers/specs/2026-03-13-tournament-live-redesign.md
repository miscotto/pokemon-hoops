# Tournament Live Redesign

**Date:** 2026-03-13
**Status:** Approved (v2 — spec review issues resolved)

## Overview

Redesign the tournament feature to feel genuinely live. All game events are pre-simulated at tournament start and stored in the DB. Playback is driven by a server-side `startedAt` timestamp so every viewer sees identical state at the same moment. No pause, skip, or rewind — the game plays itself out over exactly 5 minutes per round.

## Section 1: Data & Timing Model

### `displayAtMs` — parallel field on `GameEvent`

Add `displayAtMs: number` to the `GameEvent` interface in `tournamentEngine.ts`. This is **milliseconds from game start (0–300,000)** and is a **new, independent field** alongside the existing `gameTimeSec` / `clock` / `quarter` fields. The existing coordinate system (`gameSecToQuarter`, `gameSecToClock`, `QUARTER_DURATION`, `GAME_DURATION`) is **preserved unchanged**. `displayAtMs` is only used for client-side playback timing and has no effect on game-simulation logic.

Because `events` is a `jsonb` column, no DB migration is needed.

### Timing assignment in `generateGameEvents`

The function builds a running `cursorMs = 0` that advances after each event. The step size depends on the event type being emitted:

| Context | Inter-event gap |
|---|---|
| Scoring run / burst mode | 600–1200ms |
| Defense play (block/steal/rebound) | 800–1500ms |
| Special event (clutch, momentum, ability) | 1500–3500ms |
| Quarter break / halftime | 4000ms fixed |
| Buzzer beater | always `displayAtMs = 299_000` |

A `let burstRemaining = 0` counter tracks burst mode. When a steal, block, or momentum-shift fires, set `burstRemaining = Math.floor(rand(2, 4))`. While `burstRemaining > 0`, override the normal step to use the 600–1200ms scoring-run range and decrement `burstRemaining` by 1. Burst mode applies to the **next** events, not the triggering event itself.

All events must fit within `300_000ms`. If `cursorMs >= 300_000`, clamp to `299_000` for normal events. The loop ends when `cursorMs` would exceed `300_000`.

### Retire `computeCurrentEventIndex`

`computeCurrentEventIndex` and `LIVE_EVENT_INTERVAL` in `tournamentEngine.ts` are **deleted**. Nothing imports them externally (confirmed: only used internally). `GameDetailView` in `page.tsx` also drops its `eventIndex` + `setEventIndex` state machine entirely, replacing it with the `displayAtMs` filter described in Section 3.

### Multi-round timing — `startsAtOffsetMs` from round number

`tournament.startedAt` is a single timestamp set when the tournament starts. Games happen in sequential rounds. The client computes each game's virtual start using only the `round` field already stored in `tournamentGames`:

```ts
const ROUND_DURATION_MS = 300_000; // 5 minutes per game
const ROUND_BUFFER_MS  = 15_000;   // 15s between rounds
const roundOffset = (game.round - 1) * (ROUND_DURATION_MS + ROUND_BUFFER_MS);
const gameVirtualStartMs = new Date(tournament.startedAt).getTime() + roundOffset;
const elapsed = Date.now() - gameVirtualStartMs;
const visibleEvents = game.events.filter(e => e.displayAtMs <= elapsed);
const isDone = elapsed >= ROUND_DURATION_MS;
```

All games within the same round start simultaneously. This matches how `simulateAllRounds` works: it is called synchronously in `POST /api/live-tournaments` when the last player joins, iterates round by round, and completes all round-N games before creating round-N+1 rows. (The `POST /api/live-tournaments/[id]/games/[gameId]` endpoint is a separate lazy-simulation path that is not involved in the main flow.) No DB schema change required.

## Section 2: Waiting Room (Leave / Rejoin)

### New `leaveTournament` helper in `tournament-db.ts`

```ts
export async function leaveTournament(
  tournamentId: string,
  userId: string
): Promise<"left" | "not_in_tournament" | "already_started">
```

Deletes the user's row from `live_tournament_teams` where `tournamentId` and `userId` match, but only if the tournament `status = 'waiting'`. Returns `"left"` on success, `"not_in_tournament"` if no row existed, or `"already_started"` if the tournament is active/completed.

After deletion:
- `getUserActiveTournament(userId)` correctly returns `null` (row no longer exists — no extra update needed)
- `isRosterInActiveTournament(rosterId)` correctly returns `false`
- Re-joining uses `POST /api/live-tournaments` with `{tournamentId}` — since `getUserActiveTournament` now returns `null`, the existing double-join guard passes correctly

### New endpoint: `DELETE /api/live-tournaments/[id]/leave/route.ts`

File path: `src/app/api/live-tournaments/[id]/leave/route.ts`
The `[id]` directory already exists (`src/app/api/live-tournaments/[id]/route.ts`). The leave endpoint is a new file inside a new `leave/` subdirectory.

- Auth required (returns `401` if no session)
- Calls `leaveTournament(id, user.id)`
- Returns `200 { left: true }` on success
- Returns `400 { error: "Tournament already started" }` if result is `"already_started"`
- Returns `400 { error: "Not in tournament" }` if result is `"not_in_tournament"`

### Waiting room UI changes (`/tournaments/[id]`)

- Poll `/api/live-tournaments/{id}` every 3s while `status === "waiting"` so team list stays live
- Show "LEAVE TOURNAMENT" button only when: user is a participant AND `tournament.status === "waiting"`
  - On click: call `DELETE /api/live-tournaments/{id}/leave` → re-fetch tournament state
- Unauthenticated users can view the waiting room but see no join/leave buttons
- Rejoining uses the existing `POST /api/live-tournaments` with `{tournamentId}` — no changes

## Section 2b: API response — add `startedAt`

The `GET /api/live-tournaments/[id]` response for active/completed tournaments must include `startedAt`. Add to the response body in `src/app/api/live-tournaments/[id]/route.ts`:

```ts
startedAt: tournament.started_at?.toISOString() ?? null,
```

Add `startedAt: string | null` to the `TournamentState` interface in `page.tsx`.

## Section 3: Live Game Playback

### Remove all playback controls from `GameDetailView`

Delete:
- PAUSE / RESUME button and `playing` state
- SKIP TO END button and `skip` function
- Progress bar (`<div className="h-1.5 ...">`)
- `eventIndex` / `setEventIndex` state
- The `useEffect` that advances `eventIndex` on a timer

### Time-driven event reveal (replacing the index state machine)

`GameDetailView` receives the full `events` array from the parent. It polls `/api/live-tournaments/{tournamentId}/games/{gameId}` (the existing game-specific endpoint at `src/app/api/live-tournaments/[id]/games/[gameId]/route.ts`) every 750ms while the game is live.

The parent (`TournamentPage`) passes `tournament.startedAt` and `game.round` into `GameDetailView` so it can compute `gameVirtualStartMs`. On each 750ms tick:

```ts
const elapsed = Date.now() - gameVirtualStartMs;
const visibleEvents = allEvents.filter(e => e.displayAtMs <= elapsed);
const isDone = elapsed >= 300_000;
```

Stop polling when `isDone`. All viewers are synchronized because `gameVirtualStartMs` is derived from a shared server timestamp.

### `GameDetailView` props update

Add `startedAt: string` and `round: number` to the `ViewingGame` interface. These are populated in `handleViewGameData` — `startedAt` from `tournament.startedAt` (available in `TournamentPage` state after Section 2b), `round` from `matchup.round` (already on `MatchupState`).

### Which endpoint serves live polls

**750ms game poll** → `/api/live-tournaments/{id}/games/{gameId}` (returns `{ events, team1Score, team2Score, winnerId, status }`). Already exists at `src/app/api/live-tournaments/[id]/games/[gameId]/route.ts`. Response shape unchanged.

**5s bracket poll** → `/api/live-tournaments/{id}` (returns tournament + matchup statuses). Already exists. These are two independent polling loops. The waiting-room poll (Section 2) runs at **3s** — it is a third independent loop, only active while `status === "waiting"`.

### `LIVE_EVENT_INTERVAL` and related constants

`LIVE_EVENT_INTERVAL`, `LIVE_GAME_REAL_SECONDS`, and `LIVE_ROUND_BUFFER` are declared in `tournamentEngine.ts` lines 733–735. Only `LIVE_EVENT_INTERVAL` is used by `computeCurrentEventIndex` (which is deleted). `LIVE_GAME_REAL_SECONDS` and `LIVE_ROUND_BUFFER` are used only by `simulateConferenceRounds` and `simulateBracketForSize` — the old single-player bracket generation path that is **out of scope and untouched**. Delete only `computeCurrentEventIndex` and `LIVE_EVENT_INTERVAL`. Leave `LIVE_GAME_REAL_SECONDS`, `LIVE_ROUND_BUFFER`, `simulateConferenceRounds`, `simulateBracketForSize`, and `SerializedMatchup` as-is.

### Box score tip-off bug fix

In `computeBoxScore` (in `page.tsx`), add a type guard as the **first check** inside the event loop, before the `e.team !== side` check:

```ts
const STRUCTURAL_TYPES = new Set([
  "game_start", "game_end", "quarter_start", "quarter_end", "halftime"
]);
// inside the loop:
if (STRUCTURAL_TYPES.has(e.type)) continue;
```

`quarter_end` is in `GameEventType` but is never emitted by the engine — include it in the set anyway for safety.

### Completed game recap

"VIEW RECAP" in the bracket calls `handleViewGameData` as before. For completed tournaments/games, `isDone` is immediately `true` (elapsed ≥ 300,000ms since game started long ago), so all events are visible at once. No polling loop starts.

## Section 4: Richer Event Engine

### Probability rebalancing — cumulative `roll` thresholds

Replace the current hard-coded `if/else if` ladder with these new boundaries:

| Category | New % | `roll <` threshold |
|---|---|---|
| Scoring (2pt/3pt/dunk/layup) | 33% | `0.33` |
| Defense (block/steal/rebound) | 18% | `0.51` |
| Assists | 9% | `0.60` |
| Fouls | 7% | `0.67` |
| Special (clutch/hot_hand/type_adv/ability/rivalry/ally) | 10% | `0.77` |
| Momentum / narrative | 15% | `0.92` |
| Injury / fatigue | 8% | `1.00` (else branch) |

### New event descriptions

All events use the active player's name; blocks, dunks, and posters additionally name the defender/victim using `pick(opponent.roster)`.

**Blocks** (added to defense branch, ~35% of defense events):
```
"{player} rises up and STUFFS the layup attempt!"
"{player} sends {opponent}'s shot into the stands!"
"{player}'s {type1} typing gives it extra authority — rejected!"
```

**Rebounds** (defensive vs offensive variants):
```
// Defensive
"{player} secures the defensive board and pushes the pace!"
"{player} grabs the rebound — possession change!"
// Offensive
"{player} crashes the glass for the offensive board!"
"{player} tips it back in for the put-back!"
```

**Steals**:
```
"{player} reaches in and strips {opponent}!"
"{player} tips the pass — {teamName} turnover!"
"{player} read the play perfectly — clean steal!"
```
Steal events set `burstRemaining = 2` (fast break follow-up).

**Assists** (named two-player plays — `assister` is the active player, `scorer` is a second random teammate):
```
"{assister} threads the needle to {scorer} cutting to the rim!"
"{assister} fires the skip pass — {scorer} is wide open in the corner!"
"{assister} lobs it — {scorer} throws it DOWN!" // chains with a dunk
```

**3-pointers** (sub-variants inside existing `score_3pt` branch):
```
"{player} buries the corner three — {teamName} extends the lead!"
"{player} step-back three from the logo — ARE YOU KIDDING?!"
"{player} catches and fires — good!"
"{player} off the screen, pulls up — BANG! Three-ball!"
```

**Dunks** (sub-variants inside `dunk` branch):
```
"{player} bulldozes baseline and throws it DOWN on {opponent}!"
"{assister} lobs it — {player} finishes with authority!"
"{player} posterizes {opponent}! That's a poster!"
```

**Clutch** (only fires when `gameSec > GAME_DURATION * 0.9` and `|homeScore - awayScore| <= 8`):
```
"{player} in the CLUTCH — hits the tough mid-range with {clock} left!"
"{player} draws the foul — and-1 opportunity!"
```

**Buzzer beater** (tie-break logic, placed at `displayAtMs = 299_000`):
```
"BUZZER BEATER! {player} wins it at the horn for {teamName}!"
```
The existing tie-break `if (homeScore === awayScore)` block at the end of `generateGameEvents` assigns `displayAtMs = 299_000` directly (not via the cursor).

**Fouls**:
```
// Regular
"{player} commits the foul. ({n}/6 personals)"
// Intentional (last 30s, losing by 5+)
"Intentional foul by {player} — {teamName} trying to stop the clock."
// Foul out
"{player} has fouled out! {teamName} is playing shorthanded."
```

**Momentum** (richer narratives, multiple templates):
```
"{teamName} on a {n}-0 run! Timeout called on the floor."
"The energy is electric — {teamName} feeding off it!"
"{teamName} flips the game in 30 seconds!"
"Great ball movement from {teamName} — defense can't keep up!"
"Coach {teamName} calls a timeout to regroup."
"{player} firing up the crowd!"
```
Momentum-shift events (when `side` just had 3+ consecutive scoring events) set `burstRemaining = 2`.

**Ability triggers** — unchanged behavior, descriptions remain pulled from `abilities.json`.

## Files Affected

| File | Change |
|---|---|
| `src/app/utils/tournamentEngine.ts` | Add `displayAtMs` to `GameEvent`; rewrite `generateGameEvents` with cursor + burst mode + richer descriptions; delete `computeCurrentEventIndex` + `LIVE_EVENT_INTERVAL` only |
| `src/app/tournaments/[id]/page.tsx` | Drop `eventIndex` state machine + controls; add time-driven 750ms polling; thread `startedAt`/`round` through `ViewingGame`; fix box score type guard; add leave button in waiting room; add 3s waiting-room poll |
| `src/app/api/live-tournaments/[id]/route.ts` | Add `startedAt` to GET response for active/completed tournaments |
| `src/app/api/live-tournaments/[id]/leave/route.ts` | New DELETE endpoint |
| `src/lib/tournament-db.ts` | New `leaveTournament(tournamentId, userId)` helper returning `"left" \| "not_in_tournament" \| "already_started"` |

## Out of Scope

- WebSockets / SSE
- Admin tournament creation changes
- Bracket layout changes
- Roster building changes
- DB schema migrations (no new columns needed)
