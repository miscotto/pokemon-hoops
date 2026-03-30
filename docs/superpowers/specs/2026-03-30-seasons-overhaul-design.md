# Seasons Overhaul Design

**Date:** 2026-03-30
**Status:** Approved

## Overview

Overhaul the seasons feature to match the live tournament experience. The four changes are:

1. **Stats bug fix** — non-Pokemon event types (quarter markers, halftime) appear as fake players in the stats table; filter them out.
2. **Schedule page** — there is no way to navigate to individual game viewers; add a `/seasons/[id]/schedule` page so users can find and watch games live.
3. **Playoff overhaul** — change from single-game rounds to NBA-style best-of-7 series with lazy game scheduling and a proper series bracket.
4. **Navigation wiring** — link the schedule page from the season detail page.

---

## 1. Stats Bug Fix

**File:** `src/lib/season-stats.ts`

The aggregator loops over all `seasonGameEvents` for a team. Events like `quarter_start`, `quarter_end`, `halftime`, `game_start`, and `game_end` carry non-Pokemon strings in their `pokemonName` field (e.g. "Q2", "Halftime"). These pass the existing name filter and are treated as player rows.

**Fix:** Before checking `pokemonName`, skip any event whose `type` is in the set `{game_start, game_end, quarter_start, quarter_end, halftime}`. This is a one-line guard added at the top of the event loop in `getTeamSeasonStats`.

---

## 2. Schedule Page

### Route
`/seasons/[id]/schedule` — server-rendered shell, client component for filtering/pagination.

### API Changes
Extend `GET /api/seasons/[id]/games` with two optional query params:
- `status`: `live | upcoming | completed` — maps to `seasonGames.status` values (`in_progress`, `pending`, `completed`)
- `userId`: filter to games involving a specific team owner
- `limit` / `offset`: pagination (default limit 50)

Results are sorted by `scheduledAt` ascending for upcoming, descending for completed.

### UI
- **Filter tabs:** Live | Upcoming | Completed — defaults to Live if any games are live, otherwise Upcoming.
- **Team dropdown:** "All Teams" plus each team in the season; filters to games where `team1UserId = userId OR team2UserId = userId`.
- **Game rows:** date/time · Team A vs Team B · score or scheduled time · status pill (🔴 LIVE / UPCOMING / FINAL). Full row is a link to `/seasons/[id]/games/[gameId]`.
- **Load more:** fetch next page on click (no infinite scroll).
- **Live tab auto-refresh:** `setInterval` re-fetch every 30 seconds while on the Live tab.

### Navigation
- Season detail page (`/seasons/[id]`) gets a **"View Schedule →"** link in the header area.
- Breadcrumb on schedule page: Seasons › [Season Name] › Schedule.

---

## 3. Playoff Overhaul — Best-of-7 Series

### 3a. Database Schema

**New table: `seasonPlayoffSeries`**

```
id              uuid PK
seasonId        FK → seasons
round           integer         -- 1=QF, 2=SF, 3=Finals
matchupIndex    integer         -- 0–3 QF, 0–1 SF, 0 Finals
team1UserId     text            -- higher seed
team1Name       text
team2UserId     text            -- lower seed
team2Name       text
team1Wins       integer         -- default 0
team2Wins       integer         -- default 0
winnerId        text nullable
status          enum            -- active | completed
createdAt       timestamp
```

**Changes to `seasonGames`:**
- Add `seriesId` (UUID nullable, FK → `seasonPlayoffSeries`) — playoff games link to their series; regular games leave null.
- Add `gameNumberInSeries` (integer nullable) — 1 through 7, used for bracket display labels.

### 3b. Playoff Start (`tryStartPlayoffs`)

1. Take top 8 teams from standings (existing seeding logic unchanged).
2. Create 4 `seasonPlayoffSeries` rows with matchups 1v8, 2v7, 3v6, 4v5.
3. Schedule **game 1** of each series immediately (scheduledAt = now + small stagger offset to avoid cron collision).
4. Set season status to `playoffs`.

### 3c. Game Completion (`writeSeasonGameResult`)

After writing scores and updating team W/L stats, if `seriesId` is set:

1. Increment `team1Wins` or `team2Wins` on the linked series row (inside the same transaction).
2. Check if either side has reached 4 wins.
   - **Series not over:** schedule the next game in the series (`gameNumberInSeries + 1`), `scheduledAt = now + 5 minutes`. Link new game to same `seriesId`.
   - **Series clinched:** set `winnerId`, set `status = completed`.
3. After any clinch, call `tryAdvancePlayoffRound(seasonId, round)`.

### 3d. Round Advancement (`tryAdvancePlayoffRound`)

Protected by a PostgreSQL advisory lock (existing pattern).

1. Query all series for the given `(seasonId, round)`.
2. If any series is not `completed`, return early.
3. If `round < 3`: collect winners, create series for `round + 1` (SF or Finals), schedule game 1 of each.
4. If `round = 3` (Finals complete): set season `status = completed`, mark champion in `seasonTeams`.

### 3e. Bracket Display (Season Detail Page)

Replace the flat playoff game list with a 3-column bracket: **Quarterfinals | Semifinals | Finals**.

Each series card shows:
- Team A vs Team B
- Series record: "Team A leads 3–2" / "Team A wins 4–2" / "Series tied 2–2"
- Individual game results (collapsed by default, expandable toggle): "Game 1: 102–98 · Game 2: 87–91…"
- Clicking the card navigates to the most recent game in the series.

Layout: side-by-side columns on desktop, stacked on mobile.

---

## 4. What Does Not Change

- Season creation form (admin sets name, dates, maxTeams).
- Player join/leave during registration.
- Pokemon draft locking (`seasonLockedPokemon`).
- Regular season round-robin scheduling (7 sweeps, cron-driven).
- SSE streaming and game viewer component (`SeasonGameViewer.tsx`) — code is correct; accessibility is fixed by the schedule page.
- Standings computation and tiebreaker logic.
- Cron tick architecture.

---

## File Impact Summary

| File | Change |
|------|--------|
| `src/lib/schema.ts` | Add `seasonPlayoffSeries` table; add `seriesId`, `gameNumberInSeries` to `seasonGames` |
| `src/lib/season-db.ts` | Update `tryStartPlayoffs`, `writeSeasonGameResult`, `tryAdvancePlayoffRound` for series logic |
| `src/lib/season-stats.ts` | Add event type blocklist filter |
| `src/app/api/seasons/[id]/games/route.ts` | Add `status`, `userId`, `limit`, `offset` query params |
| `src/app/seasons/[id]/schedule/page.tsx` | New schedule page |
| `src/app/seasons/[id]/page.tsx` | Add "View Schedule" link; replace flat playoff list with bracket |
| `src/app/seasons/[id]/components/PlayoffBracket.tsx` | New bracket component |
| DB migration | Drizzle migration for new table + columns |
