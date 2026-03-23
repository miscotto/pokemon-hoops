# Season Mode Design

**Date:** 2026-03-22
**Status:** Approved

---

## Overview

Season mode is a long-form competitive format where 16 teams play a full round-robin regular season followed by a single-elimination playoff bracket. Each team's roster must use unique Pokémon — no Pokémon can appear on more than one team in the same season. Admins control season creation and pacing; everything else is automated.

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
| result | enum | `waiting \| in_progress \| eliminated \| finalist \| champion` |
| joinedAt | timestamp | |
| UNIQUE | | `(seasonId, userId)` |

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
| team1UserId | text | |
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
| playNumber | int | 1–7 (regular season only; which of the 7 matchups) |
| round | int | Playoffs only (1=QF, 2=SF, 3=Finals) |
| matchupIndex | int | Playoffs only; bracket position |

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

---

## Season Lifecycle

### Phase 1: Registration (`status: "registration"`)
- Admin creates season: sets name, `regularSeasonStart`, `regularSeasonEnd`, `playoffStart`, `playoffEnd`
- Users can browse open seasons and join with a roster
- Users can leave at any time during registration
- Season closes when admin sets `registrationClosedAt` (or 16 teams join, auto-closing)

### Phase 2: Registration Closed
- `registrationClosedAt` is stamped; no new joins accepted
- Existing teams can still leave
- Status remains `"registration"` until admin explicitly starts the season

### Phase 3: Season Start → `status: "active"`
- Admin triggers start; requires ≥9 teams enrolled
- System generates all regular season games and inserts them with `scheduledAt` timestamps
- Cron begins picking up games as their `scheduledAt` passes

### Phase 4: Regular Season (`status: "active"`)
- Cron runs every minute, claims and simulates pending games concurrently
- `season_teams` wins/losses/pointsFor/pointsAgainst updated after each game
- Live standings available throughout

### Phase 5: Playoffs (`status: "playoffs"`)
- Auto-triggered when: all regular season games are `completed` AND `regularSeasonEnd` has passed
- System computes final standings, seeds top 8, generates Round 1 games
- Subsequent rounds generated dynamically as each round completes

### Phase 6: Completed (`status: "completed"`)
- After Finals completes, champion and finalist are marked on `season_teams`
- Season archived; no further game processing

---

## Schedule Generation (Regular Season)

With 16 teams:
- **Unique matchup pairs:** C(16, 2) = 120
- **7 repetitions:** 120 × 7 = **840 total games**
- **Timestamp distribution:** `interval = (regularSeasonEnd - regularSeasonStart) / 840`; `game[i].scheduledAt = regularSeasonStart + i * interval`
- Each "round" of 120 games is shuffled independently before ordering to avoid same-team back-to-back games
- All 840 rows inserted atomically at season start

---

## Pokémon Locking (Join Flow)

When a user submits a roster to join a season:

1. Validate roster passes $160M salary cap
2. Within a transaction:
   a. Attempt INSERT of all 6 Pokémon into `season_locked_pokemon`
   b. Primary key `(seasonId, pokemonId)` guarantees atomicity — concurrent joins can't both claim the same Pokémon
   c. If any row conflicts (Pokémon already taken), transaction rolls back; return error listing exactly which Pokémon are unavailable
   d. If all 6 succeed, insert `season_teams` row
3. Success: user is joined, Pokémon are locked

When a user leaves (registration phase only):
1. Delete their 6 rows from `season_locked_pokemon`
2. Delete their `season_teams` row
3. Those Pokémon are immediately available for other users

Users **cannot leave** once `status` is `"active"` or later.

---

## Cron Integration

`/api/cron/tick` is extended to process season games alongside tournament games:

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
- After game completion, atomically update `season_teams` wins/losses/points

---

## Playoff Schedule Generation

Triggered automatically after regular season completes:

1. Sort `season_teams` by `wins DESC`, then `(pointsFor - pointsAgainst) DESC`
2. Seeds 1–8 assigned; bracket: **1v8, 2v7, 3v6, 4v5**
3. **Round 1 (Quarterfinals):** 4 games, timestamps spread across first third of `playoffStart → playoffEnd`
4. **Round 2 (Semifinals):** 2 games generated dynamically after all QF games complete; spread across second third
5. **Round 3 (Finals):** 1 game generated after both SF games complete; spread across final third
6. Champion marked → `seasons.status = "completed"`

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

- Max 16 teams per season
- Salary cap: $160M per roster (enforced at join time)
- No Pokémon duplicates across teams (DB-enforced at join time)
- Minimum 9 teams required to start (so 8 can advance and at least 1 is eliminated)
- Users cannot leave after season starts
- All simulation code is shared with live tournaments; no duplication

---

## Files Affected

**New files:**
- `src/lib/season-db.ts` — all season database queries
- `src/lib/simulate-season-game-live.ts` — season game simulation worker
- `src/app/api/seasons/route.ts` — list/create seasons
- `src/app/api/seasons/[id]/route.ts` — season details + standings
- `src/app/api/seasons/[id]/join/route.ts` — join with roster
- `src/app/api/seasons/[id]/leave/route.ts` — leave season
- `src/app/api/seasons/[id]/start/route.ts` — admin: start season
- `src/app/api/seasons/[id]/close-registration/route.ts` — admin: close registration
- `src/app/api/seasons/[id]/games/route.ts` — list games
- `src/app/api/seasons/[id]/games/[gameId]/route.ts` — game details
- `src/app/api/seasons/[id]/games/[gameId]/stream/route.ts` — SSE stream

**Modified files:**
- `src/lib/schema.ts` — add 5 new tables
- `src/app/api/cron/tick/route.ts` — extend to process season games
