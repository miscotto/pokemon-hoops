# Routing Refactor & User Profiles Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor state-based dashboard navigation into proper URL routes, add tournament/user profile pages, and normalize game data out of a monolithic JSONB blob with per-user win/loss tracking.

**Architecture:** Three layers of change: (1) DB schema adds `result`/`roundReached` to `liveTournamentTeams` and a new `tournamentGames` table with an atomic write-on-completion game model; (2) new Next.js App Router pages for `/tournaments`, `/tournaments/[id]`, `/rosters/[id]/build`, `/users/[id]`, and `/profile`; (3) dashboard `setView()` state machine replaced with `router.push()` to real URLs.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + PostgreSQL (Neon), better-auth, TypeScript, Tailwind CSS, Press Start 2P pixel font, existing UI components (`PokeButton`, `PokeCard`, `ThemeToggle`).

---

## File Map

### Created
- `src/app/tournaments/page.tsx` — TournamentsPage (public listing)
- `src/app/tournaments/[id]/page.tsx` — TournamentPage (bracket, lobby, results)
- `src/app/rosters/[id]/build/page.tsx` — RosterBuilderPage (owner-only wrapper)
- `src/app/users/[id]/page.tsx` — UserProfilePage (stats, roster, history)
- `src/app/profile/page.tsx` — Redirect to `/users/[currentUserId]`
- `src/app/api/live-tournaments/[id]/games/route.ts` — GET all games for tournament
- `src/app/api/live-tournaments/[id]/games/[gameId]/route.ts` — POST play a game
- `src/app/api/users/[id]/route.ts` — GET user profile data

### Modified
- `src/lib/schema.ts` — add `result`/`roundReached` to `liveTournamentTeams`; add `tournamentGames` table
- `src/lib/tournament-db.ts` — new game DB functions; update `startTournament`; update `getAllTournaments`; add profile query functions
- `src/app/api/live-tournaments/route.ts` — update POST to use new game-row-based `startTournament`
- `src/app/api/live-tournaments/[id]/route.ts` — make GET public; rewrite to read from `tournamentGames`
- `src/app/api/tournaments/route.ts` — raise limit to 100; include winner name
- `src/app/dashboard/page.tsx` — remove `setView` machine; add `router.push` navigation
- `src/app/components/RosterDashboard.tsx` — remove callback props; use `router.push` directly

### Deleted
- `src/app/api/live-tournaments/[id]/game/[matchupId]/route.ts`
- `src/app/api/tournament/simulate/route.ts`
- `src/app/components/TournamentView.tsx`
- `src/app/components/LiveTournament.tsx`

---

## Chunk 1: Database + API Foundation

### Task 1: Schema Migration

**Files:**
- Modify: `src/lib/schema.ts`

- [ ] **Step 1: Add new columns and table to schema**

Replace the content of `src/lib/schema.ts` with:

```typescript
import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  unique,
  index,
} from "drizzle-orm/pg-core";

export const rosters = pgTable("rosters", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  city: text("city").notNull().default(""),
  isTournamentRoster: boolean("is_tournament_roster").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rosterPokemon = pgTable(
  "roster_pokemon",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rosterId: uuid("roster_id")
      .notNull()
      .references(() => rosters.id, { onDelete: "cascade" }),
    slotPosition: integer("slot_position").notNull(),
    slotLabel: text("slot_label").notNull(),
    pokemonId: integer("pokemon_id").notNull(),
    pokemonName: text("pokemon_name").notNull(),
    pokemonSprite: text("pokemon_sprite"),
    pokemonTypes: jsonb("pokemon_types").notNull().default([]),
    pokemonStats: jsonb("pokemon_stats").notNull().default({}),
    pokemonHeight: integer("pokemon_height"),
    pokemonWeight: integer("pokemon_weight"),
    pokemonTag: text("pokemon_tag"),
  },
  (t) => [unique().on(t.rosterId, t.slotPosition)]
);

export const liveTournaments = pgTable("live_tournaments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().default("Pokemon Tournament"),
  status: text("status").notNull().default("waiting"),
  maxTeams: integer("max_teams").notNull().default(8),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  bracketData: jsonb("bracket_data"),
  createdBy: text("created_by"),
});

export const liveTournamentTeams = pgTable(
  "live_tournament_teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => liveTournaments.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    rosterId: text("roster_id").notNull(),
    teamName: text("team_name").notNull(),
    rosterData: jsonb("roster_data").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    result: text("result"),       // "champion" | "finalist" | "eliminated" | "in_progress" | "waiting"
    roundReached: integer("round_reached"), // 1-based. NULL until tournament starts.
  },
  (t) => [unique().on(t.tournamentId, t.userId)]
);

export const tournamentGames = pgTable(
  "tournament_games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => liveTournaments.id, { onDelete: "cascade" }),
    round: integer("round").notNull(),
    matchupIndex: integer("matchup_index").notNull(),
    team1UserId: text("team1_user_id"),
    team1Name: text("team1_name"),
    team2UserId: text("team2_user_id"),
    team2Name: text("team2_name"),
    team1Score: integer("team1_score"),
    team2Score: integer("team2_score"),
    winnerId: text("winner_id"),
    status: text("status").notNull().default("pending"), // "pending" | "in_progress" | "completed"
    events: jsonb("events"),
    playedAt: timestamp("played_at", { withTimezone: true }),
  },
  (t) => [index("tournament_games_tournament_id_idx").on(t.tournamentId)]
);
```

- [ ] **Step 2: Generate and apply migration**

```bash
cd /Users/rajanrahman/CascadeProjects/windsurf-project-4
npm run db:generate
npm run db:push
```

Expected: migration generated in `drizzle/` folder; schema applied to DB with no errors.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: no TypeScript errors related to schema imports.

- [ ] **Step 4: Commit**

```bash
git add src/lib/schema.ts drizzle/
git commit -m "feat: add result/roundReached columns and tournamentGames table"
```

---

### Task 2: Update tournament-db.ts

**Files:**
- Modify: `src/lib/tournament-db.ts`

- [ ] **Step 1: Replace tournament-db.ts with updated version**

Replace the full file content of `src/lib/tournament-db.ts`:

```typescript
import { eq, and, asc, desc, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { liveTournaments, liveTournamentTeams, tournamentGames } from "./schema";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BracketMatchup {
  gameId: string;
  round: number;
  matchupIndex: number;
  team1UserId: string;
  team1Name: string;
  team2UserId: string;
  team2Name: string;
}

export interface BracketStructure {
  totalRounds: number;
  matchups: BracketMatchup[];
}

// ─── Existing Queries (unchanged) ────────────────────────────────────────────

export async function findOpenTournament(): Promise<string | null> {
  const result = await db
    .select({ id: liveTournaments.id })
    .from(liveTournaments)
    .where(
      and(
        eq(liveTournaments.status, "waiting"),
        sql`(SELECT COUNT(*) FROM live_tournament_teams WHERE tournament_id = ${liveTournaments.id}) < ${liveTournaments.maxTeams}`
      )
    )
    .orderBy(asc(liveTournaments.createdAt))
    .limit(1);
  return result[0]?.id ?? null;
}

export async function createTournament(
  options: { name?: string; maxTeams?: number; createdBy?: string } = {}
): Promise<string> {
  const result = await db
    .insert(liveTournaments)
    .values({
      status: "waiting",
      maxTeams: options.maxTeams ?? 8,
      name: options.name ?? "Pokemon Tournament",
      createdBy: options.createdBy ?? null,
    })
    .returning({ id: liveTournaments.id });
  return result[0].id;
}

export async function joinTournament(
  tournamentId: string,
  userId: string,
  rosterId: string,
  teamName: string,
  rosterData: unknown
): Promise<void> {
  await db
    .insert(liveTournamentTeams)
    .values({ tournamentId, userId, rosterId, teamName, rosterData, result: "waiting" })
    .onConflictDoNothing();
}

export async function getTournamentTeamCount(tournamentId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(liveTournamentTeams)
    .where(eq(liveTournamentTeams.tournamentId, tournamentId));
  return result[0].count;
}

export async function getTournamentTeams(tournamentId: string): Promise<
  {
    id: string;
    user_id: string;
    roster_id: string;
    team_name: string;
    roster_data: unknown;
    joined_at: Date;
  }[]
> {
  const rows = await db
    .select()
    .from(liveTournamentTeams)
    .where(eq(liveTournamentTeams.tournamentId, tournamentId))
    .orderBy(asc(liveTournamentTeams.joinedAt));
  return rows.map((r) => ({
    id: r.id,
    user_id: r.userId,
    roster_id: r.rosterId,
    team_name: r.teamName,
    roster_data: r.rosterData,
    joined_at: r.joinedAt!,
  }));
}

export async function getTournament(tournamentId: string): Promise<{
  id: string;
  name: string;
  status: string;
  max_teams: number;
  created_at: Date;
  started_at: Date | null;
  bracket_data: unknown;
} | null> {
  const rows = await db
    .select()
    .from(liveTournaments)
    .where(eq(liveTournaments.id, tournamentId));
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    max_teams: r.maxTeams,
    created_at: r.createdAt,
    started_at: r.startedAt ?? null,
    bracket_data: r.bracketData,
  };
}

export async function getUserActiveTournament(userId: string): Promise<{
  tournament_id: string;
  status: string;
} | null> {
  const rows = await db
    .select({
      tournament_id: liveTournamentTeams.tournamentId,
      status: liveTournaments.status,
    })
    .from(liveTournamentTeams)
    .innerJoin(liveTournaments, eq(liveTournamentTeams.tournamentId, liveTournaments.id))
    .where(
      and(
        eq(liveTournamentTeams.userId, userId),
        inArray(liveTournaments.status, ["waiting", "active"])
      )
    )
    .orderBy(desc(liveTournamentTeams.joinedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function isRosterInActiveTournament(rosterId: string): Promise<boolean> {
  const rows = await db
    .select({ id: liveTournamentTeams.id })
    .from(liveTournamentTeams)
    .innerJoin(liveTournaments, eq(liveTournamentTeams.tournamentId, liveTournaments.id))
    .where(
      and(
        eq(liveTournamentTeams.rosterId, rosterId),
        inArray(liveTournaments.status, ["waiting", "active"])
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function completeTournament(tournamentId: string): Promise<void> {
  await db
    .update(liveTournaments)
    .set({ status: "completed" })
    .where(
      and(
        eq(liveTournaments.id, tournamentId),
        eq(liveTournaments.status, "active")
      )
    );
}

// ─── New: Tournament Games ────────────────────────────────────────────────────

/** Create game rows for a set of round matchups */
export async function createRoundGames(
  tournamentId: string,
  round: number,
  matchups: Array<{
    matchupIndex: number;
    team1UserId: string;
    team1Name: string;
    team2UserId: string;
    team2Name: string;
  }>
): Promise<string[]> {
  const rows = await db
    .insert(tournamentGames)
    .values(
      matchups.map((m) => ({
        tournamentId,
        round,
        matchupIndex: m.matchupIndex,
        team1UserId: m.team1UserId,
        team1Name: m.team1Name,
        team2UserId: m.team2UserId,
        team2Name: m.team2Name,
        status: "pending" as const,
      }))
    )
    .returning({ id: tournamentGames.id });
  return rows.map((r) => r.id);
}

/** Get all games for a tournament, ordered by round then matchup index */
export async function getTournamentGames(tournamentId: string): Promise<
  {
    id: string;
    round: number;
    matchup_index: number;
    team1_user_id: string | null;
    team1_name: string | null;
    team2_user_id: string | null;
    team2_name: string | null;
    team1_score: number | null;
    team2_score: number | null;
    winner_id: string | null;
    status: string;
    events: unknown;
    played_at: Date | null;
  }[]
> {
  const rows = await db
    .select()
    .from(tournamentGames)
    .where(eq(tournamentGames.tournamentId, tournamentId))
    .orderBy(asc(tournamentGames.round), asc(tournamentGames.matchupIndex));
  return rows.map((r) => ({
    id: r.id,
    round: r.round,
    matchup_index: r.matchupIndex,
    team1_user_id: r.team1UserId,
    team1_name: r.team1Name,
    team2_user_id: r.team2UserId,
    team2_name: r.team2Name,
    team1_score: r.team1Score,
    team2_score: r.team2Score,
    winner_id: r.winnerId,
    status: r.status,
    events: r.events,
    played_at: r.playedAt,
  }));
}

/** Get a single game by ID */
export async function getGame(gameId: string) {
  const rows = await db
    .select()
    .from(tournamentGames)
    .where(eq(tournamentGames.id, gameId));
  return rows[0] ?? null;
}

/**
 * Atomically claim a game for simulation.
 * Returns the game row if successfully claimed (status was "pending"),
 * or null if already claimed/completed by another request.
 */
export async function claimGame(gameId: string) {
  const rows = await db
    .update(tournamentGames)
    .set({ status: "in_progress" })
    .where(and(eq(tournamentGames.id, gameId), eq(tournamentGames.status, "pending")))
    .returning();
  return rows[0] ?? null;
}

/** Write the final result of a simulated game */
export async function writeGameResult(
  gameId: string,
  team1Score: number,
  team2Score: number,
  winnerId: string,
  events: unknown
): Promise<void> {
  await db
    .update(tournamentGames)
    .set({
      status: "completed",
      team1Score,
      team2Score,
      winnerId,
      events,
      playedAt: new Date(),
    })
    .where(eq(tournamentGames.id, gameId));
}

/** Update a player's result and roundReached in their tournament team entry */
export async function updateTeamResult(
  tournamentId: string,
  userId: string,
  result: string,
  roundReached: number
): Promise<void> {
  await db
    .update(liveTournamentTeams)
    .set({ result, roundReached })
    .where(
      and(
        eq(liveTournamentTeams.tournamentId, tournamentId),
        eq(liveTournamentTeams.userId, userId)
      )
    );
}

/** Get roster data for a specific user in a tournament (for game simulation) */
export async function getTeamRosterData(
  tournamentId: string,
  userId: string
): Promise<{ team_name: string; roster_data: unknown } | null> {
  const rows = await db
    .select({
      team_name: liveTournamentTeams.teamName,
      roster_data: liveTournamentTeams.rosterData,
    })
    .from(liveTournamentTeams)
    .where(
      and(
        eq(liveTournamentTeams.tournamentId, tournamentId),
        eq(liveTournamentTeams.userId, userId)
      )
    );
  return rows[0] ?? null;
}

// ─── Updated: startTournament uses new game-row model ───────────────────────

/**
 * Start a tournament:
 * - Creates round-1 tournamentGames rows
 * - Stores lightweight bracketData (structure only, no events)
 * - Sets status to "active"
 */
export async function startTournament(
  tournamentId: string,
  round1Matchups: Array<{
    matchupIndex: number;
    team1UserId: string;
    team1Name: string;
    team2UserId: string;
    team2Name: string;
  }>,
  totalRounds: number
): Promise<void> {
  // Create game rows for round 1
  const gameIds = await createRoundGames(tournamentId, 1, round1Matchups);

  // Build lightweight bracketData (structure only)
  const bracketData: BracketStructure = {
    totalRounds,
    matchups: round1Matchups.map((m, i) => ({
      gameId: gameIds[i],
      round: 1,
      matchupIndex: m.matchupIndex,
      team1UserId: m.team1UserId,
      team1Name: m.team1Name,
      team2UserId: m.team2UserId,
      team2Name: m.team2Name,
    })),
  };

  // Mark all participants as in_progress
  await db
    .update(liveTournamentTeams)
    .set({ result: "in_progress", roundReached: 1 })
    .where(eq(liveTournamentTeams.tournamentId, tournamentId));

  await db
    .update(liveTournaments)
    .set({ status: "active", startedAt: new Date(), bracketData })
    .where(eq(liveTournaments.id, tournamentId));
}

/** Append next-round matchups to bracketData after a round completes */
export async function appendNextRound(
  tournamentId: string,
  round: number,
  matchups: Array<{
    matchupIndex: number;
    team1UserId: string;
    team1Name: string;
    team2UserId: string;
    team2Name: string;
  }>
): Promise<string[]> {
  const gameIds = await createRoundGames(tournamentId, round, matchups);

  const tournament = await getTournament(tournamentId);
  const bracket = tournament!.bracket_data as BracketStructure;

  const newMatchups: BracketMatchup[] = matchups.map((m, i) => ({
    gameId: gameIds[i],
    round,
    matchupIndex: m.matchupIndex,
    team1UserId: m.team1UserId,
    team1Name: m.team1Name,
    team2UserId: m.team2UserId,
    team2Name: m.team2Name,
  }));

  await db
    .update(liveTournaments)
    .set({
      bracketData: {
        ...bracket,
        matchups: [...bracket.matchups, ...newMatchups],
      },
    })
    .where(eq(liveTournaments.id, tournamentId));

  return gameIds;
}

// ─── Updated: getAllTournaments with higher limit + winner name ───────────────

export async function getAllTournaments(limit = 20): Promise<{
  id: string;
  name: string;
  status: string;
  max_teams: number;
  created_at: Date;
  started_at: Date | null;
  team_count: number;
  winner_name: string | null;
}[]> {
  const rows = await db
    .select({
      id: liveTournaments.id,
      name: liveTournaments.name,
      status: liveTournaments.status,
      maxTeams: liveTournaments.maxTeams,
      createdAt: liveTournaments.createdAt,
      startedAt: liveTournaments.startedAt,
      teamCount: sql<number>`(SELECT COUNT(*) FROM live_tournament_teams WHERE tournament_id = ${liveTournaments.id})::int`,
      winnerId: sql<string | null>`(SELECT user_id FROM live_tournament_teams WHERE tournament_id = ${liveTournaments.id} AND result = 'champion' LIMIT 1)`,
    })
    .from(liveTournaments)
    .orderBy(desc(liveTournaments.createdAt))
    .limit(limit);

  // Fetch winner names from auth user table for completed tournaments
  const results = await Promise.all(
    rows.map(async (r) => {
      let winner_name: string | null = null;
      if (r.winnerId) {
        const nameRows = await db.execute(
          sql`SELECT name FROM "user" WHERE id = ${r.winnerId} LIMIT 1`
        );
        winner_name = (nameRows.rows[0] as { name: string } | undefined)?.name ?? null;
      }
      return {
        id: r.id,
        name: r.name,
        status: r.status,
        max_teams: r.maxTeams,
        created_at: r.createdAt,
        started_at: r.startedAt ?? null,
        team_count: r.teamCount,
        winner_name,
      };
    })
  );

  return results;
}

// ─── New: User Profile Queries ────────────────────────────────────────────────

/** Get a user's tournament history (all tournaments they participated in) */
export async function getUserTournamentHistory(userId: string): Promise<{
  tournament_id: string;
  tournament_name: string;
  result: string | null;
  round_reached: number | null;
  joined_at: Date;
}[]> {
  const rows = await db
    .select({
      tournament_id: liveTournamentTeams.tournamentId,
      tournament_name: liveTournaments.name,
      result: liveTournamentTeams.result,
      round_reached: liveTournamentTeams.roundReached,
      joined_at: liveTournamentTeams.joinedAt,
    })
    .from(liveTournamentTeams)
    .innerJoin(liveTournaments, eq(liveTournamentTeams.tournamentId, liveTournaments.id))
    .where(eq(liveTournamentTeams.userId, userId))
    .orderBy(desc(liveTournamentTeams.joinedAt));
  return rows.map((r) => ({
    tournament_id: r.tournament_id,
    tournament_name: r.tournament_name,
    result: r.result,
    round_reached: r.round_reached,
    joined_at: r.joined_at!,
  }));
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -40
```

Expected: no errors from `src/lib/tournament-db.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tournament-db.ts
git commit -m "feat: add tournament game DB functions and update startTournament model"
```

---

### Task 3: Update POST /api/live-tournaments (bracket start logic)

**Files:**
- Modify: `src/app/api/live-tournaments/route.ts`

The POST route currently calls `simulateBracketForSize` (which pre-simulates all games) then `startTournament(id, bracketData)`. Replace with the new round-1-only model.

- [ ] **Step 1: Update the bracket start section of the POST handler**

In `src/app/api/live-tournaments/route.ts`, replace the entire import block at the top with:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { rosters, rosterPokemon } from "@/lib/schema";
import { headers } from "next/headers";
import { eq, and, asc } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";
import {
  findOpenTournament,
  createTournament,
  joinTournament,
  getTournamentTeamCount,
  getTournamentTeams,
  getTournament,
  startTournament,
  getUserActiveTournament,
  getAllTournaments,
} from "@/lib/tournament-db";
import { toTournamentPokemon } from "../../utils/tournamentEngine";
```

Then replace the entire `if (count >= maxTeams)` block (from `const teams = await getTournamentTeams(tournamentId);` through `return NextResponse.json({ tournamentId, status: "active" });`) with:

```typescript
  if (count >= maxTeams) {
    const teams = await getTournamentTeams(tournamentId);

    // Rank teams by power for seeding — build a flat list with userId
    const rankedTeams = teams
      .map((t) => {
        const roster = (t.roster_data as Parameters<typeof toTournamentPokemon>[0][]).map(
          toTournamentPokemon
        );
        const power = roster.reduce(
          (sum, p) =>
            sum +
            p.bball.ppg * 2.5 +
            p.bball.rpg * 1.2 +
            p.bball.apg * 1.8 +
            p.bball.per * 1.0,
          0
        );
        return { userId: t.user_id, teamName: t.team_name, power };
      })
      .sort((a, b) => b.power - a.power);

    // Pair: seed 1 vs last, seed 2 vs second-last, etc.
    const totalRounds = Math.floor(Math.log2(maxTeams));
    const round1Matchups: Array<{
      matchupIndex: number;
      team1UserId: string;
      team1Name: string;
      team2UserId: string;
      team2Name: string;
    }> = [];

    for (let i = 0; i < rankedTeams.length / 2; i++) {
      round1Matchups.push({
        matchupIndex: i,
        team1UserId: rankedTeams[i].userId,
        team1Name: rankedTeams[i].teamName,
        team2UserId: rankedTeams[rankedTeams.length - 1 - i].userId,
        team2Name: rankedTeams[rankedTeams.length - 1 - i].teamName,
      });
    }

    await startTournament(tournamentId, round1Matchups, totalRounds);
    return NextResponse.json({ tournamentId, status: "active" });
  }
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | grep -E "live-tournaments/route|error"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/live-tournaments/route.ts
git commit -m "feat: update tournament join to use round-1-only bracket model"
```

---

### Task 4: Rewrite GET /api/live-tournaments/[id]

**Files:**
- Modify: `src/app/api/live-tournaments/[id]/route.ts`

Remove auth guard. Rewrite to read from `tournamentGames` instead of `bracketData` events.

- [ ] **Step 1: Replace the route file**

Replace full content of `src/app/api/live-tournaments/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { liveTournamentTeams } from "@/lib/schema";
import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import {
  getTournament,
  getTournamentTeams,
  getTournamentGames,
  BracketStructure,
} from "@/lib/tournament-db";

// Public endpoint — no auth required for GET
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tournament = await getTournament(id);
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  // Waiting state: return lobby info
  if (tournament.status === "waiting") {
    const teams = await getTournamentTeams(id);
    return NextResponse.json({
      id: tournament.id,
      name: tournament.name,
      status: "waiting",
      maxTeams: tournament.max_teams,
      teamCount: teams.length,
      teams: teams.map((t) => ({
        teamName: t.team_name,
        userId: t.user_id,
        joinedAt: t.joined_at,
      })),
    });
  }

  // Active or completed: return bracket + game states
  const bracketData = tournament.bracket_data as BracketStructure | null;
  if (!bracketData) {
    return NextResponse.json({ error: "No bracket data" }, { status: 500 });
  }

  const games = await getTournamentGames(id);

  // Attach game state to each bracket matchup
  const matchups = bracketData.matchups.map((m) => {
    const game = games.find((g) => g.id === m.gameId);
    return {
      gameId: m.gameId,
      round: m.round,
      matchupIndex: m.matchupIndex,
      team1UserId: m.team1UserId,
      team1Name: m.team1Name,
      team2UserId: m.team2UserId,
      team2Name: m.team2Name,
      status: game?.status ?? "pending",
      team1Score: game?.team1_score ?? null,
      team2Score: game?.team2_score ?? null,
      winnerId: game?.winner_id ?? null,
      playedAt: game?.played_at ?? null,
    };
  });

  // Determine calling user's team name (optional — only if session present)
  let userTeamName: string | null = null;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (session?.user) {
      const rows = await db
        .select({ teamName: liveTournamentTeams.teamName })
        .from(liveTournamentTeams)
        .where(
          and(
            eq(liveTournamentTeams.tournamentId, id),
            eq(liveTournamentTeams.userId, session.user.id)
          )
        );
      userTeamName = rows[0]?.teamName ?? null;
    }
  } catch {
    // Not authenticated — that's fine, page is public
  }

  return NextResponse.json({
    id: tournament.id,
    name: tournament.name,
    status: tournament.status,
    maxTeams: tournament.max_teams,
    totalRounds: bracketData.totalRounds,
    matchups,
    userTeamName,
  });
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | grep -E "live-tournaments/\[id\]/route|error"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/live-tournaments/[id]/route.ts
git commit -m "feat: rewrite GET live-tournament/[id] to read from tournamentGames, make public"
```

---

### Task 5: Create GET /api/live-tournaments/[id]/games

**Files:**
- Create: `src/app/api/live-tournaments/[id]/games/route.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/app/api/live-tournaments/[id]/games/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getTournamentGames } from "@/lib/tournament-db";

// Public endpoint — no auth required
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const games = await getTournamentGames(id);
  return NextResponse.json(games);
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | grep -E "games/route|error" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/live-tournaments/[id]/games/route.ts
git commit -m "feat: add GET /api/live-tournaments/[id]/games public endpoint"
```

---

### Task 6: Create POST /api/live-tournaments/[id]/games/[gameId]

**Files:**
- Create: `src/app/api/live-tournaments/[id]/games/[gameId]/route.ts`

This is the atomic play-game endpoint. It claims the game row, simulates, writes result, updates team results, and advances the bracket if a round is complete.

- [ ] **Step 1: Create the file**

```typescript
// src/app/api/live-tournaments/[id]/games/[gameId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getTournament,
  getGame,
  claimGame,
  writeGameResult,
  updateTeamResult,
  getTeamRosterData,
  getTournamentGames,
  appendNextRound,
  completeTournament,
  BracketStructure,
} from "@/lib/tournament-db";
import { simulateMatchup, TournamentTeam, toTournamentPokemon } from "@/app/utils/tournamentEngine";

async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; gameId: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: tournamentId, gameId } = await params;

  const tournament = await getTournament(tournamentId);
  if (!tournament || tournament.status !== "active") {
    return NextResponse.json({ error: "Tournament not active" }, { status: 400 });
  }

  // Try to atomically claim the game
  const claimed = await claimGame(gameId);
  if (!claimed) {
    // Already completed or being simulated — return existing result
    const existing = await getGame(gameId);
    if (!existing) return NextResponse.json({ error: "Game not found" }, { status: 404 });
    return NextResponse.json({
      status: existing.status,
      team1Score: existing.team1Score,
      team2Score: existing.team2Score,
      winnerId: existing.winnerId,
      events: existing.events,
    });
  }

  // Load roster data for both teams
  const [team1Data, team2Data] = await Promise.all([
    getTeamRosterData(tournamentId, claimed.team1UserId!),
    getTeamRosterData(tournamentId, claimed.team2UserId!),
  ]);

  if (!team1Data || !team2Data) {
    return NextResponse.json({ error: "Team data not found" }, { status: 500 });
  }

  // Convert to TournamentTeam format for simulation
  const makeTeam = (userId: string, name: string, rosterData: unknown): TournamentTeam => ({
    id: userId,
    name,
    coast: "west",
    seed: 1,
    isPlayer: true,
    roster: (rosterData as Parameters<typeof toTournamentPokemon>[0][]).map(toTournamentPokemon),
  });

  const team1 = makeTeam(claimed.team1UserId!, team1Data.team_name, team1Data.roster_data);
  const team2 = makeTeam(claimed.team2UserId!, team2Data.team_name, team2Data.roster_data);

  // Simulate the game
  const result = simulateMatchup(team1, team2);
  const team1Score = result.finalHomeScore;
  const team2Score = result.finalAwayScore;
  // result.winner is "home" | "away" — team1 is passed as homeTeam
  const winnerId = result.winner === "home" ? claimed.team1UserId! : claimed.team2UserId!;
  const loserId = winnerId === claimed.team1UserId ? claimed.team2UserId! : claimed.team1UserId!;

  // Write game result
  await writeGameResult(gameId, team1Score, team2Score, winnerId, result.events);

  // Determine current round
  const bracket = tournament.bracket_data as BracketStructure;
  const currentRound = claimed.round;

  // Update loser's result
  await updateTeamResult(tournamentId, loserId, "eliminated", currentRound);

  // Check if all games in this round are now complete
  const allGames = await getTournamentGames(tournamentId);
  const roundGames = allGames.filter((g) => g.round === currentRound);
  const allRoundDone = roundGames.every((g) => g.status === "completed");

  if (allRoundDone) {
    const nextRound = currentRound + 1;
    const isFinal = nextRound > bracket.totalRounds;

    if (isFinal) {
      // Tournament complete — mark winner and finalist
      const finalGames = roundGames;
      const finalGame = finalGames[0]; // Only 1 game in the final round
      const finalWinnerId = finalGame.winner_id!;
      const finalLoserId = finalWinnerId === finalGame.team1_user_id
        ? finalGame.team2_user_id!
        : finalGame.team1_user_id!;

      await updateTeamResult(tournamentId, finalWinnerId, "champion", currentRound);
      await updateTeamResult(tournamentId, finalLoserId, "finalist", currentRound);
      await completeTournament(tournamentId);
    } else {
      // Advance bracket: pair round winners for next round
      const winners = roundGames.map((g, i) => ({
        matchupIndex: Math.floor(i / 2),
        userId: g.winner_id!,
        name: g.winner_id === g.team1_user_id ? g.team1_name! : g.team2_name!,
      }));

      // Update in_progress players' roundReached
      for (const w of winners) {
        await updateTeamResult(tournamentId, w.userId, "in_progress", nextRound);
      }

      // Pair winners: 0 vs 1, 2 vs 3, etc.
      const nextMatchups = [];
      for (let i = 0; i < winners.length; i += 2) {
        nextMatchups.push({
          matchupIndex: i / 2,
          team1UserId: winners[i].userId,
          team1Name: winners[i].name,
          team2UserId: winners[i + 1].userId,
          team2Name: winners[i + 1].name,
        });
      }
      await appendNextRound(tournamentId, nextRound, nextMatchups);
    }
  }

  return NextResponse.json({
    status: "completed",
    team1Score,
    team2Score,
    winnerId,
    events: result.events,
  });
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | grep -E "games/\[gameId\]|error TS" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/live-tournaments/[id]/games/[gameId]/route.ts
git commit -m "feat: add POST /api/live-tournaments/[id]/games/[gameId] with atomic write model"
```

---

### Task 7: Update GET /api/tournaments

**Files:**
- Modify: `src/app/api/tournaments/route.ts`

- [ ] **Step 1: Read current file**

Read `src/app/api/tournaments/route.ts` to see the current `getAllTournaments` call.

- [ ] **Step 2: Update the limit**

Find the `getAllTournaments(6)` call and change it to `getAllTournaments(100)`.

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | grep "tournaments/route" | head -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/tournaments/route.ts
git commit -m "feat: raise tournament listing limit to 100"
```

---

### Task 8: Create GET /api/users/[id]

**Files:**
- Create: `src/app/api/users/[id]/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/users/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rosters, rosterPokemon } from "@/lib/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { getUserTournamentHistory } from "@/lib/tournament-db";

// Public endpoint — no auth required
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await params;

  // Fetch user from better-auth user table (not in Drizzle schema)
  const userRows = await db.execute(
    sql`SELECT id, name, created_at FROM "user" WHERE id = ${userId} LIMIT 1`
  );
  const userRow = userRows.rows[0] as { id: string; name: string; created_at: string } | undefined;
  if (!userRow) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Fetch tournament history
  const history = await getUserTournamentHistory(userId);

  // Compute stats
  const played = history.length;
  const wins = history.filter((h) => h.result === "champion").length;
  const losses = history.filter((h) => h.result === "eliminated" || h.result === "finalist").length;
  const winRate = played > 0 ? Math.round((wins / played) * 100) : 0;

  // Fetch tournament roster (the one marked isTournamentRoster)
  const rosterRows = await db
    .select({ id: rosters.id, name: rosters.name, city: rosters.city })
    .from(rosters)
    .where(and(eq(rosters.userId, userId), eq(rosters.isTournamentRoster, true)))
    .limit(1);

  let tournamentRoster = null;
  if (rosterRows[0]) {
    const pokemon = await db
      .select()
      .from(rosterPokemon)
      .where(eq(rosterPokemon.rosterId, rosterRows[0].id))
      .orderBy(asc(rosterPokemon.slotPosition));

    tournamentRoster = {
      id: rosterRows[0].id,
      name: rosterRows[0].name,
      city: rosterRows[0].city,
      pokemon: pokemon.map((p) => ({
        slotPosition: p.slotPosition,
        slotLabel: p.slotLabel,
        pokemonId: p.pokemonId,
        pokemonName: p.pokemonName,
        pokemonSprite: p.pokemonSprite,
        pokemonTypes: p.pokemonTypes,
      })),
    };
  }

  return NextResponse.json({
    user: {
      id: userRow.id,
      name: userRow.name,
      createdAt: userRow.created_at,
    },
    stats: { played, wins, losses, winRate },
    tournamentRoster,
    tournamentHistory: history.map((h) => ({
      tournamentId: h.tournament_id,
      tournamentName: h.tournament_name,
      result: h.result,
      roundReached: h.round_reached,
      joinedAt: h.joined_at,
    })),
  });
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | grep -E "api/users|error TS" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/users/[id]/route.ts
git commit -m "feat: add GET /api/users/[id] public profile endpoint"
```

---

### Task 9: Delete old endpoints

**Files:**
- Delete: `src/app/api/live-tournaments/[id]/game/[matchupId]/route.ts`
- Delete: `src/app/api/tournament/simulate/route.ts`

- [ ] **Step 1: Delete old route files**

```bash
rm src/app/api/live-tournaments/[id]/game/[matchupId]/route.ts
rmdir src/app/api/live-tournaments/[id]/game/[matchupId]
rmdir src/app/api/live-tournaments/[id]/game
rm src/app/api/tournament/simulate/route.ts
rmdir src/app/api/tournament/simulate
rmdir src/app/api/tournament
```

- [ ] **Step 2: Verify build (no broken imports)**

```bash
npm run build 2>&1 | grep "error TS" | head -20
```

Expected: no errors. (These files were not imported elsewhere — they were only used as HTTP endpoints.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: remove old game/[matchupId] and tournament/simulate endpoints"
```

---

## Chunk 2: New Pages

### Task 10: Create /tournaments page

**Files:**
- Create: `src/app/tournaments/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
// src/app/tournaments/page.tsx
import Link from "next/link";
import { getAllTournaments } from "@/lib/tournament-db";
import { ThemeToggle } from "@/app/components/ui";

export const revalidate = 30; // Revalidate every 30 seconds

type FilterTab = "all" | "waiting" | "active" | "completed";

const STATUS_LABEL: Record<string, string> = {
  waiting: "⏳ WAITING",
  active: "⚡ ACTIVE",
  completed: "✅ DONE",
};

const STATUS_COLOR: Record<string, string> = {
  waiting: "var(--color-primary)",
  active: "#60ff60",
  completed: "var(--color-text-muted)",
};

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "all" } = await searchParams;
  const currentFilter = (["all", "waiting", "active", "completed"].includes(filter)
    ? filter
    : "all") as FilterTab;

  const all = await getAllTournaments(100);
  const tournaments =
    currentFilter === "all" ? all : all.filter((t) => t.status === currentFilter);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-bg)" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b-3 border-[var(--color-shadow)] px-4 py-3"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="font-pixel text-[10px]" style={{ color: "var(--color-primary-text)" }}>
            ⚡ POKEMON HOOPS
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="font-pixel text-[7px]" style={{ color: "var(--color-primary-text)" }}>
              MY ROSTER
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="font-pixel text-[11px] mb-6" style={{ color: "var(--color-text)" }}>
          ALL TOURNAMENTS
        </h1>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {(["all", "waiting", "active", "completed"] as const).map((tab) => (
            <Link
              key={tab}
              href={`/tournaments?filter=${tab}`}
              className="font-pixel text-[6px] px-3 py-1.5 border-2"
              style={{
                borderColor: currentFilter === tab ? "var(--color-primary)" : "var(--color-border)",
                backgroundColor: currentFilter === tab ? "var(--color-primary)" : "var(--color-surface)",
                color: currentFilter === tab ? "var(--color-primary-text)" : "var(--color-text)",
                boxShadow: currentFilter === tab ? "2px 2px 0 var(--color-shadow)" : "none",
              }}
            >
              {tab.toUpperCase()}
            </Link>
          ))}
        </div>

        {/* Tournament list */}
        {tournaments.length === 0 ? (
          <div className="text-center py-20">
            <p className="font-pixel text-[8px] mb-2" style={{ color: "var(--color-text)" }}>
              NO TOURNAMENTS
            </p>
            <p className="font-pixel text-[6px]" style={{ color: "var(--color-text-muted)" }}>
              CHECK BACK LATER
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tournaments.map((t) => (
              <div
                key={t.id}
                className="border-3 p-4 flex items-center justify-between"
                style={{
                  borderColor: t.status === "active" ? "#60ff60" : t.status === "waiting" ? "var(--color-primary)" : "var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                  boxShadow: "3px 3px 0 var(--color-shadow)",
                }}
              >
                <div>
                  <div
                    className="font-pixel text-[5px] mb-1"
                    style={{ color: STATUS_COLOR[t.status] }}
                  >
                    {STATUS_LABEL[t.status] ?? t.status.toUpperCase()}
                  </div>
                  <p className="font-pixel text-[8px]" style={{ color: "var(--color-text)" }}>
                    {t.name.toUpperCase()}
                  </p>
                  <p className="font-pixel text-[5px] mt-1" style={{ color: "var(--color-text-muted)" }}>
                    {t.team_count}/{t.max_teams} TEAMS
                    {t.status === "completed" && t.winner_name
                      ? ` · 🏆 ${t.winner_name.toUpperCase()}`
                      : ""}
                  </p>
                </div>
                <Link
                  href={`/tournaments/${t.id}`}
                  className="font-pixel text-[6px] px-3 py-2 border-2 border-[var(--color-shadow)] shrink-0"
                  style={{
                    backgroundColor: t.status === "waiting" ? "var(--color-primary)" : "var(--color-surface-alt)",
                    color: t.status === "waiting" ? "var(--color-primary-text)" : "var(--color-text)",
                  }}
                >
                  {t.status === "waiting" ? "JOIN →" : t.status === "active" ? "WATCH →" : "RESULTS →"}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | grep -E "tournaments/page|error TS" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/tournaments/page.tsx
git commit -m "feat: add /tournaments public listing page"
```

---

### Task 11: Create /tournaments/[id] page

**Files:**
- Create: `src/app/tournaments/[id]/page.tsx`

This is the main tournament page. It renders lobby, active bracket, or completed results based on tournament status. Users can play games from here.

- [ ] **Step 1: Create the page**

```typescript
// src/app/tournaments/[id]/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import Link from "next/link";
import { PokeButton, ThemeToggle } from "@/app/components/ui";

interface MatchupState {
  gameId: string;
  round: number;
  matchupIndex: number;
  team1UserId: string;
  team1Name: string;
  team2UserId: string;
  team2Name: string;
  status: string; // "pending" | "in_progress" | "completed"
  team1Score: number | null;
  team2Score: number | null;
  winnerId: string | null;
  playedAt: string | null;
}

interface TournamentState {
  id: string;
  name: string;
  status: string;
  maxTeams: number;
  totalRounds?: number;
  teamCount?: number;
  teams?: { teamName: string; userId: string; joinedAt: string }[];
  matchups?: MatchupState[];
  userTeamName?: string | null;
}

interface GameEvent {
  type: string;
  description: string;
  homeScore: number;
  awayScore: number;
}

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const [tournament, setTournament] = useState<TournamentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playingGame, setPlayingGame] = useState<string | null>(null);
  const [gameEvents, setGameEvents] = useState<GameEvent[]>([]);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  const fetchTournament = useCallback(async () => {
    try {
      const res = await fetch(`/api/live-tournaments/${id}`);
      if (!res.ok) {
        setError("Tournament not found");
        return;
      }
      const data = await res.json();
      setTournament(data);
    } catch {
      setError("Failed to load tournament");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTournament();
    // Poll every 5s while tournament is active
    const interval = setInterval(() => {
      if (tournament?.status === "active") fetchTournament();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchTournament, tournament?.status]);

  const handleJoin = async () => {
    try {
      const res = await fetch("/api/live-tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: id }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      await fetchTournament();
    } catch {
      setError("Failed to join tournament");
    }
  };

  const handlePlayGame = async (gameId: string) => {
    setPlayingGame(gameId);
    setActiveGameId(gameId);
    setGameEvents([]);
    try {
      const res = await fetch(`/api/live-tournaments/${id}/games/${gameId}`, { method: "POST" });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setGameEvents((data.events as GameEvent[]) ?? []);
      await fetchTournament();
    } catch {
      setError("Failed to play game");
    } finally {
      setPlayingGame(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--color-bg)" }}>
        <div className="inline-block w-8 h-8 border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--color-bg)" }}>
        <div className="text-center">
          <p className="font-pixel text-[8px] mb-4" style={{ color: "var(--color-danger)" }}>{error || "TOURNAMENT NOT FOUND"}</p>
          <Link href="/tournaments" className="font-pixel text-[6px] underline" style={{ color: "var(--color-primary)" }}>← ALL TOURNAMENTS</Link>
        </div>
      </div>
    );
  }

  // Group matchups by round
  const rounds: Record<number, MatchupState[]> = {};
  for (const m of tournament.matchups ?? []) {
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  }

  const isParticipant = tournament.userTeamName != null;
  const canJoin = tournament.status === "waiting" && session?.user && !isParticipant;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-bg)" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b-3 border-[var(--color-shadow)] px-4 py-3"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/tournaments" className="font-pixel text-[7px]" style={{ color: "var(--color-primary-text)", opacity: 0.8 }}>
              ← TOURNAMENTS
            </Link>
            <span className="font-pixel text-[9px]" style={{ color: "var(--color-primary-text)" }}>
              {tournament.name.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isParticipant && (
              <span className="font-pixel text-[5px] px-2 py-1" style={{ backgroundColor: "var(--color-accent)", color: "var(--color-shadow)" }}>
                ★ {tournament.userTeamName}
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* WAITING LOBBY */}
        {tournament.status === "waiting" && (
          <div>
            <div className="font-pixel text-[8px] mb-2" style={{ color: "var(--color-primary)" }}>⏳ WAITING FOR PLAYERS</div>
            <p className="font-pixel text-[6px] mb-6" style={{ color: "var(--color-text-muted)" }}>
              {tournament.teamCount}/{tournament.maxTeams} TEAMS JOINED
            </p>
            <div className="mb-6 h-2 border-2 border-[var(--color-shadow)]" style={{ backgroundColor: "var(--color-surface-alt)" }}>
              <div
                className="h-full"
                style={{
                  width: `${((tournament.teamCount ?? 0) / tournament.maxTeams) * 100}%`,
                  backgroundColor: "var(--color-primary)",
                }}
              />
            </div>

            {canJoin && (
              <PokeButton variant="primary" size="md" onClick={handleJoin} className="mb-6">
                ⚡ JOIN TOURNAMENT
              </PokeButton>
            )}
            {!session?.user && (
              <p className="font-pixel text-[6px] mb-6" style={{ color: "var(--color-text-muted)" }}>
                <Link href="/dashboard" className="underline" style={{ color: "var(--color-primary)" }}>SIGN IN</Link> TO JOIN
              </p>
            )}

            <div className="space-y-2">
              {tournament.teams?.map((t, i) => (
                <div key={i} className="border-2 border-[var(--color-border)] p-3" style={{ backgroundColor: "var(--color-surface)" }}>
                  <span className="font-pixel text-[7px]" style={{ color: "var(--color-text)" }}>{t.teamName.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ACTIVE BRACKET */}
        {(tournament.status === "active" || tournament.status === "completed") && (
          <div>
            {tournament.status === "completed" && (
              <div className="mb-8 text-center border-3 border-[var(--color-primary)] p-6" style={{ backgroundColor: "var(--color-surface)" }}>
                <div className="font-pixel text-[8px] mb-2" style={{ color: "var(--color-primary)" }}>🏆 TOURNAMENT COMPLETE</div>
              </div>
            )}

            {Object.entries(rounds)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([round, matchups]) => (
                <div key={round} className="mb-8">
                  <h2 className="font-pixel text-[8px] mb-4" style={{ color: "var(--color-text-muted)" }}>
                    ROUND {round}
                    {Number(round) === tournament.totalRounds ? " — FINAL" : ""}
                  </h2>
                  <div className="space-y-3">
                    {matchups.map((m) => {
                      const userInGame = m.team1UserId === session?.user?.id || m.team2UserId === session?.user?.id;
                      const canPlay = m.status === "pending" && session?.user && tournament.status === "active";
                      return (
                        <div
                          key={m.gameId}
                          className="border-3 p-4"
                          style={{
                            borderColor: m.status === "completed" ? "var(--color-border)" : m.status === "in_progress" ? "#ffd700" : "var(--color-border)",
                            backgroundColor: "var(--color-surface)",
                            boxShadow: "3px 3px 0 var(--color-shadow)",
                          }}
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span
                                  className="font-pixel text-[7px]"
                                  style={{
                                    color: m.winnerId === m.team1UserId ? "var(--color-primary)" : "var(--color-text)",
                                  }}
                                >
                                  {m.team1Name.toUpperCase()}
                                  {m.winnerId === m.team1UserId ? " 🏆" : ""}
                                </span>
                                {m.status === "completed" && (
                                  <span className="font-pixel text-[8px]" style={{ color: "var(--color-text)" }}>
                                    {m.team1Score}
                                  </span>
                                )}
                              </div>
                              <div className="my-1 border-t border-[var(--color-border)]" />
                              <div className="flex items-center justify-between">
                                <span
                                  className="font-pixel text-[7px]"
                                  style={{
                                    color: m.winnerId === m.team2UserId ? "var(--color-primary)" : "var(--color-text)",
                                  }}
                                >
                                  {m.team2Name.toUpperCase()}
                                  {m.winnerId === m.team2UserId ? " 🏆" : ""}
                                </span>
                                {m.status === "completed" && (
                                  <span className="font-pixel text-[8px]" style={{ color: "var(--color-text)" }}>
                                    {m.team2Score}
                                  </span>
                                )}
                              </div>
                            </div>

                            {canPlay && (
                              <PokeButton
                                variant={userInGame ? "primary" : "ghost"}
                                size="sm"
                                disabled={playingGame === m.gameId}
                                onClick={() => handlePlayGame(m.gameId)}
                              >
                                {playingGame === m.gameId ? "..." : "PLAY"}
                              </PokeButton>
                            )}

                            {m.status === "in_progress" && (
                              <span className="font-pixel text-[5px]" style={{ color: "#ffd700" }}>LIVE</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

            {/* Play-by-play events for last played game */}
            {activeGameId && gameEvents.length > 0 && (
              <div className="mt-8 border-3 border-[var(--color-border)] p-4" style={{ backgroundColor: "var(--color-surface)" }}>
                <div className="font-pixel text-[7px] mb-3" style={{ color: "var(--color-primary)" }}>GAME RECAP</div>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {/* Show last 20 events as plain text — TypewriterText only accepts text/speed/onDone/className */}
                  {gameEvents.slice(-20).map((e, i) => (
                    <p
                      key={i}
                      className="font-pixel text-[5px]"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      [{e.homeScore}-{e.awayScore}] {e.description}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | grep -E "tournaments/\[id\]|error TS" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/tournaments/[id]/page.tsx
git commit -m "feat: add /tournaments/[id] public tournament page with bracket and game play"
```

---

### Task 12: Create /rosters/[id]/build page

**Files:**
- Create: `src/app/rosters/[id]/build/page.tsx`

This is a thin wrapper that renders the existing `RosterBuilder` component as a real page. It reads the roster, verifies ownership, and handles navigation.

- [ ] **Step 1: Read RosterBuilder component to understand its props**

Read `src/app/components/RosterBuilder.tsx` lines 1-30 to confirm props: `rosterId`, `rosterName`, `rosterCity`, `onBack`.

- [ ] **Step 2: Create the page**

```typescript
// src/app/rosters/[id]/build/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import RosterBuilder from "@/app/components/RosterBuilder";

export default function RosterBuilderPage() {
  const { id: rosterId } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [rosterName, setRosterName] = useState("");
  const [rosterCity, setRosterCity] = useState("");
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) {
      router.replace("/dashboard");
      return;
    }

    fetch(`/api/rosters/${rosterId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error || data.userId !== session.user.id) {
          setUnauthorized(true);
          return;
        }
        setRosterName(data.name || "Unnamed Roster");
        setRosterCity(data.city || "");
      })
      .catch(() => setUnauthorized(true))
      .finally(() => setLoading(false));
  }, [isPending, session, rosterId, router]);

  if (isPending || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--color-bg)" }}>
        <div className="inline-block w-8 h-8 border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (unauthorized) {
    router.replace("/dashboard");
    return null;
  }

  return (
    <RosterBuilder
      rosterId={rosterId}
      rosterName={rosterName}
      rosterCity={rosterCity}
      onBack={() => router.push("/dashboard")}
    />
  );
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | grep -E "rosters/\[id\]|error TS" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/rosters/[id]/build/page.tsx
git commit -m "feat: add /rosters/[id]/build page as RosterBuilder route"
```

---

### Task 13: Create /users/[id] page

**Files:**
- Create: `src/app/users/[id]/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
// src/app/users/[id]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { ThemeToggle } from "@/app/components/ui";

interface TournamentHistoryEntry {
  tournamentId: string;
  tournamentName: string;
  result: string | null;
  roundReached: number | null;
  joinedAt: string;
}

interface PokemonSlot {
  slotPosition: number;
  slotLabel: string;
  pokemonId: number;
  pokemonName: string;
  pokemonSprite: string | null;
  pokemonTypes: string[];
}

interface UserProfileData {
  user: { id: string; name: string; createdAt: string };
  stats: { played: number; wins: number; losses: number; winRate: number };
  tournamentRoster: {
    id: string;
    name: string;
    city: string;
    pokemon: PokemonSlot[];
  } | null;
  tournamentHistory: TournamentHistoryEntry[];
}

function resultBadge(result: string | null): { label: string; color: string } {
  switch (result) {
    case "champion": return { label: "🏆 CHAMPION", color: "#ffd700" };
    case "finalist": return { label: "🥈 FINALIST", color: "#c0c0c0" };
    case "in_progress": return { label: "⚡ IN PROGRESS", color: "var(--color-primary)" };
    case "waiting": return { label: "⏳ WAITING", color: "var(--color-text-muted)" };
    case "eliminated": return { label: "💀 ELIMINATED", color: "var(--color-danger)" };
    default: return { label: "—", color: "var(--color-text-muted)" };
  }
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/users/${id}`, { cache: "no-store" });

  if (!res.ok) notFound();

  const data: UserProfileData = await res.json();
  const { user, stats, tournamentRoster, tournamentHistory } = data;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-bg)" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b-3 border-[var(--color-shadow)] px-4 py-3"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="font-pixel text-[10px]" style={{ color: "var(--color-primary-text)" }}>
            ⚡ POKEMON HOOPS
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/tournaments" className="font-pixel text-[7px]" style={{ color: "var(--color-primary-text)" }}>
              TOURNAMENTS
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Profile header */}
        <div
          className="border-3 border-[var(--color-border)] p-5 mb-8"
          style={{ backgroundColor: "var(--color-surface)", boxShadow: "4px 4px 0 var(--color-shadow)" }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div>
              <h1 className="font-pixel text-[12px] mb-1" style={{ color: "var(--color-text)" }}>
                {user.name.toUpperCase()}
              </h1>
              <p className="font-pixel text-[5px]" style={{ color: "var(--color-text-muted)" }}>
                TRAINER SINCE {new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase()}
              </p>
            </div>
            <div className="flex gap-4">
              {[
                { label: "PLAYED", value: stats.played, color: "var(--color-text)" },
                { label: "WINS", value: stats.wins, color: "#60ff60" },
                { label: "LOSSES", value: stats.losses, color: "var(--color-danger)" },
                { label: "WIN %", value: `${stats.winRate}%`, color: "var(--color-primary)" },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center">
                  <div className="font-pixel text-[12px]" style={{ color }}>{value}</div>
                  <div className="font-pixel text-[4px] mt-1" style={{ color: "var(--color-text-muted)" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Tournament Roster */}
          <div>
            <h2 className="font-pixel text-[8px] mb-4" style={{ color: "var(--color-text)" }}>
              TOURNAMENT ROSTER
            </h2>
            {tournamentRoster ? (
              <div
                className="border-3 border-[var(--color-border)] p-4"
                style={{ backgroundColor: "var(--color-surface)", boxShadow: "3px 3px 0 var(--color-shadow)" }}
              >
                <p className="font-pixel text-[6px] mb-3" style={{ color: "var(--color-text-muted)" }}>
                  {tournamentRoster.city && `${tournamentRoster.city.toUpperCase()} `}{tournamentRoster.name.toUpperCase()}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {tournamentRoster.pokemon.map((p) => (
                    <div
                      key={p.slotPosition}
                      className="border-2 border-[var(--color-border)] p-2 text-center"
                      style={{ backgroundColor: "var(--color-surface-alt)" }}
                    >
                      {p.pokemonSprite && (
                        <img src={p.pokemonSprite} alt={p.pokemonName} className="w-8 h-8 mx-auto" style={{ imageRendering: "pixelated" }} />
                      )}
                      <p className="font-pixel text-[4px] mt-1 truncate" style={{ color: "var(--color-text)" }}>
                        {p.pokemonName.toUpperCase()}
                      </p>
                      <p className="font-pixel text-[4px]" style={{ color: "var(--color-text-muted)" }}>
                        {p.slotLabel}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                className="border-3 border-dashed border-[var(--color-border)] p-8 text-center"
              >
                <p className="font-pixel text-[6px]" style={{ color: "var(--color-text-muted)" }}>
                  NO TOURNAMENT ROSTER SET
                </p>
              </div>
            )}
          </div>

          {/* Tournament History */}
          <div>
            <h2 className="font-pixel text-[8px] mb-4" style={{ color: "var(--color-text)" }}>
              TOURNAMENT HISTORY
            </h2>
            {tournamentHistory.length === 0 ? (
              <div
                className="border-3 border-dashed border-[var(--color-border)] p-8 text-center"
              >
                <p className="font-pixel text-[6px]" style={{ color: "var(--color-text-muted)" }}>
                  NO TOURNAMENTS YET
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {tournamentHistory.map((h) => {
                  const badge = resultBadge(h.result);
                  return (
                    <Link
                      key={h.tournamentId}
                      href={`/tournaments/${h.tournamentId}`}
                      className="block border-3 p-3 hover:opacity-90 transition-opacity"
                      style={{
                        borderColor: badge.color === "var(--color-danger)" ? "var(--color-danger)" :
                          badge.color === "#ffd700" ? "#ffd700" : "var(--color-border)",
                        borderLeftWidth: "4px",
                        backgroundColor: "var(--color-surface)",
                        boxShadow: "2px 2px 0 var(--color-shadow)",
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-pixel text-[6px] truncate" style={{ color: "var(--color-text)" }}>
                          {h.tournamentName.toUpperCase()}
                        </span>
                        <span className="font-pixel text-[5px] shrink-0 ml-2" style={{ color: badge.color }}>
                          {badge.label}
                          {h.result === "eliminated" && h.roundReached ? ` RD ${h.roundReached}` : ""}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | grep -E "users/\[id\]|error TS" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/users/[id]/page.tsx
git commit -m "feat: add /users/[id] public profile page"
```

---

### Task 14: Create /profile redirect

**Files:**
- Create: `src/app/profile/page.tsx`

- [ ] **Step 1: Create the redirect page**

```typescript
// src/app/profile/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/");
  }
  redirect(`/users/${session.user.id}`);
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | grep -E "profile/page|error TS" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/profile/page.tsx
git commit -m "feat: add /profile redirect to /users/[currentUserId]"
```

---

## Chunk 3: Dashboard Refactor + Navigation + Cleanup

### Task 15: Refactor /dashboard/page.tsx

Remove the `setView` state machine. Dashboard now only renders `RosterDashboard` (or `AuthForm` if not logged in). Navigation to builder and tournaments uses real URLs.

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Replace dashboard page**

Replace full content of `src/app/dashboard/page.tsx`:

```typescript
"use client";

import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import AuthForm from "../components/AuthForm";
import RosterDashboard from "../components/RosterDashboard";

export default function DashboardPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="inline-block w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session?.user) {
    return <AuthForm />;
  }

  return (
    <RosterDashboard
      userName={session.user.name || session.user.email}
      onEditRoster={(rosterId) => router.push(`/rosters/${rosterId}/build`)}
      onJoinLiveTournament={(tournamentId) => router.push(tournamentId ? `/tournaments/${tournamentId}` : "/tournaments")}
    />
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | grep -E "dashboard/page|error TS" | head -20
```

Expected: TypeScript errors pointing to `RosterDashboard` props mismatch — these will be fixed in Task 16.

- [ ] **Step 3: Commit placeholder**

Do NOT commit until Task 16 fixes the prop mismatch.

---

### Task 16: Update RosterDashboard.tsx

Remove `onNewRoster` and `onEnterTournament` props (VS BOTS removed). Update `onEditRoster` to just pass `rosterId`. Add `router.push` for join live tournament.

**Files:**
- Modify: `src/app/components/RosterDashboard.tsx`

- [ ] **Step 1: Update the props interface**

In `src/app/components/RosterDashboard.tsx`, replace the `RosterDashboardProps` interface:

```typescript
interface RosterDashboardProps {
  userName: string;
  onEditRoster: (rosterId: string) => void;
  onJoinLiveTournament: (tournamentId?: string) => void;
}
```

- [ ] **Step 2: Update the component signature**

Replace:
```typescript
export default function RosterDashboard({
  userName,
  onEditRoster,
  onNewRoster,
  onEnterTournament,
  onJoinLiveTournament,
}: RosterDashboardProps) {
```

With:
```typescript
export default function RosterDashboard({
  userName,
  onEditRoster,
  onJoinLiveTournament,
}: RosterDashboardProps) {
```

- [ ] **Step 3: Update the tournament banner buttons**

Find the two buttons in the tournament roster banner:
```typescript
<PokeButton variant="danger" size="sm" onClick={onJoinLiveTournament}>
  ⚡ LIVE
</PokeButton>
<PokeButton variant="primary" size="sm" onClick={onEnterTournament}>
  VS BOTS
</PokeButton>
```

Replace with (remove VS BOTS button):
```typescript
<PokeButton variant="danger" size="sm" onClick={() => onJoinLiveTournament()}>
  ⚡ JOIN LIVE TOURNAMENT
</PokeButton>
```

- [ ] **Step 4: Update onCreate to navigate to builder**

In `handleCreate`, after `if (res.ok)`, replace:
```typescript
const roster = await res.json();
setNewRosterName("");
setNewRosterCity("");
setShowCreateForm(false);
onEditRoster(roster.id);
```

With:
```typescript
const roster = await res.json();
setNewRosterName("");
setNewRosterCity("");
setShowCreateForm(false);
onEditRoster(roster.id);
```

(No change needed — `onEditRoster` will now navigate to the build page.)

- [ ] **Step 5: Verify build**

```bash
npm run build 2>&1 | grep "error TS" | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit dashboard and RosterDashboard together**

```bash
git add src/app/dashboard/page.tsx src/app/components/RosterDashboard.tsx
git commit -m "feat: replace setView state machine with URL-based navigation in dashboard"
```

---

### Task 17: Update navigation in layout/homepage

Add `/tournaments` and `/profile` links to the site header. The `layout.tsx` has no nav — the nav lives in individual pages and `HomePage.tsx`. Update `HomePage.tsx` to add the two new links.

**Files:**
- Modify: `src/app/components/HomePage.tsx`

- [ ] **Step 1: Read current HomePage.tsx nav section**

Read `src/app/components/HomePage.tsx` lines 1-50 to find the existing navigation structure.

- [ ] **Step 2: Add nav links**

Find the navigation element in `HomePage.tsx` (look for existing links to `/dashboard`) and add:
```typescript
<Link href="/tournaments" className="font-pixel text-[7px]" style={{ color: "var(--color-primary-text)" }}>
  TOURNAMENTS
</Link>
<Link href="/profile" className="font-pixel text-[7px]" style={{ color: "var(--color-primary-text)" }}>
  MY PROFILE
</Link>
```

alongside the existing `/dashboard` link.

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | grep "error TS" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/components/HomePage.tsx
git commit -m "feat: add Tournaments and My Profile nav links to homepage"
```

---

### Task 18: Delete old components

**Files:**
- Delete: `src/app/components/TournamentView.tsx`
- Delete: `src/app/components/LiveTournament.tsx`

- [ ] **Step 1: Remove old component files**

```bash
rm src/app/components/TournamentView.tsx
rm src/app/components/LiveTournament.tsx
```

- [ ] **Step 2: Verify build (no broken imports)**

```bash
npm run build 2>&1 | grep "error TS" | head -20
```

Expected: no errors. (These were imported only from `dashboard/page.tsx` which no longer references them.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: remove TournamentView and LiveTournament components (consolidated into /tournaments/[id])"
```

---

### Task 19: Manual smoke test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test public routes (no login)**

- Open `http://localhost:3000/tournaments` — should show tournament list with filter tabs
- Open `http://localhost:3000/tournaments/[a-real-id-from-db]` — should show lobby or bracket
- Open `http://localhost:3000/users/[a-real-user-id]` — should show profile with stats and history
- Open `http://localhost:3000/profile` — should redirect to `/` (not logged in)

- [ ] **Step 3: Test auth routes**

- Sign in at `http://localhost:3000/dashboard`
- Click edit on a roster → should navigate to `/rosters/[id]/build`
- Save roster → should return to `/dashboard`
- Click "JOIN LIVE TOURNAMENT" → should navigate to `/tournaments`
- Open `http://localhost:3000/profile` → should redirect to `/users/[yourId]`

- [ ] **Step 4: Test tournament join + play**

- Create/find a waiting tournament at `/tournaments`
- Join from `/tournaments/[id]`
- When tournament fills and starts, verify bracket shows
- Click PLAY on a game → verify scores appear and bracket updates

- [ ] **Step 5: Verify old URLs are gone**

- `http://localhost:3000/api/tournament/simulate` → 404
- `http://localhost:3000/api/live-tournaments/[id]/game/any-id` → 404

- [ ] **Step 6: Final build check**

```bash
npm run build
```

Expected: clean build with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: final smoke test complete — routing refactor and user profiles done"
```
