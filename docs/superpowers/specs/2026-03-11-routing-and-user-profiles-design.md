# Pokemon Hoops — Routing Refactor & User Profiles Design

**Date:** 2026-03-11
**Status:** Approved

---

## Overview

Refactor the app's state-based navigation inside `/dashboard` into proper URL routes. Add dedicated pages for tournaments, roster building, and player profiles. Extend the database to track per-user tournament results and normalize game data out of a monolithic JSONB blob.

---

## 1. Routing Structure

### Public Routes (no auth required)
| Route | Page | Description |
|-------|------|-------------|
| `/` | HomePage | Landing page (unchanged) |
| `/tournaments` | TournamentsPage | All tournaments: waiting, active, completed |
| `/tournaments/[id]` | TournamentPage | Bracket view + results (merges TournamentView & LiveTournament) |
| `/users/[id]` | UserProfilePage | Player stats, roster, and tournament history |

### Auth-Required Routes
| Route | Page | Description |
|-------|------|-------------|
| `/dashboard` | DashboardPage | Roster hub — list, create, manage rosters |
| `/rosters/[id]/build` | RosterBuilderPage | Roster builder (owner only) |
| `/profile` | — | Server redirect → `/users/[currentUserId]` |
| `/admin` | AdminPage | Admin tournament management (unchanged) |

### What Changes in `/dashboard`
The `setView()` state machine is removed. The dashboard becomes solely the roster management hub. Navigation to builder, tournament, and live tournament now uses `router.push()` to real URLs.

### VS BOTS (Simulated Tournament)
The existing single-player simulated tournament (`TournamentView`, accessed via `setView("tournament")`) is removed in this refactor. All tournament play goes through live tournaments at `/tournaments/[id]`. This simplifies the codebase to one tournament model.

---

## 2. Database Schema Changes

### 2a. Alter `liveTournamentTeams`
Add two columns to track per-user results:

```sql
ALTER TABLE "liveTournamentTeams"
  ADD COLUMN "result" text,         -- "champion" | "finalist" | "eliminated" | "in_progress" | "waiting"
  ADD COLUMN "roundReached" integer; -- 1-based round number relative to tournament size. NULL until tournament starts.
```

**`roundReached` encoding:** Round numbers are relative to the tournament, not absolute. For an 8-team bracket (3 rounds), round 1 = first round, round 2 = semifinals, round 3 = final. For a 4-team bracket (2 rounds), round 1 = semifinals, round 2 = final. The profile page displays `"Round N"` without labeling it QF/SF/Final to avoid hardcoding bracket semantics.

**Existing rows:** Rows in `liveTournamentTeams` for tournaments completed before this migration will have `result = NULL` and `roundReached = NULL`. These are displayed on the profile page as "Legacy" with no result badge. No backfill is performed — the data needed to backfill (per-user outcomes) is not reliably derivable from the old `bracketData` JSON for all cases.

These columns are written by the bracket engine when a game completes:
- Loser: `result = "eliminated"`, `roundReached = currentRound`
- Winner of final: `result = "champion"`, `roundReached = totalRounds`
- Runner-up: `result = "finalist"`, `roundReached = totalRounds`
- Active participants still in bracket: `result = "in_progress"`, `roundReached = currentRound`
- Joined but tournament not yet started: `result = "waiting"`, `roundReached = NULL`

### 2b. New `tournamentGames` Table
Moves per-game data (events, scores) out of `liveTournaments.bracketData` into isolated rows, enabling concurrent game writes without row-level contention.

An index on `tournamentId` must be included in the migration (e.g., via Drizzle's `.index()`) as the primary access pattern is always `WHERE tournamentId = $id`.

```typescript
export const tournamentGames = pgTable("tournamentGames", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournamentId")
    .notNull()
    .references(() => liveTournaments.id, { onDelete: "cascade" }),
  round: integer("round").notNull(),            // 1-based round number
  matchupIndex: integer("matchupIndex").notNull(), // position in bracket within round
  team1UserId: text("team1UserId"),
  team2UserId: text("team2UserId"),
  team1Score: integer("team1Score"),
  team2Score: integer("team2Score"),
  winnerId: text("winnerId"),
  status: text("status").notNull().default("pending"), // "pending" | "completed"
  events: jsonb("events"),                      // ~150 play-by-play events, isolated per game
  playedAt: timestamp("playedAt"),
});
```

`liveTournaments.bracketData` is slimmed down to just the round/advancement structure (who plays who, which round, who advanced) — no game events embedded. Game rows are created for all matchups when `startTournament()` is called, with status `"pending"`.

### 2c. Game Write Model
The existing architecture treats game events as pre-computed and time-derived (using `startsAtOffset` + elapsed wall-clock time). This refactor replaces that with a write-on-completion model. The `startsAtOffset` field is removed from `bracketData` entirely.

**Write flow:**
1. When `startTournament()` is called, all round-1 `tournamentGames` rows are created with `status = "pending"`.
2. A user (participant or anyone) triggers `POST /api/live-tournaments/[id]/games/[gameId]`.
3. The server atomically runs `UPDATE "tournamentGames" SET status = 'in_progress' WHERE id = $gameId AND status = 'pending' RETURNING id`. If no row is returned, the game is already completed — return the existing result immediately (idempotent).
4. If the UPDATE succeeds, the server simulates the game, writes scores + events to the `tournamentGames` row, sets `status = "completed"`, updates both players' `liveTournamentTeams.result` and `roundReached`, and advances `liveTournaments.bracketData` to show the winner.
5. If the completed game was the last in a round, new `tournamentGames` rows are created for the next round.

**Endpoint changes required to support the new model:**
- `GET /api/live-tournaments/[id]` is **rewritten** to read bracket structure from `liveTournaments.bracketData` and game outcomes from `tournamentGames` rows — it no longer reads `m.events`, `m.finalHomeScore`, `m.finalAwayScore`, `m.startsAtOffset`, or `m.winner` from `bracketData`.
- `GET /api/live-tournaments/[id]/game/[matchupId]` is **removed** — per-game event data is now served by `GET /api/live-tournaments/[id]/games` with client-side filtering by `gameId`.
- The `computeCurrentEventIndex` function and all time-offset logic become unused and are deleted.

### 2d. Migration
One Drizzle migration file generated via `npm run db:generate` then applied with `npm run db:push`.

---

## 3. New Pages & Components

### 3a. `/tournaments` — TournamentsPage
- Fetches all tournaments from `GET /api/tournaments`
- The existing `getAllTournaments(6)` call is updated to `getAllTournaments(100)` to support the filter tabs without client-side pagination issues
- `getAllTournaments` is updated to LEFT JOIN `liveTournamentTeams WHERE result = 'champion'` and then fetch the winner's display name via `db.execute(sql\`SELECT name FROM "user" WHERE id = ${winnerId}\`)` — same auth-table access pattern as Section 3d. The `result = 'champion'` column does not exist before this migration, so this query is only valid after migration is applied.
- Filter tabs: All / Waiting / Active / Completed (client-side filter on the fetched list)
- Cards show: tournament name, status, team count, winner name (if completed)
- "Spectate" → `/tournaments/[id]`, "Join" → `/tournaments/[id]`, "Results" → `/tournaments/[id]`
- Fully public — no auth check

### 3b. `/tournaments/[id]` — TournamentPage
Merges `TournamentView` and `LiveTournament` into one page that adapts by `tournament.status`:

| Status | Behavior |
|--------|----------|
| `waiting` | Shows lobby: team list, fill progress, join button (if auth + no active tournament) |
| `active` | Shows live bracket; authenticated participant can play their games; others spectate |
| `completed` | Shows final bracket, champion banner, all results |

Data sources:
- Tournament metadata: `GET /api/live-tournaments/[id]` — **made public** (auth removed from this GET endpoint)
- Games: `GET /api/live-tournaments/[id]/games` — **new, public endpoint** returning all `tournamentGames` rows for the tournament
- Playing a game: `POST /api/live-tournaments/[id]/games/[gameId]` — **auth required**, replaces the old `game/[matchupId]` route. Uses the atomic write model described in 2c.

### 3c. `/rosters/[id]/build` — RosterBuilderPage
- Extracts `RosterBuilder` component from dashboard state into its own Next.js page
- On load: fetches roster by ID, verifies current user is owner — if not, redirects to `/dashboard`
- On save: `PUT /api/rosters/[id]` → redirects back to `/dashboard`
- On cancel: redirects to `/dashboard`

### 3d. `/users/[id]` — UserProfilePage
Three sections, all data from a single `GET /api/users/[id]` endpoint:

**Header:** Username, member since date, aggregate stats (tournaments played, wins, losses, win rate)

**Tournament Roster:** The user's current `isTournamentRoster` roster displayed as a 6-slot grid with Pokemon sprites, names, and positions. If none set, shows "No tournament roster set" placeholder.

**Tournament History:** List of all tournaments the user participated in, sorted by most recent. Each entry shows tournament name, result badge (🏆 Champion / 🥈 Finalist / 💀 Eliminated Rd N / ⚡ In Progress / — Legacy), and links to `/tournaments/[id]`.

`GET /api/users/[id]` — public endpoint, returns:
```typescript
{
  user: { id, name, createdAt },
  stats: { played, wins, losses, winRate },
  tournamentRoster: RosterWithPokemon | null,
  tournamentHistory: Array<{
    tournamentId, tournamentName, result, roundReached, joinedAt
  }>
}
```

**Implementation note:** The `user` row lives in better-auth's own `user` table, not in the Drizzle schema. To query it, use `db.execute(sql\`SELECT id, name, created_at FROM "user" WHERE id = ${userId}\`)` directly, or use Drizzle's inferred table reference. Do not attempt to import a Drizzle table definition for the auth user table — it is not exported from `schema.ts`.

### 3e. `/profile` — Redirect
A Next.js server component that reads the session cookie server-side and redirects to `/users/[currentUserId]`. If not authenticated, redirects to `/` (not `/dashboard`) to avoid a double redirect. Note: `/dashboard` is intentionally not a server-side redirect — it renders an inline `<AuthForm />` for unauthenticated users rather than redirecting. This behavior is unchanged.

---

## 4. Navigation Updates

- **NavBar** (in `layout.tsx` or `HomePage.tsx`): Add links to `/tournaments` and `/profile`
- **Dashboard**: Replace `setView("builder")` with `router.push(\`/rosters/${id}/build\`)`. Replace `setView("tournament")` and `setView("live-tournament")` with `router.push(\`/tournaments/${id}\`)`
- **TournamentView / LiveTournament components**: Removed. Their logic is consolidated into the new `TournamentPage` (`app/tournaments/[id]/page.tsx`)
- **Admin panel**: Tournament cards link to `/tournaments/[id]` instead of navigating via state

---

## 5. API Changes

### Made Public (auth removed from GET)
- `GET /api/live-tournaments/[id]` — **rewritten** to read bracket from `bracketData` + game outcomes from `tournamentGames`; auth removed; `startsAtOffset`/time-based fields removed from response

### Modified
- `GET /api/tournaments` — limit raised from 6 → 100; response includes winner name for completed tournaments (requires auth-table lookup as noted in Section 3a)

### New
- `POST /api/live-tournaments/[id]/games/[gameId]` — auth required; replaces old `game/[matchupId]` route; uses `gameId` (UUID from `tournamentGames`); implements atomic write-on-completion (Section 2c)
- `GET /api/live-tournaments/[id]/games` — public; returns all `tournamentGames` rows for a tournament
- `GET /api/users/[id]` — public; returns user profile data (stats, roster, history)

### Removed
- `POST /api/tournament/simulate` — single-player simulation removed with VS BOTS flow
- `GET /api/live-tournaments/[id]/game/[matchupId]` — replaced by `GET /api/live-tournaments/[id]/games` with client-side filtering

### Unchanged
- `GET/POST /api/rosters`
- `GET/PUT/DELETE /api/rosters/[id]`
- `GET/POST /api/admin/tournaments`
- `GET/POST /api/live-tournaments` (join/list)
- `GET/POST /api/auth/[...all]`

---

## 6. Error Handling & Edge Cases

- **Roster builder auth**: If `session.user.id !== roster.userId`, redirect to `/dashboard`
- **Tournament not found**: `/tournaments/[id]` calls `notFound()` if tournament doesn't exist
- **User not found**: `/users/[id]` calls `notFound()` if user ID doesn't exist in the auth user table
- **In-progress tournament lock**: Existing `isRosterInActiveTournament()` logic remains unchanged
- **No tournament roster**: Profile page shows "No tournament roster set" placeholder
- **Legacy tournament history rows**: `result = NULL` rows show a "—" badge with no link styling change
- **Concurrent game plays**: Atomic `UPDATE WHERE status = 'pending'` ensures only one simulation runs per game (Section 2c)

---

## 7. Out of Scope

- Pagination on `/tournaments` (limit raised to 100 is sufficient for now)
- Social features (following players, comments)
- Historical roster snapshots on profile (rosterData already stored in `liveTournamentTeams`)
- Push notifications for tournament start
- Backfilling `result`/`roundReached` for pre-migration tournament history rows
