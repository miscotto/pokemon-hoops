# Season Mode Design

**Date:** 2026-03-22
**Status:** Approved

---

## Overview

Season mode is a long-form competitive format where up to 16 teams play a full round-robin regular season followed by a single-elimination playoff bracket. Each team's roster must use unique Pokémon — no Pokémon can appear on more than one team in the same season. Admins control season creation and pacing; everything else is automated.

---

## Approach

New parallel tables alongside the existing live tournament system. Zero changes to existing tournament tables or logic. All game simulation code (game-iterator, simulateMatchup, ability modifiers, type chart) is reused as-is.

---

## Data Model

### `seasons`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | text | Admin-provided |
| status | enum | `registration \| active \| playoffs \| completed` |
| maxTeams | int | Fixed at 16 |
| regularSeasonStart | timestamp | Set by admin at creation |
| regularSeasonEnd | timestamp | Set by admin at creation |
| playoffStart | timestamp | Set by admin at creation |
| playoffEnd | timestamp | Set by admin at creation |
| createdBy | text | Admin userId |
| registrationClosedAt | timestamp | Nullable; set when admin closes registration |
| createdAt | timestamp | |

### `season_teams`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| seasonId | UUID FK → seasons | |
| userId | text | |
| teamName | text | |
| rosterData | JSONB | Full roster snapshot at join time |
| wins | int | Default 0; updated after each game |
| losses | int | Default 0; updated after each game |
| pointsFor | int | Default 0; cumulative score |
| pointsAgainst | int | Default 0; cumulative score |
| result | enum | `waiting \| in_progress \| did_not_qualify \| eliminated \| finalist \| champion` |
| joinedAt | timestamp | |
| UNIQUE | | `(seasonId, userId)` |

**`result` state transitions:**
- `waiting` → set at join time
- `in_progress` → set when season starts (`status: "active"`)
- `did_not_qualify` → set when playoffs begin; applied to all teams ranked 9th or lower
- `eliminated` → set when team loses a playoff game
- `finalist` → set when team loses the Finals
- `champion` → set when team wins the Finals

### `season_locked_pokemon`
| Column | Type | Notes |
|---|---|---|
| seasonId | UUID FK → seasons | |
| pokemonId | int | |
| lockedByUserId | text | |
| lockedAt | timestamp | |
| PRIMARY KEY | | `(seasonId, pokemonId)` — DB-enforced uniqueness |

### `season_games`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| seasonId | UUID FK → seasons | |
| gameType | enum | `regular \| playoff` |
| team1UserId | text | Plain text (no FK to season_teams; consistent with existing tournament_games pattern) |
| team1Name | text | |
| team2UserId | text | |
| team2Name | text | |
| team1Score | int | Nullable until completed |
| team2Score | int | Nullable until completed |
| winnerId | text | Nullable until completed |
| status | enum | `pending \| in_progress \| completed` |
| scheduledAt | timestamp | When cron should pick this up |
| claimedAt | timestamp | Nullable; atomic cron lock |
| startedAt | timestamp | Nullable |
| completedAt | timestamp | Nullable |
| sweepNumber | int | 1–7; which of the 7 full round-robin sweeps this game belongs to (regular season only; null for playoffs) |
| round | int | Playoffs only (1=QF, 2=SF, 3=Finals); null for regular season |
| matchupIndex | int | Playoffs only; bracket position; null for regular season |

**Note on `sweepNumber`:** This is the round-robin sweep index (1–7), not a per-pair occurrence counter. All games in sweep 1 represent the first complete pass through all unique matchup pairs. Each sweep's games are shuffled independently.

**Note on team references:** `team1UserId`/`team2UserId` are plain text (not FK), matching the existing `tournament_games` schema pattern. The roster snapshot used for simulation is loaded from `season_teams.rosterData` by userId at simulation time, using the team enrollment state at the moment the season was started.

### `season_game_events`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| gameId | UUID FK → season_games | |
| sequence | int | |
| type | text | Same event types as tournament_game_events |
| data | JSONB | |
| createdAt | timestamp | |
| UNIQUE | | `(gameId, sequence)` |
| INDEX | | `gameId` — required for SSE polling performance |

---

## Season Lifecycle

### Phase 1: Registration (`status: "registration"`)
- Admin creates season: sets name, `regularSeasonStart`, `regularSeasonEnd`, `playoffStart`, `playoffEnd`
- Users can browse open seasons and join with a roster
- Users can leave at any time during registration
- Season auto-closes registration when 16 teams join (sets `registrationClosedAt`)

### Phase 2: Registration Closed
- `registrationClosedAt` is stamped; no new joins accepted
- Existing teams can still leave until admin starts the season
- Status remains `"registration"` until admin explicitly starts

### Phase 3: Season Start → `status: "active"`
- Admin triggers start
- **Minimum team requirement:** ≥9 teams (ensures at least 1 team finishes the regular season without qualifying for playoffs; 8 teams would mean all teams qualify, making the regular season meaningless)
- **Team snapshot:** The set of enrolled teams at the exact moment of start is the authoritative roster. Any teams that left between registration close and start are excluded. Schedule is generated only for enrolled-at-start teams.
- System generates all regular season games (see Schedule Generation) and inserts them with `scheduledAt` timestamps
- All `season_teams.result` values updated from `waiting` → `in_progress`
- Cron begins picking up games as their `scheduledAt` passes

### Phase 4: Regular Season (`status: "active"`)
- Cron runs every minute, claims and simulates pending games concurrently
- `season_teams` wins/losses/pointsFor/pointsAgainst updated after each game
- Live standings available throughout

### Phase 5: Playoff Transition Check (cron-driven)
- On each cron tick, after processing games, if `season.status = "active"`:
  - Check: `regularSeasonEnd <= NOW()` AND all `season_games WHERE gameType = 'regular'` have `status = 'completed'`
  - If both conditions are true → trigger playoff generation (see Playoff Schedule Generation)
  - This check runs on every tick until it fires; no separate scheduler needed
- Status → `"playoffs"`

### Phase 6: Playoffs (`status: "playoffs"`)
- Cron continues processing playoff games as their `scheduledAt` passes
- After each playoff round completes, next round's games are generated dynamically (same cron tick check pattern)

### Phase 7: Completed (`status: "completed"`)
- After Finals game completes, `season_teams.result` values set for champion/finalist/eliminated
- `seasons.status` → `"completed"`
- Season archived; no further game processing

---

## Schedule Generation (Regular Season)

For **n** enrolled teams (9 ≤ n ≤ 16):
- **Unique matchup pairs:** C(n, 2) = n × (n−1) / 2
- **7 sweeps:** C(n, 2) × 7 total games
- **Example — 16 teams:** C(16,2) × 7 = 120 × 7 = **840 games**
- **Example — 9 teams:** C(9,2) × 7 = 36 × 7 = **252 games**

**Timestamp distribution:**
- `totalGames = C(n, 2) × 7`
- `interval = (regularSeasonEnd - regularSeasonStart) / totalGames`
- `game[i].scheduledAt = regularSeasonStart + i × interval`

**Ordering:** Generate 7 sweeps. Within each sweep, list all C(n,2) pairs then shuffle the sweep. Concatenate sweeps in order. Assign `scheduledAt` sequentially. Set `sweepNumber` (1–7) per game.

All games inserted atomically at season start.

---

## Pokémon Locking (Join Flow)

When a user submits a roster to join a season:

1. Validate roster passes $160M salary cap
2. Within a transaction:
   a. Attempt INSERT of all 6 Pokémon into `season_locked_pokemon`
   b. Primary key `(seasonId, pokemonId)` guarantees atomicity — concurrent joins can't both claim the same Pokémon
   c. If any row conflicts (Pokémon already taken by another user), transaction rolls back; return error listing exactly which Pokémon are unavailable
   d. If all 6 succeed, insert `season_teams` row
3. Success: user is joined, Pokémon are locked

When a user leaves (registration phase only, before admin starts):
1. Delete their 6 rows from `season_locked_pokemon`
2. Delete their `season_teams` row
3. Those Pokémon are immediately available for other users

Users **cannot leave** once `status` is `"active"` or later.

---

## Cron Integration

`/api/cron/tick` is extended to process season games alongside tournament games:

**Game pickup:**
```
Query: season_games
  WHERE status = 'pending'
    AND scheduledAt <= NOW()
    AND claimedAt IS NULL
  LIMIT N
```
- Atomically set `claimedAt = NOW()` to prevent duplicate simulation
- Fire-and-forget `simulateSeasonGameLive()` via `waitUntil()` (same Vercel pattern)
- `simulateSeasonGameLive` reuses `game-iterator` and `simulateMatchup` directly
- After game completion, atomically update `season_teams` wins/losses/pointsFor/pointsAgainst

**Stale-claim recovery** (matching existing tournament pattern):
```
Query: season_games
  WHERE status = 'in_progress'
    AND claimedAt < NOW() - interval '800 seconds'
```
- Reset these rows: `status = 'pending'`, `claimedAt = NULL`
- Allows re-simulation of crashed/timed-out games

**Playoff transition check** (runs each tick, after game processing):
```
For each season WHERE status = 'active':
  IF regularSeasonEnd <= NOW()
    AND COUNT(season_games WHERE seasonId = id AND gameType = 'regular' AND status != 'completed') = 0
  THEN trigger playoff generation
```

---

## Playoff Schedule Generation

Triggered by cron when regular season transition check fires:

1. Sort `season_teams` by:
   - `wins DESC`
   - `(pointsFor - pointsAgainst) DESC` (point differential)
   - `pointsFor DESC` (total offense, third tiebreaker)
   - Random (final tiebreaker; deterministic per season via seeded random using seasonId)
2. Seeds 1–8 assigned; bracket: **1v8, 2v7, 3v6, 4v5**
3. Teams ranked 9th and lower → `result = "did_not_qualify"`
4. **Round 1 (Quarterfinals):** 4 games; timestamps spread across first third of `playoffStart → playoffEnd`
5. **Round 2 (Semifinals):** 2 games generated by cron after all QF games complete; spread across second third
6. **Round 3 (Finals):** 1 game generated after both SF games complete; spread across final third
7. After Finals: champion and finalist marked; `seasons.status = "completed"`

Each subsequent round is generated in the same cron tick that detects the previous round's completion (same advisory-lock pattern as existing `tryAdvanceRound`).

---

## Admin Authorization

Admin actions (create season, close registration, start season) are protected using the same pattern as existing `/api/admin` routes in the codebase. Implementers should reference the existing admin auth middleware/check rather than inventing a new approach.

---

## Admin Controls Summary

| Action | Requirement |
|---|---|
| Create season | Admin role; provide name + 4 dates |
| Close registration | Any time during registration phase |
| Start season | Registration phase; ≥9 teams enrolled |
| (All subsequent phases) | Fully automated |

---

## Key Constraints

- Max 16 teams per season; minimum 9 to start
- Salary cap: $160M per roster (enforced at join time)
- No Pokémon duplicates across teams (DB-enforced at join time, primary key constraint)
- Teams cannot leave after season starts
- All simulation code is shared with live tournaments; no duplication
- Schedule generation formula is variable: C(n,2) × 7 games for n enrolled teams

---

## Files Affected

**New files:**
- `src/lib/season-db.ts` — all season database queries
- `src/lib/simulate-season-game-live.ts` — season game simulation worker
- `src/app/api/seasons/route.ts` — list/create seasons
- `src/app/api/seasons/[id]/route.ts` — season details + standings
- `src/app/api/seasons/[id]/join/route.ts` — join with roster (Pokemon locking)
- `src/app/api/seasons/[id]/leave/route.ts` — leave season (unlock Pokemon)
- `src/app/api/seasons/[id]/start/route.ts` — admin: start season + generate schedule
- `src/app/api/seasons/[id]/close-registration/route.ts` — admin: close registration
- `src/app/api/seasons/[id]/games/route.ts` — list games
- `src/app/api/seasons/[id]/games/[gameId]/route.ts` — game details
- `src/app/api/seasons/[id]/games/[gameId]/stream/route.ts` — SSE stream (same pattern as live tournaments)
- `src/app/seasons/page.tsx` — season list / browse open seasons
- `src/app/seasons/[id]/page.tsx` — season detail: standings, schedule, status
- `src/app/seasons/[id]/games/[gameId]/page.tsx` — individual game view with live event stream

**Modified files:**
- `src/lib/schema.ts` — add 5 new tables (seasons, season_teams, season_locked_pokemon, season_games, season_game_events)
- `src/app/api/cron/tick/route.ts` — extend to process season games (pickup, stale recovery, playoff transition check)
