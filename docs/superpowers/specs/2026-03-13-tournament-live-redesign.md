# Tournament Live Redesign

**Date:** 2026-03-13
**Status:** Approved

## Overview

Redesign the tournament feature to feel genuinely live. All game events are pre-simulated at tournament start and stored in the DB. Playback is driven by a server-side `startedAt` timestamp so every viewer sees identical state at the same moment. No pause, skip, or rewind — the game plays itself out over exactly 5 minutes.

## Section 1: Data & Timing Model

### `displayAtMs` field on `GameEvent`

Add `displayAtMs: number` to the `GameEvent` interface in `tournamentEngine.ts`. This is milliseconds from game start (0–300,000). Because `events` is a JSON column, no DB migration is required.

### Timing assignment

`generateGameEvents` receives a `timingBudgetMs = 300_000` and distributes `displayAtMs` values across events using burst/lull modeling:

| Context | Inter-event gap |
|---|---|
| Scoring run (consecutive scores) | 600–1200ms |
| Defense play (block/steal/rebound) | 800–1500ms |
| Special event (clutch, momentum, ability) | 1500–3500ms |
| Quarter break / halftime | 4000ms fixed pause |
| Buzzer beater | placed at exactly 299,000ms |

All events must fit within 300,000ms total. The engine tracks a running `cursor` and advances it by the appropriate gap for each event type.

### Client timing computation

```ts
const elapsed = Date.now() - new Date(tournament.startedAt).getTime();
const visibleEvents = events.filter(e => e.displayAtMs <= elapsed);
const isDone = elapsed >= 300_000;
```

`tournament.startedAt` is already stored in the DB when a tournament starts.

## Section 2: Waiting Room (Leave / Rejoin)

### New endpoint: `DELETE /api/live-tournaments/[id]/leave`

- Auth required
- Removes caller's row from `live_tournament_teams` if tournament `status === "waiting"`
- Returns `400` if tournament is active or completed
- No cascade — other players unaffected

### Waiting room UI changes (`/tournaments/[id]`)

- Poll every 3s while `status === "waiting"` so team list stays live for all viewers
- Show "LEAVE TOURNAMENT" button only to current participants while waiting
  - Calls leave endpoint → re-fetches tournament state
- Anyone (authed or not) can view the waiting room page
- Rejoining uses the existing `POST /api/live-tournaments` flow — no changes needed

## Section 3: Live Game Playback

### Remove all playback controls

`GameDetailView` drops:
- PAUSE / RESUME button
- SKIP TO END button
- Progress bar

### Time-driven reveal

Client polls `/api/live-tournaments/{id}` every 750ms while a live game is open. On each poll:
1. Compute `elapsed = Date.now() - startedAt`
2. Filter events by `displayAtMs <= elapsed`
3. Render visible events; show "FINAL" when `elapsed >= 300_000`

All viewers watching the same game are synchronized because they all derive state from the same `startedAt` value.

### Box score tip-off bug fix

`computeBoxScore` skips events where `type` is one of:
`game_start | game_end | quarter_start | quarter_end | halftime`

These events use non-player `pokemonName` values ("Tip-off", "Halftime", etc.) and must never enter the player stats map.

### Completed game recap

The "VIEW RECAP" button in the bracket fetches stored events and renders them fully (all events visible immediately). This is read-only and unchanged from current behavior except the polling and time-gating are only active for live games.

## Section 4: Richer Event Engine

### New event varieties

All events use named players and opponents where applicable. Descriptions are flavor-specific:

**Blocks**
- `"{player} rises up and STUFFS the layup!"`
- `"{player} sends {opponent}'s shot into the stands!"`
- Type-flavored: Gengar phases, Alakazam predicts, Snorlax walls off

**Rebounds**
- Offensive: `"{player} crashes the glass for the put-back opportunity!"`
- Defensive: `"{player} secures the board and pushes the pace!"`
- Team rebound after block: chained close to the block event

**Steals**
- Pick-pocket: `"{player} reaches in and strips {opponent}!"`
- Deflection: `"{player} tips the pass — turnover {teamName}!"`
- Full steal + fast break: triggers a short burst sequence

**Assists**
- Two-player named: `"{assister} finds {scorer} cutting to the rim!"`
- Skip pass: `"{assister} throws the skip pass to {scorer} in the corner!"`
- Alley-oop setup: chains directly into a dunk event

**3-pointers**
- Corner three: `"{player} buries the corner three!"`
- Step-back: `"{player} creates space and nails the step-back three!"`
- Catch-and-shoot: `"{player} catches and fires — it's good!"`
- Logo three (rare): `"{player} from well beyond the arc — ARE YOU KIDDING?!"`

**Dunks**
- Power: `"{player} bulldozes to the rim and throws it DOWN!"`
- Alley-oop: `"{passer} lobs it up — {player} finishes with authority!"`
- Poster: `"{player} posterizes {opponent}! That'll be on the highlight reel!"`

**Clutch** (late-game only: last 45s, score within 8)
- `"{player} in the CLUTCH! Hits the tough mid-range with {time} left!"`
- `"{player} draws the foul — and-1 opportunity!"`
- Buzzer beater: `"BUZZER BEATER! {player} wins it at the horn for {teamName}!"`

**Fouls**
- Regular: `"{player} commits the foul. ({n}/6 personals)"`
- Intentional (last 30s, down 5+): `"Intentional foul by {player} — trying to stop the clock."`
- Foul out: `"{player} has fouled out! {teamName} is playing shorthanded."`

**Momentum**
- Scoring run: `"{teamName} on a {n}-0 run! Timeout called on the floor."`
- Crowd energy: `"The energy is electric — {teamName} feeding off it!"`
- Momentum shift after steal+score burst: `"{teamName} flips the game in 30 seconds!"`

**Ability triggers** — unchanged but richer descriptions pulled from abilities data.

### Burst timing for runs

When a steal, block, or momentum-shift event fires, the engine enters "burst mode" for the next 2–3 events, spacing them 600–900ms apart to simulate a fast break or scoring run.

### Probability rebalancing

| Category | Old % | New % |
|---|---|---|
| Scoring (2pt/3pt/dunk/layup) | 38% | 33% |
| Defense (block/steal/rebound) | 12% | 18% |
| Assists | 7% | 9% |
| Fouls | 7% | 7% |
| Special (clutch/hot hand/type adv/ability/rivalry/ally) | 8% | 10% |
| Momentum / narrative | 20% | 15% |
| Injury / fatigue | 8% | 8% |

## Files Affected

| File | Change |
|---|---|
| `src/app/utils/tournamentEngine.ts` | Add `displayAtMs` to `GameEvent`, rewrite `generateGameEvents` with burst timing + richer descriptions |
| `src/app/tournaments/[id]/page.tsx` | Remove pause/skip/progress bar, add time-driven polling, fix box score bug, add leave button |
| `src/app/api/live-tournaments/[id]/leave/route.ts` | New DELETE endpoint |
| `src/lib/tournament-db.ts` | New `leaveTournament(tournamentId, userId)` helper |

## Out of Scope

- WebSockets / SSE (polling at 750ms is sufficient)
- Any changes to admin tournament creation
- Bracket layout changes
- Any changes to roster building
