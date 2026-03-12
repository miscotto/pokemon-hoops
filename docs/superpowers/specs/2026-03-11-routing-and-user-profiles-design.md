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

---

## 2. Database Schema Changes

### 2a. Alter `liveTournamentTeams`
Add two columns to track per-user results:

```sql
ALTER TABLE "liveTournamentTeams"
  ADD COLUMN "result" text,         -- "champion" | "finalist" | "eliminated" | "in_progress" | "waiting"
  ADD COLUMN "roundReached" integer; -- 1=R1, 2=QF, 3=SF, 4=Final, 5=Champion. NULL until tournament starts.
```

These are written by the bracket engine when a game completes:
- Loser: `result = "eliminated"`, `roundReached = currentRound`
- Winner of final: `result = "champion"`, `roundReached = maxRound`
- Runner-up: `result = "finalist"`, `roundReached = maxRound`
- Active participants: `result = "in_progress"`, `roundReached = currentRound`

### 2b. New `tournamentGames` Table
Moves per-game data (events, scores) out of `liveTournaments.bracketData` into isolated rows, enabling concurrent game writes without row-level contention.

```typescript
export const tournamentGames = pgTable("tournamentGames", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournamentId")
    .notNull()
    .references(() => liveTournaments.id, { onDelete: "cascade" }),
  round: integer("round").notNull(),         // 1, 2, 3, 4
  matchupIndex: integer("matchupIndex").notNull(), // position in bracket
  team1UserId: text("team1UserId"),
  team2UserId: text("team2UserId"),
  team1Score: integer("team1Score"),
  team2Score: integer("team2Score"),
  winnerId: text("winnerId"),
  status: text("status").notNull().default("pending"), // "pending" | "in_progress" | "completed"
  events: jsonb("events"),                   // ~150 play-by-play events, isolated per game
  playedAt: timestamp("playedAt"),
});
```

`liveTournaments.bracketData` is slimmed down to just the round structure (who plays who, which round, who advanced) — no game events embedded.

### Migration
One Drizzle migration file generated via `npm run db:generate` then applied with `npm run db:push`.

---

## 3. New Pages & Components

### 3a. `/tournaments` — TournamentsPage
- Fetches all tournaments from `GET /api/tournaments` (already exists, may need pagination)
- Filter tabs: All / Waiting / Active / Completed
- Cards show: tournament name, status, team count, winner (if completed)
- "Spectate" → `/tournaments/[id]`, "Join" → `/tournaments/[id]` (which handles join flow), "Results" → `/tournaments/[id]`
- Fully public — no auth check

### 3b. `/tournaments/[id]` — TournamentPage
Merges `TournamentView` and `LiveTournament` into one page that adapts by `tournament.status`:

| Status | Behavior |
|--------|----------|
| `waiting` | Shows lobby: team list, fill progress, join button (if auth + no active tournament) |
| `active` | Shows live bracket; authenticated participant can play their games; others spectate |
| `completed` | Shows final bracket, champion banner, all results |

Data sources:
- Tournament metadata: `GET /api/live-tournaments/[id]`
- Games: `GET /api/live-tournaments/[id]/games` (new endpoint reading `tournamentGames`)
- Playing a game: `POST /api/live-tournaments/[id]/game/[matchupId]` (existing, writes to `tournamentGames`)

### 3c. `/rosters/[id]/build` — RosterBuilderPage
- Extracts `RosterBuilder` component from dashboard state into its own Next.js page
- On load: fetches roster by ID, verifies current user is owner (redirect to `/dashboard` if not)
- On save: `PUT /api/rosters/[id]` → redirects back to `/dashboard`
- On cancel: redirects to `/dashboard`

### 3d. `/users/[id]` — UserProfilePage
Three sections:

**Header:** Username, member since date, aggregate stats (tournaments played, wins, losses, win rate)

**Tournament Roster:** The user's current `isTournamentRoster` roster displayed as a 6-slot grid with Pokemon sprites, names, and positions. Read from `GET /api/rosters?userId=[id]` (filter for tournament roster).

**Tournament History:** List of all tournaments the user participated in, sorted by most recent. Each entry shows tournament name, result badge (🏆 Champion / 🥈 Finalist / 💀 Eliminated Rd N / ⚡ In Progress), and links to `/tournaments/[id]`.

New API endpoint: `GET /api/users/[id]` returns:
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

### 3e. `/profile` — Redirect
A Next.js server component that reads the session and redirects to `/users/[currentUserId]`. If not authenticated, redirects to `/dashboard` (which shows auth form).

---

## 4. Navigation Updates

- **NavBar** (in `layout.tsx` or `HomePage.tsx`): Add links to `/tournaments` and `/profile`
- **Dashboard**: Replace `setView("builder")` with `router.push("/rosters/[id]/build")`. Replace `setView("tournament")` and `setView("live-tournament")` with `router.push("/tournaments/[id]")`
- **TournamentView / LiveTournament**: These components are repurposed into the unified `TournamentPage`. The originals can be removed or kept as internal sub-components
- **Admin panel**: "View" links on tournament cards now point to `/tournaments/[id]`

---

## 5. API Changes

### Modified
- `GET /api/live-tournaments/[id]` — response no longer includes embedded game events (those come from `tournamentGames`)
- `POST /api/live-tournaments/[id]/game/[matchupId]` — writes result to `tournamentGames` row instead of mutating `bracketData` JSON; also updates `liveTournamentTeams.result` and `roundReached`

### New
- `GET /api/live-tournaments/[id]/games` — returns all `tournamentGames` rows for a tournament
- `GET /api/users/[id]` — user profile data (stats, roster, history)

### Unchanged
- `GET/POST /api/rosters`
- `GET/PUT/DELETE /api/rosters/[id]`
- `GET /api/tournaments`
- `GET/POST /api/admin/tournaments`
- `GET/POST /api/live-tournaments` (join/list)

---

## 6. Error Handling & Edge Cases

- **Roster builder auth**: If `session.user.id !== roster.userId`, redirect to `/dashboard` with no error shown
- **Tournament not found**: `/tournaments/[id]` returns 404 page if tournament doesn't exist
- **User not found**: `/users/[id]` returns 404 page if user ID doesn't exist
- **In-progress tournament lock**: Existing logic (`isRosterInActiveTournament`) remains — users cannot edit rosters while in an active tournament
- **No tournament roster**: Profile page shows "No tournament roster set" placeholder in that section

---

## 7. Out of Scope

- Pagination on `/tournaments` (can be added later if list grows large)
- Social features (following players, comments)
- Historical roster snapshots on profile (rosterData already stored in `liveTournamentTeams` per-tournament entry)
- Push notifications for tournament start
