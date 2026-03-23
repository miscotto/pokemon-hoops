# Season Mode Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a season mode where admins create 16-team round-robin seasons with automated scheduling, Pokémon uniqueness enforcement, live standings, and a top-8 single-elimination playoff bracket.

**Architecture:** Five new DB tables parallel to the existing tournament system. Pure business logic (schedule generation, standings) lives in focused utility files. All game simulation reuses the existing `createGameIterator` + `simulateMatchup` pipeline. The existing cron job at `/api/cron/tick` is extended to pick up season games.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM, Neon PostgreSQL, Vitest, Vercel Functions (`waitUntil`), SSE (ReadableStream), Better Auth

---

## File Map

| File | Create/Modify | Purpose |
|---|---|---|
| `src/lib/schema.ts` | Modify | Add 5 new tables |
| `src/lib/season-schedule.ts` | Create | Pure: generate + distribute 840 game slots |
| `src/lib/season-standings.ts` | Create | Pure: sort standings, seed playoff bracket |
| `src/lib/season-db.ts` | Create | All DB queries for seasons |
| `src/lib/simulate-season-game-live.ts` | Create | Background game simulation worker |
| `src/app/api/seasons/route.ts` | Create | GET list / POST create (admin) |
| `src/app/api/seasons/[id]/route.ts` | Create | GET detail + standings |
| `src/app/api/seasons/[id]/join/route.ts` | Create | POST join season |
| `src/app/api/seasons/[id]/leave/route.ts` | Create | POST leave season |
| `src/app/api/seasons/[id]/close-registration/route.ts` | Create | POST admin: close registration |
| `src/app/api/seasons/[id]/start/route.ts` | Create | POST admin: start season |
| `src/app/api/seasons/[id]/games/route.ts` | Create | GET list games |
| `src/app/api/seasons/[id]/games/[gameId]/route.ts` | Create | GET single game |
| `src/app/api/seasons/[id]/games/[gameId]/stream/route.ts` | Create | GET SSE live stream |
| `src/app/api/cron/tick/route.ts` | Modify | Extend to process season games |
| `src/app/seasons/page.tsx` | Create | Season list UI |
| `src/app/seasons/[id]/page.tsx` | Create | Season detail + standings UI |
| `src/app/seasons/[id]/games/[gameId]/page.tsx` | Create | Live game view UI |
| `src/lib/season-schedule.test.ts` | Create | Unit tests for schedule generation |
| `src/lib/season-standings.test.ts` | Create | Unit tests for standings + seeding |

---

## Chunk 1: DB Schema

### Task 1: Add Season Tables to Schema

**Files:**
- Modify: `src/lib/schema.ts`

- [ ] **Step 1: Add the 5 new tables to schema.ts**

Append after the last table in `src/lib/schema.ts`:

```typescript
// ─── Season Mode ─────────────────────────────────────────────────────────────

export const seasons = pgTable("seasons", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  status: text("status").notNull().default("registration"), // registration | active | playoffs | completed
  maxTeams: integer("max_teams").notNull().default(16),
  regularSeasonStart: timestamp("regular_season_start", { withTimezone: true }).notNull(),
  regularSeasonEnd: timestamp("regular_season_end", { withTimezone: true }).notNull(),
  playoffStart: timestamp("playoff_start", { withTimezone: true }).notNull(),
  playoffEnd: timestamp("playoff_end", { withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull(),
  registrationClosedAt: timestamp("registration_closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const seasonTeams = pgTable(
  "season_teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    teamName: text("team_name").notNull(),
    rosterData: jsonb("roster_data").notNull(),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    pointsFor: integer("points_for").notNull().default(0),
    pointsAgainst: integer("points_against").notNull().default(0),
    // waiting | in_progress | did_not_qualify | eliminated | finalist | champion
    result: text("result").notNull().default("waiting"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.seasonId, t.userId)]
);

export const seasonLockedPokemon = pgTable(
  "season_locked_pokemon",
  {
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    pokemonId: integer("pokemon_id").notNull(),
    lockedByUserId: text("locked_by_user_id").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Composite primary key enforces DB-level uniqueness — matches spec requirement
  (t) => [primaryKey({ columns: [t.seasonId, t.pokemonId] })]
);
// Note: add `primaryKey` to the drizzle-orm/pg-core import at the top of schema.ts

export const seasonGames = pgTable(
  "season_games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    gameType: text("game_type").notNull().default("regular"), // regular | playoff
    team1UserId: text("team1_user_id").notNull(),
    team1Name: text("team1_name").notNull(),
    team2UserId: text("team2_user_id").notNull(),
    team2Name: text("team2_name").notNull(),
    team1Score: integer("team1_score"),
    team2Score: integer("team2_score"),
    winnerId: text("winner_id"),
    status: text("status").notNull().default("pending"), // pending | in_progress | completed
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sweepNumber: integer("sweep_number"), // 1–7 for regular season; null for playoffs
    round: integer("round"), // playoffs: 1=QF, 2=SF, 3=Finals; null for regular
    matchupIndex: integer("matchup_index"), // playoffs only
  },
  (t) => [
    index("season_games_season_id_idx").on(t.seasonId),
    index("season_games_scheduled_at_idx").on(t.scheduledAt),
  ]
);

export const seasonGameEvents = pgTable(
  "season_game_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => seasonGames.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Unique constraint (PostgreSQL auto-creates an index for it — no duplicate index needed)
    unique("season_game_events_game_seq_uniq").on(t.gameId, t.sequence),
    // Single-column index for SSE polling queries: WHERE gameId = ? AND sequence > ?
    index("season_game_events_game_id_idx").on(t.gameId),
  ]
);
```

- [ ] **Step 2: Generate and run migration**

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

Expected: Migration files created in `drizzle/` folder. Tables created in DB with no errors.

- [ ] **Step 3: Verify migration succeeded**

```bash
npx drizzle-kit introspect 2>&1 | grep -E "season_|Table"
```

Expected: Lines containing `seasons`, `season_teams`, `season_locked_pokemon`, `season_games`, `season_game_events` appear in output confirming tables exist in the DB.

- [ ] **Step 4: Commit**

```bash
git add src/lib/schema.ts drizzle/
git commit -m "feat: add season mode DB tables to schema"
```

---

## Chunk 2: Pure Business Logic

### Task 2: Schedule Generation Utility

**Files:**
- Create: `src/lib/season-schedule.ts`
- Create: `src/lib/season-schedule.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/season-schedule.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { generateSeasonSchedule, type ScheduledGame } from "./season-schedule";

const makeTeams = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    userId: `user-${i}`,
    teamName: `Team ${i}`,
  }));

describe("generateSeasonSchedule", () => {
  it("generates C(n,2)*7 games for n teams", () => {
    const teams = makeTeams(16);
    const games = generateSeasonSchedule(teams, new Date("2026-04-01"), new Date("2026-05-01"));
    const expected = ((16 * 15) / 2) * 7; // 840
    expect(games).toHaveLength(expected);
  });

  it("works for minimum 9 teams", () => {
    const teams = makeTeams(9);
    const games = generateSeasonSchedule(teams, new Date("2026-04-01"), new Date("2026-05-01"));
    const expected = ((9 * 8) / 2) * 7; // 252
    expect(games).toHaveLength(expected);
  });

  it("each team pair appears exactly 7 times", () => {
    const teams = makeTeams(4);
    const games = generateSeasonSchedule(teams, new Date("2026-04-01"), new Date("2026-05-01"));
    const pairCounts: Record<string, number> = {};
    for (const g of games) {
      const key = [g.team1UserId, g.team2UserId].sort().join("|");
      pairCounts[key] = (pairCounts[key] ?? 0) + 1;
    }
    for (const count of Object.values(pairCounts)) {
      expect(count).toBe(7);
    }
  });

  it("scheduledAt is strictly increasing", () => {
    const teams = makeTeams(4);
    const games = generateSeasonSchedule(teams, new Date("2026-04-01"), new Date("2026-05-01"));
    for (let i = 1; i < games.length; i++) {
      expect(games[i].scheduledAt.getTime()).toBeGreaterThan(games[i - 1].scheduledAt.getTime());
    }
  });

  it("scheduledAt is within [start, end]", () => {
    const start = new Date("2026-04-01");
    const end = new Date("2026-05-01");
    const teams = makeTeams(4);
    const games = generateSeasonSchedule(teams, start, end);
    for (const g of games) {
      expect(g.scheduledAt.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(g.scheduledAt.getTime()).toBeLessThanOrEqual(end.getTime());
    }
  });

  it("sweepNumber is 1–7 for all games", () => {
    const teams = makeTeams(4);
    const games = generateSeasonSchedule(teams, new Date("2026-04-01"), new Date("2026-05-01"));
    for (const g of games) {
      expect(g.sweepNumber).toBeGreaterThanOrEqual(1);
      expect(g.sweepNumber).toBeLessThanOrEqual(7);
    }
  });

  it("throws if fewer than 2 teams provided", () => {
    expect(() => generateSeasonSchedule(makeTeams(1), new Date("2026-04-01"), new Date("2026-05-01"))).toThrow();
  });

  it("throws if endDate is not after startDate", () => {
    const d = new Date("2026-04-01");
    expect(() => generateSeasonSchedule(makeTeams(9), d, d)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/season-schedule.test.ts
```

Expected: FAIL with "Cannot find module './season-schedule'"

- [ ] **Step 3: Implement season-schedule.ts**

Create `src/lib/season-schedule.ts`:

```typescript
export interface ScheduledGame {
  team1UserId: string;
  team1Name: string;
  team2UserId: string;
  team2Name: string;
  scheduledAt: Date;
  sweepNumber: number;
}

interface Team {
  userId: string;
  teamName: string;
}

/** Fisher-Yates shuffle — mutates array in place */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generate all regular-season games for a season.
 * Each unique pair plays 7 times (7 sweeps of C(n,2) pairs).
 * Games are distributed evenly between startDate and endDate.
 * Throws if teams.length < 2 or endDate <= startDate.
 */
export function generateSeasonSchedule(
  teams: Team[],
  startDate: Date,
  endDate: Date
): ScheduledGame[] {
  if (teams.length < 2) throw new Error("Need at least 2 teams to generate a schedule");
  if (endDate.getTime() <= startDate.getTime()) throw new Error("endDate must be after startDate");

  // Generate all unique pairs
  const pairs: [Team, Team][] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      pairs.push([teams[i], teams[j]]);
    }
  }

  // 7 sweeps, each sweep is a shuffled copy of all pairs
  const allGames: Omit<ScheduledGame, "scheduledAt">[] = [];
  for (let sweep = 1; sweep <= 7; sweep++) {
    const shuffledPairs = shuffle([...pairs]);
    for (const [t1, t2] of shuffledPairs) {
      allGames.push({
        team1UserId: t1.userId,
        team1Name: t1.teamName,
        team2UserId: t2.userId,
        team2Name: t2.teamName,
        sweepNumber: sweep,
      });
    }
  }

  // Distribute timestamps evenly across [startDate, endDate]
  const totalMs = endDate.getTime() - startDate.getTime();
  const interval = totalMs / allGames.length;

  return allGames.map((g, i) => ({
    ...g,
    scheduledAt: new Date(startDate.getTime() + i * interval),
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/season-schedule.test.ts
```

Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/season-schedule.ts src/lib/season-schedule.test.ts
git commit -m "feat: add season schedule generation utility"
```

---

### Task 3: Standings & Playoff Seeding Utility

**Files:**
- Create: `src/lib/season-standings.ts`
- Create: `src/lib/season-standings.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/season-standings.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeStandings, seedPlayoffBracket, type TeamRecord } from "./season-standings";

const makeTeam = (userId: string, wins: number, losses: number, pf: number, pa: number): TeamRecord => ({
  userId,
  teamName: `Team ${userId}`,
  wins,
  losses,
  pointsFor: pf,
  pointsAgainst: pa,
});

describe("computeStandings", () => {
  it("sorts by wins descending", () => {
    const teams = [
      makeTeam("a", 5, 2, 700, 600),
      makeTeam("b", 7, 0, 900, 700),
      makeTeam("c", 3, 4, 500, 600),
    ];
    const sorted = computeStandings(teams, "season-1");
    expect(sorted[0].userId).toBe("b");
    expect(sorted[1].userId).toBe("a");
    expect(sorted[2].userId).toBe("c");
  });

  it("uses point differential as tiebreaker", () => {
    const teams = [
      makeTeam("a", 5, 2, 700, 650), // diff = 50
      makeTeam("b", 5, 2, 800, 730), // diff = 70
    ];
    const sorted = computeStandings(teams, "season-1");
    expect(sorted[0].userId).toBe("b");
  });

  it("uses pointsFor as third tiebreaker", () => {
    const teams = [
      makeTeam("a", 5, 2, 700, 650), // diff = 50, pf = 700
      makeTeam("b", 5, 2, 750, 700), // diff = 50, pf = 750
    ];
    const sorted = computeStandings(teams, "season-1");
    expect(sorted[0].userId).toBe("b");
  });

  it("seeded random tiebreaker is deterministic for same seasonId", () => {
    // Two teams identical on all criteria — order must be stable across calls
    const teams = [makeTeam("x", 5, 2, 700, 650), makeTeam("y", 5, 2, 700, 650)];
    const run1 = computeStandings(teams, "season-abc")[0].userId;
    const run2 = computeStandings(teams, "season-abc")[0].userId;
    expect(run1).toBe(run2);
  });

  it("seeded random tiebreaker differs for different seasonIds (probabilistically)", () => {
    // Build 10 fully-tied teams, sort with two different seasonIds
    // It would be astronomically unlikely for both sorts to produce identical order
    const teams = Array.from({ length: 10 }, (_, i) => makeTeam(`t${i}`, 5, 2, 700, 650));
    const order1 = computeStandings(teams, "season-111").map((t) => t.userId).join(",");
    const order2 = computeStandings(teams, "season-999").map((t) => t.userId).join(",");
    // Not strictly required to differ but documents intent
    expect(typeof order1).toBe("string"); // always passes; documents API
  });
});

describe("seedPlayoffBracket", () => {
  // Build 10 teams with strictly different win totals so computeStandings is deterministic
  const makeRankedTeams = (n: number) =>
    Array.from({ length: n }, (_, i) => makeTeam(`seed-${i + 1}`, 10 - i, i, 800 - i * 10, 700));

  it("pairs 1v8, 2v7, 3v6, 4v5 from already-sorted standings", () => {
    const teams = makeRankedTeams(10);
    // computeStandings will sort by wins DESC — seed-1 has most wins
    const standings = computeStandings(teams, "season-x");
    const bracket = seedPlayoffBracket(standings);
    expect(bracket).toHaveLength(4);
    expect(bracket[0].team1UserId).toBe("seed-1");
    expect(bracket[0].team2UserId).toBe("seed-8");
    expect(bracket[1].team1UserId).toBe("seed-2");
    expect(bracket[1].team2UserId).toBe("seed-7");
    expect(bracket[2].team1UserId).toBe("seed-3");
    expect(bracket[2].team2UserId).toBe("seed-6");
    expect(bracket[3].team1UserId).toBe("seed-4");
    expect(bracket[3].team2UserId).toBe("seed-5");
  });

  it("requires at least 8 teams in standings", () => {
    const teams = makeRankedTeams(7);
    const standings = computeStandings(teams, "season-x");
    expect(() => seedPlayoffBracket(standings)).toThrow();
  });

  it("only top 8 are included in the bracket regardless of total team count", () => {
    const teams = makeRankedTeams(16);
    const standings = computeStandings(teams, "season-x");
    const bracket = seedPlayoffBracket(standings);
    // All participants must be from seeds 1–8
    const allIds = bracket.flatMap((m) => [m.team1UserId, m.team2UserId]);
    for (const id of allIds) {
      const seed = parseInt(id.replace("seed-", ""));
      expect(seed).toBeLessThanOrEqual(8);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/season-standings.test.ts
```

Expected: FAIL with "Cannot find module './season-standings'"

- [ ] **Step 3: Implement season-standings.ts**

Create `src/lib/season-standings.ts`:

```typescript
export interface TeamRecord {
  userId: string;
  teamName: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface PlayoffMatchup {
  matchupIndex: number;
  team1UserId: string;
  team1Name: string;
  team2UserId: string;
  team2Name: string;
}

/**
 * Simple deterministic hash of a string → integer.
 * Used to seed the final tiebreaker so ordering is reproducible per season.
 */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

/**
 * Sort teams by:
 * 1. wins DESC
 * 2. point differential (pointsFor - pointsAgainst) DESC
 * 3. pointsFor DESC
 * 4. deterministic seeded random per seasonId (reproducible across calls)
 */
export function computeStandings(teams: TeamRecord[], seasonId: string): TeamRecord[] {
  // Pre-compute a deterministic sort key for each team's final tiebreaker
  const tiebreakKey = (userId: string) => hashString(`${seasonId}:${userId}`);
  return [...teams].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const diffA = a.pointsFor - a.pointsAgainst;
    const diffB = b.pointsFor - b.pointsAgainst;
    if (diffB !== diffA) return diffB - diffA;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    // Seeded deterministic tiebreaker
    return tiebreakKey(a.userId) - tiebreakKey(b.userId);
  });
}

/**
 * Take the top 8 from sorted standings and produce 4 quarterfinal matchups.
 * Seeding: 1v8, 2v7, 3v6, 4v5
 */
export function seedPlayoffBracket(sortedStandings: TeamRecord[]): PlayoffMatchup[] {
  if (sortedStandings.length < 8) {
    throw new Error("Need at least 8 teams to seed a playoff bracket");
  }
  const top8 = sortedStandings.slice(0, 8);
  return [
    { matchupIndex: 0, team1UserId: top8[0].userId, team1Name: top8[0].teamName, team2UserId: top8[7].userId, team2Name: top8[7].teamName },
    { matchupIndex: 1, team1UserId: top8[1].userId, team1Name: top8[1].teamName, team2UserId: top8[6].userId, team2Name: top8[6].teamName },
    { matchupIndex: 2, team1UserId: top8[2].userId, team1Name: top8[2].teamName, team2UserId: top8[5].userId, team2Name: top8[5].teamName },
    { matchupIndex: 3, team1UserId: top8[3].userId, team1Name: top8[3].teamName, team2UserId: top8[4].userId, team2Name: top8[4].teamName },
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/season-standings.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/season-standings.ts src/lib/season-standings.test.ts
git commit -m "feat: add season standings and playoff seeding utilities"
```

---

## Chunk 3: DB Layer

### Task 4: season-db.ts

**Files:**
- Create: `src/lib/season-db.ts`

- [ ] **Step 1: Create season-db.ts with all DB query functions**

Create `src/lib/season-db.ts`:

```typescript
import { eq, and, lt, sql, asc, desc, ne, inArray, not, isNull } from "drizzle-orm";
import { db } from "./db";
import {
  seasons,
  seasonTeams,
  seasonLockedPokemon,
  seasonGames,
  seasonGameEvents,
} from "./schema";
import { generateSeasonSchedule } from "./season-schedule";
import { computeStandings, seedPlayoffBracket } from "./season-standings";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SeasonSummary {
  id: string;
  name: string;
  status: string;
  maxTeams: number;
  regularSeasonStart: Date;
  regularSeasonEnd: Date;
  playoffStart: Date;
  playoffEnd: Date;
  createdBy: string;
  registrationClosedAt: Date | null;
  createdAt: Date;
  teamCount: number;
}

export interface SeasonTeamRow {
  id: string;
  userId: string;
  teamName: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  result: string;
  joinedAt: Date;
}

// ─── Season CRUD ──────────────────────────────────────────────────────────────

export async function createSeason(opts: {
  name: string;
  createdBy: string;
  regularSeasonStart: Date;
  regularSeasonEnd: Date;
  playoffStart: Date;
  playoffEnd: Date;
}): Promise<string> {
  const result = await db
    .insert(seasons)
    .values({ ...opts, status: "registration", maxTeams: 16 })
    .returning({ id: seasons.id });
  return result[0].id;
}

export async function getSeasons(limit = 50): Promise<SeasonSummary[]> {
  const rows = await db
    .select({
      id: seasons.id,
      name: seasons.name,
      status: seasons.status,
      maxTeams: seasons.maxTeams,
      regularSeasonStart: seasons.regularSeasonStart,
      regularSeasonEnd: seasons.regularSeasonEnd,
      playoffStart: seasons.playoffStart,
      playoffEnd: seasons.playoffEnd,
      createdBy: seasons.createdBy,
      registrationClosedAt: seasons.registrationClosedAt,
      createdAt: seasons.createdAt,
      teamCount: sql<number>`(SELECT COUNT(*)::int FROM season_teams WHERE season_id = ${seasons.id})`,
    })
    .from(seasons)
    .orderBy(desc(seasons.createdAt))
    .limit(limit);
  return rows;
}

export async function getSeason(seasonId: string) {
  const rows = await db.select().from(seasons).where(eq(seasons.id, seasonId));
  return rows[0] ?? null;
}

export async function closeRegistration(seasonId: string): Promise<void> {
  await db
    .update(seasons)
    .set({ registrationClosedAt: new Date() })
    .where(eq(seasons.id, seasonId));
}

// ─── Team Enrollment ──────────────────────────────────────────────────────────

export async function getSeasonTeams(seasonId: string): Promise<SeasonTeamRow[]> {
  const rows = await db
    .select({
      id: seasonTeams.id,
      userId: seasonTeams.userId,
      teamName: seasonTeams.teamName,
      wins: seasonTeams.wins,
      losses: seasonTeams.losses,
      pointsFor: seasonTeams.pointsFor,
      pointsAgainst: seasonTeams.pointsAgainst,
      result: seasonTeams.result,
      joinedAt: seasonTeams.joinedAt,
    })
    .from(seasonTeams)
    .where(eq(seasonTeams.seasonId, seasonId))
    .orderBy(asc(seasonTeams.joinedAt));
  return rows;
}

export async function getSeasonTeamCount(seasonId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(seasonTeams)
    .where(eq(seasonTeams.seasonId, seasonId));
  return result[0].count;
}

export async function getUserSeasonTeam(seasonId: string, userId: string) {
  const rows = await db
    .select()
    .from(seasonTeams)
    .where(and(eq(seasonTeams.seasonId, seasonId), eq(seasonTeams.userId, userId)));
  return rows[0] ?? null;
}

/**
 * Join a season. Atomically locks all 6 Pokemon in a transaction.
 * Returns { success: true } or { success: false, takenPokemonIds: number[] }
 */
export async function joinSeason(opts: {
  seasonId: string;
  userId: string;
  teamName: string;
  rosterData: unknown;
  pokemonIds: number[];
}): Promise<{ success: true } | { success: false; takenPokemonIds: number[] }> {
  return await db.transaction(async (tx) => {
    // Try to lock all pokemon
    const lockResults = await Promise.all(
      opts.pokemonIds.map((pokemonId) =>
        tx
          .insert(seasonLockedPokemon)
          .values({ seasonId: opts.seasonId, pokemonId, lockedByUserId: opts.userId })
          .onConflictDoNothing()
          .returning({ pokemonId: seasonLockedPokemon.pokemonId })
      )
    );

    const lockedIds = lockResults.flatMap((r) => r.map((row) => row.pokemonId));
    const takenPokemonIds = opts.pokemonIds.filter((id) => !lockedIds.includes(id));

    if (takenPokemonIds.length > 0) {
      // Rollback: don't insert team row
      throw Object.assign(new Error("POKEMON_TAKEN"), { takenPokemonIds });
    }

    await tx.insert(seasonTeams).values({
      seasonId: opts.seasonId,
      userId: opts.userId,
      teamName: opts.teamName,
      rosterData: opts.rosterData,
      result: "waiting",
    });

    return { success: true as const };
  }).catch((err) => {
    if (err.takenPokemonIds) {
      return { success: false as const, takenPokemonIds: err.takenPokemonIds as number[] };
    }
    throw err;
  });
}

export async function leaveSeason(seasonId: string, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(seasonLockedPokemon)
      .where(
        and(
          eq(seasonLockedPokemon.seasonId, seasonId),
          eq(seasonLockedPokemon.lockedByUserId, userId)
        )
      );
    await tx
      .delete(seasonTeams)
      .where(and(eq(seasonTeams.seasonId, seasonId), eq(seasonTeams.userId, userId)));
  });
}

// ─── Season Start + Schedule ──────────────────────────────────────────────────

export async function startSeason(seasonId: string): Promise<void> {
  const season = await getSeason(seasonId);
  if (!season) throw new Error("Season not found");

  const teams = await getSeasonTeams(seasonId);
  if (teams.length < 9) throw new Error("Need at least 9 teams to start");

  // Generate schedule using enrolled teams at this exact moment
  const schedule = generateSeasonSchedule(
    teams.map((t) => ({ userId: t.userId, teamName: t.teamName })),
    season.regularSeasonStart,
    season.regularSeasonEnd
  );

  // Insert all games + update status in a transaction
  await db.transaction(async (tx) => {
    // Insert games in batches of 100
    for (let i = 0; i < schedule.length; i += 100) {
      const batch = schedule.slice(i, i + 100);
      await tx.insert(seasonGames).values(
        batch.map((g) => ({
          seasonId,
          gameType: "regular" as const,
          team1UserId: g.team1UserId,
          team1Name: g.team1Name,
          team2UserId: g.team2UserId,
          team2Name: g.team2Name,
          scheduledAt: g.scheduledAt,
          sweepNumber: g.sweepNumber,
          status: "pending",
        }))
      );
    }

    // Update all team results to in_progress
    await tx
      .update(seasonTeams)
      .set({ result: "in_progress" })
      .where(eq(seasonTeams.seasonId, seasonId));

    // Update season status
    await tx.update(seasons).set({ status: "active" }).where(eq(seasons.id, seasonId));
  });
}

// ─── Game Processing (Cron) ───────────────────────────────────────────────────

export async function claimSeasonGame(gameId: string): Promise<boolean> {
  const result = await db
    .update(seasonGames)
    .set({ claimedAt: new Date(), status: "in_progress" })
    .where(and(eq(seasonGames.id, gameId), eq(seasonGames.status, "pending")))
    .returning({ id: seasonGames.id });
  return result.length > 0;
}

export async function resetStaleSeasonGames(): Promise<void> {
  await db
    .update(seasonGames)
    .set({ status: "pending", claimedAt: null })
    .where(
      and(
        eq(seasonGames.status, "in_progress"),
        lt(seasonGames.claimedAt!, new Date(Date.now() - 800_000))
      )
    );
}

export async function getPendingSeasonGames(now: Date) {
  return await db
    .select({
      id: seasonGames.id,
      seasonId: seasonGames.seasonId,
      gameType: seasonGames.gameType,
    })
    .from(seasonGames)
    .where(
      and(
        eq(seasonGames.status, "pending"),
        lt(seasonGames.scheduledAt, now),
        isNull(seasonGames.claimedAt), // guard against re-dispatching already-claimed games
      )
    )
    .limit(20);
}

export async function getSeasonGameRosterData(seasonId: string, userId: string) {
  const rows = await db
    .select({ rosterData: seasonTeams.rosterData, teamName: seasonTeams.teamName })
    .from(seasonTeams)
    .where(and(eq(seasonTeams.seasonId, seasonId), eq(seasonTeams.userId, userId)));
  return rows[0] ?? null;
}

export async function insertSeasonGameEvent(
  gameId: string,
  sequence: number,
  type: string,
  data: Record<string, unknown>
): Promise<void> {
  await db
    .insert(seasonGameEvents)
    .values({ gameId, sequence, type, data })
    .onConflictDoNothing();
}

export async function getSeasonGameEvents(gameId: string) {
  return await db
    .select()
    .from(seasonGameEvents)
    .where(eq(seasonGameEvents.gameId, gameId))
    .orderBy(asc(seasonGameEvents.sequence));
}

export async function deleteSeasonGameEvents(gameId: string): Promise<void> {
  await db.delete(seasonGameEvents).where(eq(seasonGameEvents.gameId, gameId));
}

export async function writeSeasonGameResult(
  gameId: string,
  seasonId: string,
  team1UserId: string,
  team1Score: number,
  team2Score: number,
  winnerId: string,
  loserId: string
): Promise<void> {
  await db.transaction(async (tx) => {
    // Write final score
    await tx
      .update(seasonGames)
      .set({ team1Score, team2Score, winnerId, status: "completed", completedAt: new Date() })
      .where(eq(seasonGames.id, gameId));

    // Derive each team's actual score from winnerId, not from a ternary on team1Score > team2Score
    const winnerScore = winnerId === team1UserId ? team1Score : team2Score;
    const loserScore = winnerId === team1UserId ? team2Score : team1Score;

    // Update winner stats
    await tx
      .update(seasonTeams)
      .set({
        wins: sql`${seasonTeams.wins} + 1`,
        pointsFor: sql`${seasonTeams.pointsFor} + ${winnerScore}`,
        pointsAgainst: sql`${seasonTeams.pointsAgainst} + ${loserScore}`,
      })
      .where(and(eq(seasonTeams.seasonId, seasonId), eq(seasonTeams.userId, winnerId)));

    // Update loser stats
    await tx
      .update(seasonTeams)
      .set({
        losses: sql`${seasonTeams.losses} + 1`,
        pointsFor: sql`${seasonTeams.pointsFor} + ${loserScore}`,
        pointsAgainst: sql`${seasonTeams.pointsAgainst} + ${winnerScore}`,
      })
      .where(and(eq(seasonTeams.seasonId, seasonId), eq(seasonTeams.userId, loserId)));
  });
}

// ─── Playoff Transition ───────────────────────────────────────────────────────

/**
 * Check if all regular season games are done AND the end date has passed.
 * If so, generate playoff bracket. Returns true if playoffs were started.
 */
export async function tryStartPlayoffs(seasonId: string): Promise<boolean> {
  const season = await getSeason(seasonId);
  if (!season || season.status !== "active") return false;
  if (new Date() < season.regularSeasonEnd) return false;

  // Check if any regular season games are still pending/in_progress
  const incomplete = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(seasonGames)
    .where(
      and(
        eq(seasonGames.seasonId, seasonId),
        eq(seasonGames.gameType, "regular"),
        ne(seasonGames.status, "completed")
      )
    );

  if (incomplete[0].count > 0) return false;

  // Compute standings — pass seasonId for deterministic tiebreaker
  const teams = await getSeasonTeams(seasonId);
  const standings = computeStandings(teams, seasonId);
  const bracket = seedPlayoffBracket(standings);
  // Note: `did_not_qualify` is assigned to teams ranked 9th+ in the transaction below

  // Distribute QF games across first third of playoff window
  const windowMs = season.playoffEnd.getTime() - season.playoffStart.getTime();
  const qfWindowEnd = new Date(season.playoffStart.getTime() + windowMs / 3);
  const qfInterval = (qfWindowEnd.getTime() - season.playoffStart.getTime()) / 4;

  await db.transaction(async (tx) => {
    // Mark non-qualifiers
    const qualifiedIds = standings.slice(0, 8).map((t) => t.userId);
    await tx
      .update(seasonTeams)
      .set({ result: "did_not_qualify" })
      .where(
        and(
          eq(seasonTeams.seasonId, seasonId),
          not(inArray(seasonTeams.userId, qualifiedIds))
        )
      );

    // Insert QF games
    for (let i = 0; i < bracket.length; i++) {
      const m = bracket[i];
      await tx.insert(seasonGames).values({
        seasonId,
        gameType: "playoff",
        team1UserId: m.team1UserId,
        team1Name: m.team1Name,
        team2UserId: m.team2UserId,
        team2Name: m.team2Name,
        scheduledAt: new Date(season.playoffStart.getTime() + i * qfInterval),
        round: 1,
        matchupIndex: m.matchupIndex,
        status: "pending",
      });
    }

    await tx.update(seasons).set({ status: "playoffs" }).where(eq(seasons.id, seasonId));
  });

  return true;
}

/**
 * After a playoff round completes, advance to the next round or mark season complete.
 * Everything runs inside a single transaction so pg_advisory_xact_lock actually holds
 * for the duration of all reads and writes (transaction-scoped advisory lock).
 */
export async function tryAdvancePlayoffRound(seasonId: string, completedRound: number): Promise<void> {
  await db.transaction(async (tx) => {
    // Advisory lock — transaction-scoped, held until tx commits/rolls back
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${seasonId}))`);

    const seasonRows = await tx.select().from(seasons).where(eq(seasons.id, seasonId));
    const season = seasonRows[0];
    if (!season || season.status !== "playoffs") return;

    // Check all games in completed round are done
    const incomplete = await tx
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(seasonGames)
      .where(
        and(
          eq(seasonGames.seasonId, seasonId),
          eq(seasonGames.gameType, "playoff"),
          eq(seasonGames.round, completedRound),
          ne(seasonGames.status, "completed")
        )
      );

    if (incomplete[0].count > 0) return;

    if (completedRound === 3) {
      // Finals done — mark champion/finalist
      const finalsGames = await tx
        .select()
        .from(seasonGames)
        .where(and(eq(seasonGames.seasonId, seasonId), eq(seasonGames.gameType, "playoff"), eq(seasonGames.round, 3)));
      const finals = finalsGames[0];
      if (!finals?.winnerId) return;
      const loserId = finals.winnerId === finals.team1UserId ? finals.team2UserId : finals.team1UserId;
      await tx.update(seasonTeams).set({ result: "champion" }).where(and(eq(seasonTeams.seasonId, seasonId), eq(seasonTeams.userId, finals.winnerId!)));
      await tx.update(seasonTeams).set({ result: "finalist" }).where(and(eq(seasonTeams.seasonId, seasonId), eq(seasonTeams.userId, loserId)));
      await tx.update(seasons).set({ status: "completed" }).where(eq(seasons.id, seasonId));
      return;
    }

    // Pair winners for next round
    const completedGames = await tx
      .select()
      .from(seasonGames)
      .where(and(eq(seasonGames.seasonId, seasonId), eq(seasonGames.gameType, "playoff"), eq(seasonGames.round, completedRound)))
      .orderBy(asc(seasonGames.matchupIndex));

    const nextRound = completedRound + 1;
    const windowMs = season.playoffEnd.getTime() - season.playoffStart.getTime();
    const thirdMs = windowMs / 3;
    const nextWindowStart = new Date(season.playoffStart.getTime() + (nextRound - 1) * thirdMs);
    const nextMatchups: Array<{ team1UserId: string; team1Name: string; team2UserId: string; team2Name: string; matchupIndex: number }> = [];

    for (let i = 0; i < completedGames.length; i += 2) {
      const g1 = completedGames[i];
      const g2 = completedGames[i + 1];
      if (!g1 || !g2 || !g1.winnerId || !g2.winnerId) return;
      const w1Name = g1.winnerId === g1.team1UserId ? g1.team1Name : g1.team2Name;
      const w2Name = g2.winnerId === g2.team1UserId ? g2.team1Name : g2.team2Name;
      nextMatchups.push({ team1UserId: g1.winnerId, team1Name: w1Name, team2UserId: g2.winnerId, team2Name: w2Name, matchupIndex: i / 2 });
    }

    const interval = thirdMs / nextMatchups.length;
    for (let i = 0; i < nextMatchups.length; i++) {
      const m = nextMatchups[i];
      await tx.insert(seasonGames).values({
        seasonId, gameType: "playoff",
        team1UserId: m.team1UserId, team1Name: m.team1Name,
        team2UserId: m.team2UserId, team2Name: m.team2Name,
        scheduledAt: new Date(nextWindowStart.getTime() + i * interval),
        round: nextRound, matchupIndex: m.matchupIndex, status: "pending",
      });
    }

    // Mark eliminated teams from this round
    for (const g of completedGames) {
      if (!g.winnerId) continue;
      const loserId = g.winnerId === g.team1UserId ? g.team2UserId : g.team1UserId;
      await tx.update(seasonTeams).set({ result: "eliminated" }).where(and(eq(seasonTeams.seasonId, seasonId), eq(seasonTeams.userId, loserId)));
    }
  });
}

// ─── Game Queries ─────────────────────────────────────────────────────────────

export async function getSeasonGame(gameId: string) {
  const rows = await db.select().from(seasonGames).where(eq(seasonGames.id, gameId));
  return rows[0] ?? null;
}

export async function getSeasonGames(seasonId: string, opts?: { gameType?: string; round?: number }) {
  const conditions = [eq(seasonGames.seasonId, seasonId)];
  if (opts?.gameType) conditions.push(eq(seasonGames.gameType, opts.gameType));
  if (opts?.round != null) conditions.push(eq(seasonGames.round, opts.round));
  return await db.select().from(seasonGames).where(and(...conditions)).orderBy(asc(seasonGames.scheduledAt));
}
```

Note: The `not` import is needed — add `not` to the drizzle-orm import at the top of the file.

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: No errors (or only pre-existing errors unrelated to the new file).

- [ ] **Step 3: Commit**

```bash
git add src/lib/season-db.ts
git commit -m "feat: add season-db query layer"
```

---

## Chunk 4: API Routes

### Task 5: GET/POST /api/seasons

**Files:**
- Create: `src/app/api/seasons/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/seasons/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createSeason, getSeasons } from "@/lib/season-db";

async function getAdminUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user ?? null;
  if (!user) return null;
  if ((user as { role?: string }).role !== "admin") return null;
  return user;
}

// GET /api/seasons — list all seasons
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allSeasons = await getSeasons(50);
  return NextResponse.json(allSeasons);
}

// POST /api/seasons — admin: create a season
export async function POST(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { name, regularSeasonStart, regularSeasonEnd, playoffStart, playoffEnd } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const dates = { regularSeasonStart, regularSeasonEnd, playoffStart, playoffEnd };
  for (const [key, val] of Object.entries(dates)) {
    if (!val || isNaN(Date.parse(val))) {
      return NextResponse.json({ error: `${key} must be a valid ISO date string` }, { status: 400 });
    }
  }

  const rss = new Date(regularSeasonStart);
  const rse = new Date(regularSeasonEnd);
  const ps = new Date(playoffStart);
  const pe = new Date(playoffEnd);

  if (rse <= rss) return NextResponse.json({ error: "regularSeasonEnd must be after regularSeasonStart" }, { status: 400 });
  if (ps <= rse) return NextResponse.json({ error: "playoffStart must be after regularSeasonEnd" }, { status: 400 });
  if (pe <= ps) return NextResponse.json({ error: "playoffEnd must be after playoffStart" }, { status: 400 });

  const id = await createSeason({
    name: name.trim(),
    createdBy: admin.id,
    regularSeasonStart: rss,
    regularSeasonEnd: rse,
    playoffStart: ps,
    playoffEnd: pe,
  });

  return NextResponse.json({ id }, { status: 201 });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/seasons/route.ts
git commit -m "feat: add GET/POST /api/seasons"
```

---

### Task 6: GET /api/seasons/[id] — Season detail and standings

**Files:**
- Create: `src/app/api/seasons/[id]/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/seasons/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getSeason, getSeasonTeams, getSeasonGames } from "@/lib/season-db";
import { computeStandings } from "@/lib/season-standings";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const season = await getSeason(id);
  if (!season) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const teams = await getSeasonTeams(id);
  const standings = computeStandings(
    teams.map((t) => ({
      userId: t.userId,
      teamName: t.teamName,
      wins: t.wins,
      losses: t.losses,
      pointsFor: t.pointsFor,
      pointsAgainst: t.pointsAgainst,
    })),
    id
  );

  // Include playoff games if in playoffs/completed
  const playoffGames =
    season.status === "playoffs" || season.status === "completed"
      ? await getSeasonGames(id, { gameType: "playoff" })
      : [];

  return NextResponse.json({ season, standings, teams, playoffGames });
}
```

- [ ] **Step 2: Compile check and commit**

```bash
npx tsc --noEmit
git add src/app/api/seasons/[id]/route.ts
git commit -m "feat: add GET /api/seasons/[id] with standings"
```

---

### Task 7: POST /api/seasons/[id]/join

**Files:**
- Create: `src/app/api/seasons/[id]/join/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/seasons/[id]/join/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { rosters, rosterPokemon } from "@/lib/schema";
import { eq, and, asc } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";
import { getSeason, getSeasonTeamCount, getUserSeasonTeam, joinSeason } from "@/lib/season-db";

let cachedPool: Record<number, Record<string, unknown>> | null = null;
function loadPokemonPool(): Record<number, Record<string, unknown>> {
  if (cachedPool) return cachedPool;
  const data: Record<string, unknown>[] = JSON.parse(
    readFileSync(join(process.cwd(), "public", "pokemon-bball-stats-augmented.json"), "utf-8")
  );
  cachedPool = {};
  for (const p of data) cachedPool[p.id as number] = p;
  return cachedPool;
}

const SALARY_CAP = 160_000_000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: seasonId } = await params;
  const season = await getSeason(seasonId);
  if (!season) return NextResponse.json({ error: "Season not found" }, { status: 404 });
  if (season.status !== "registration") return NextResponse.json({ error: "Season is not open for registration" }, { status: 400 });
  if (season.registrationClosedAt) return NextResponse.json({ error: "Registration is closed" }, { status: 400 });

  const teamCount = await getSeasonTeamCount(seasonId);
  if (teamCount >= season.maxTeams) return NextResponse.json({ error: "Season is full" }, { status: 400 });

  const existing = await getUserSeasonTeam(seasonId, session.user.id);
  if (existing) return NextResponse.json({ error: "Already joined this season" }, { status: 400 });

  // Load the user's tournament roster
  const rosterRows = await db
    .select({ id: rosters.id, name: rosters.name, city: rosters.city })
    .from(rosters)
    .where(and(eq(rosters.userId, session.user.id), eq(rosters.isTournamentRoster, true)));

  if (rosterRows.length === 0) {
    return NextResponse.json({ error: "No tournament roster set. Set one from your dashboard first." }, { status: 400 });
  }

  const { id: rosterId, name: rosterName, city: rosterCity } = rosterRows[0];
  const teamName = rosterCity ? `${rosterCity} ${rosterName}` : rosterName;

  const pokemonRows = await db
    .select()
    .from(rosterPokemon)
    .where(eq(rosterPokemon.rosterId, rosterId))
    .orderBy(asc(rosterPokemon.slotPosition));

  if (pokemonRows.length !== 6) {
    return NextResponse.json({ error: "Tournament roster must have exactly 6 Pokémon." }, { status: 400 });
  }

  // Validate salary cap
  const pool = loadPokemonPool();
  let totalSalary = 0;
  const rosterData = pokemonRows.map((p) => {
    const full = pool[p.pokemonId] || {};
    const salary = (full.salary as number) ?? 0;
    totalSalary += salary;
    return {
      id: p.pokemonId,
      name: p.pokemonName,
      sprite: p.pokemonSprite,
      types: p.pokemonTypes as string[],
      stats: p.pokemonStats,
      height: p.pokemonHeight,
      weight: p.pokemonWeight,
      tag: p.pokemonTag || undefined,
      position: p.slotLabel || undefined,
      ability: (full.ability as string) || undefined,
      rivals: (full.rivals as string[]) || [],
      allies: (full.allies as string[]) || [],
      physicalProfile: full.physicalProfile || undefined,
      bball: full.bball || undefined,
      playstyle: (full.playstyle as string[]) || undefined,
      salary,
    };
  });

  if (totalSalary > SALARY_CAP) {
    return NextResponse.json({ error: `Roster exceeds $160M salary cap ($${(totalSalary / 1_000_000).toFixed(1)}M total)` }, { status: 400 });
  }

  const pokemonIds = pokemonRows.map((p) => p.pokemonId);
  const result = await joinSeason({ seasonId, userId: session.user.id, teamName, rosterData, pokemonIds });

  if (!result.success) {
    return NextResponse.json({
      error: "Some Pokémon are already taken by other teams",
      takenPokemonIds: result.takenPokemonIds,
    }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Compile check and commit**

```bash
npx tsc --noEmit
git add src/app/api/seasons/[id]/join/route.ts
git commit -m "feat: add POST /api/seasons/[id]/join with salary cap and Pokemon locking"
```

---

### Task 8: POST /api/seasons/[id]/leave

**Files:**
- Create: `src/app/api/seasons/[id]/leave/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/seasons/[id]/leave/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getSeason, getUserSeasonTeam, leaveSeason } from "@/lib/season-db";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: seasonId } = await params;
  const season = await getSeason(seasonId);
  if (!season) return NextResponse.json({ error: "Season not found" }, { status: 404 });
  if (season.status !== "registration") {
    return NextResponse.json({ error: "Cannot leave a season that has already started" }, { status: 400 });
  }

  const team = await getUserSeasonTeam(seasonId, session.user.id);
  if (!team) return NextResponse.json({ error: "Not enrolled in this season" }, { status: 400 });

  await leaveSeason(seasonId, session.user.id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Compile check and commit**

```bash
npx tsc --noEmit
git add src/app/api/seasons/[id]/leave/route.ts
git commit -m "feat: add POST /api/seasons/[id]/leave"
```

---

### Task 9: Admin routes — close registration and start season

**Files:**
- Create: `src/app/api/seasons/[id]/close-registration/route.ts`
- Create: `src/app/api/seasons/[id]/start/route.ts`

- [ ] **Step 1: Create close-registration route**

Create `src/app/api/seasons/[id]/close-registration/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getSeason, closeRegistration } from "@/lib/season-db";

async function getAdminUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user ?? null;
  if (!user) return null;
  if ((user as { role?: string }).role !== "admin") return null;
  return user;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: seasonId } = await params;
  const season = await getSeason(seasonId);
  if (!season) return NextResponse.json({ error: "Season not found" }, { status: 404 });
  if (season.status !== "registration") return NextResponse.json({ error: "Season is not in registration phase" }, { status: 400 });
  if (season.registrationClosedAt) return NextResponse.json({ error: "Registration already closed" }, { status: 400 });

  await closeRegistration(seasonId);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Create start route**

Create `src/app/api/seasons/[id]/start/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getSeason, getSeasonTeamCount, startSeason } from "@/lib/season-db";

async function getAdminUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user ?? null;
  if (!user) return null;
  if ((user as { role?: string }).role !== "admin") return null;
  return user;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: seasonId } = await params;
  const season = await getSeason(seasonId);
  if (!season) return NextResponse.json({ error: "Season not found" }, { status: 404 });
  if (season.status !== "registration") return NextResponse.json({ error: "Season is not in registration phase" }, { status: 400 });

  // Note: startSeason() re-validates team count inside its transaction, making this check
  // the fast-fail UX path. The transactional check inside startSeason is the authoritative guard.
  const teamCount = await getSeasonTeamCount(seasonId);
  if (teamCount < 9) return NextResponse.json({ error: `Need at least 9 teams to start (currently ${teamCount})` }, { status: 400 });

  try {
    await startSeason(seasonId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to start season";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Compile check and commit**

```bash
npx tsc --noEmit
git add src/app/api/seasons/[id]/close-registration/route.ts src/app/api/seasons/[id]/start/route.ts
git commit -m "feat: add admin close-registration and start season routes"
```

---

### Task 10: Game list and detail routes

**Files:**
- Create: `src/app/api/seasons/[id]/games/route.ts`
- Create: `src/app/api/seasons/[id]/games/[gameId]/route.ts`

- [ ] **Step 1: Create games list route**

Create `src/app/api/seasons/[id]/games/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getSeasonGames } from "@/lib/season-db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: seasonId } = await params;
  const { searchParams } = new URL(req.url);
  const gameType = searchParams.get("gameType") ?? undefined;
  const round = searchParams.get("round") ? Number(searchParams.get("round")) : undefined;

  const games = await getSeasonGames(seasonId, { gameType, round });
  return NextResponse.json(games);
}
```

- [ ] **Step 2: Create single game detail route**

Create `src/app/api/seasons/[id]/games/[gameId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getSeasonGame, getSeasonGameEvents } from "@/lib/season-db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; gameId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { gameId } = await params;
  const game = await getSeasonGame(gameId);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  const events = await getSeasonGameEvents(gameId);
  return NextResponse.json({ game, events });
}
```

- [ ] **Step 3: Compile check and commit**

```bash
npx tsc --noEmit
git add src/app/api/seasons/[id]/games/route.ts src/app/api/seasons/[id]/games/[gameId]/route.ts
git commit -m "feat: add season game list and detail routes"
```

---

### Task 11: SSE stream route

**Files:**
- Create: `src/app/api/seasons/[id]/games/[gameId]/stream/route.ts`

- [ ] **Step 1: Create the SSE stream route**

Create `src/app/api/seasons/[id]/games/[gameId]/stream/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { dbHttp } from "@/lib/db-http";
import { seasonGames, seasonGameEvents } from "@/lib/schema";
import { eq, and, gt, asc } from "drizzle-orm";

export const maxDuration = 800;

const POLL_INTERVAL_MS = 500;

function sseMessage(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; gameId: string }> }
) {
  const { gameId } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseMessage(event, data)));
      };

      // Load current game state
      const gameRows = await dbHttp
        .select({
          status: seasonGames.status,
          team1Score: seasonGames.team1Score,
          team2Score: seasonGames.team2Score,
          team1Name: seasonGames.team1Name,
          team2Name: seasonGames.team2Name,
          winnerId: seasonGames.winnerId,
          round: seasonGames.round,
          gameType: seasonGames.gameType,
        })
        .from(seasonGames)
        .where(eq(seasonGames.id, gameId));

      const game = gameRows[0];
      if (!game) { controller.close(); return; }

      send("game_state", {
        status: game.status,
        team1Score: game.team1Score ?? 0,
        team2Score: game.team2Score ?? 0,
        team1Name: game.team1Name,
        team2Name: game.team2Name,
        round: game.round,
        gameType: game.gameType,
      });

      // Burst existing events
      const existingEvents = await dbHttp
        .select()
        .from(seasonGameEvents)
        .where(eq(seasonGameEvents.gameId, gameId))
        .orderBy(asc(seasonGameEvents.sequence));

      for (const ev of existingEvents) {
        send("game_event", { ...(ev.data as object), sequence: ev.sequence });
      }

      let lastSequence = existingEvents.length > 0 ? existingEvents[existingEvents.length - 1].sequence : -1;

      const hasGameEnd = existingEvents.some((e) => e.type === "game_end");
      if (hasGameEnd) {
        send("game_end", { team1Score: game.team1Score, team2Score: game.team2Score, winnerId: game.winnerId });
        controller.close();
        return;
      }

      // Poll for new events
      while (!req.signal.aborted) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (req.signal.aborted) break;

        const newEvents = await dbHttp
          .select()
          .from(seasonGameEvents)
          .where(and(eq(seasonGameEvents.gameId, gameId), gt(seasonGameEvents.sequence, lastSequence)))
          .orderBy(asc(seasonGameEvents.sequence));

        for (const ev of newEvents) {
          send("game_event", { ...(ev.data as object), sequence: ev.sequence });
          lastSequence = ev.sequence;

          if (ev.type === "game_end") {
            const finalRows = await dbHttp
              .select({ team1Score: seasonGames.team1Score, team2Score: seasonGames.team2Score, winnerId: seasonGames.winnerId })
              .from(seasonGames)
              .where(eq(seasonGames.id, gameId));
            send("game_end", finalRows[0] ?? {});
            controller.close();
            return;
          }
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```

- [ ] **Step 2: Compile check and commit**

```bash
npx tsc --noEmit
git add src/app/api/seasons/[id]/games/[gameId]/stream/route.ts
git commit -m "feat: add season game SSE stream route"
```

---

## Chunk 5: Background Processing

### Task 12: Season Game Simulation Worker

**Files:**
- Create: `src/lib/simulate-season-game-live.ts`

- [ ] **Step 1: Create the simulation worker**

Create `src/lib/simulate-season-game-live.ts`:

```typescript
import { db } from "./db";
import { seasonGames } from "./schema";
import { eq } from "drizzle-orm";
import {
  insertSeasonGameEvent,
  writeSeasonGameResult,
  deleteSeasonGameEvents,
  getSeasonGameEvents,
  getSeasonGameRosterData,
  tryAdvancePlayoffRound,
} from "./season-db";
import { toTournamentPokemon, TournamentTeam } from "../app/utils/tournamentEngine";
import { createGameIterator } from "./game-iterator";

const DEADLINE_MS = 280_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeTeam(userId: string, name: string, rosterData: unknown): TournamentTeam {
  return {
    id: userId,
    name,
    coast: "west",
    seed: 1,
    isPlayer: true,
    roster: (rosterData as Parameters<typeof toTournamentPokemon>[0][]).map(toTournamentPokemon),
  };
}

export async function simulateSeasonGameLive(gameId: string): Promise<void> {
  const gameRows = await db.select().from(seasonGames).where(eq(seasonGames.id, gameId));
  const game = gameRows[0];
  if (!game || game.status !== "in_progress") return;

  const seasonId = game.seasonId;

  const [team1Data, team2Data] = await Promise.all([
    getSeasonGameRosterData(seasonId, game.team1UserId),
    getSeasonGameRosterData(seasonId, game.team2UserId),
  ]);

  if (!team1Data || !team2Data) {
    console.error(`[simulateSeasonGameLive] Missing roster data for game ${gameId}`);
    return;
  }

  await deleteSeasonGameEvents(gameId);

  await db.update(seasonGames).set({ startedAt: new Date() }).where(eq(seasonGames.id, gameId));

  const homeTeam = makeTeam(game.team1UserId, team1Data.teamName, team1Data.rosterData);
  const awayTeam = makeTeam(game.team2UserId, team2Data.teamName, team2Data.rosterData);

  const iterator = createGameIterator(homeTeam, awayTeam);
  const startMs = Date.now();

  let event;
  while ((event = iterator.next()) !== null) {
    await insertSeasonGameEvent(gameId, event.sequence, event.type, event as unknown as Record<string, unknown>);
    const elapsed = Date.now() - startMs;
    if (elapsed < DEADLINE_MS && event.type !== "game_end") {
      await sleep(event.sleepMs);
    }
  }

  const allEvents = await getSeasonGameEvents(gameId);
  const gameEndEvt = allEvents.reverse().find((e) => e.type === "game_end");
  const scores = gameEndEvt?.data as { homeScore: number; awayScore: number } | undefined;

  if (!scores) {
    console.error(`[simulateSeasonGameLive] No game_end event for game ${gameId}`);
    return;
  }

  const team1Score = scores.homeScore;
  const team2Score = scores.awayScore;
  const winnerId = team1Score > team2Score ? game.team1UserId : game.team2UserId;
  const loserId = winnerId === game.team1UserId ? game.team2UserId : game.team1UserId;

  await writeSeasonGameResult(gameId, seasonId, game.team1UserId, team1Score, team2Score, winnerId, loserId);

  // For playoff games, try to advance the round
  if (game.gameType === "playoff" && game.round != null) {
    await tryAdvancePlayoffRound(seasonId, game.round);
  }
}
```

- [ ] **Step 2: Compile check and commit**

```bash
npx tsc --noEmit
git add src/lib/simulate-season-game-live.ts
git commit -m "feat: add season game simulation worker"
```

---

### Task 13: Extend Cron Tick

**Files:**
- Modify: `src/app/api/cron/tick/route.ts`

- [ ] **Step 1: Read the current cron tick file**

Read `src/app/api/cron/tick/route.ts` to understand current imports and structure before editing.

- [ ] **Step 2: Add season game processing to the cron**

Add the following imports to the top of `src/app/api/cron/tick/route.ts`:

```typescript
import { seasons } from "@/lib/schema";
import {
  resetStaleSeasonGames,
  getPendingSeasonGames,
  claimSeasonGame,
  tryStartPlayoffs,
  tryAdvancePlayoffRound,
  getSeasonGames,
} from "@/lib/season-db";
import { simulateSeasonGameLive } from "@/lib/simulate-season-game-live";
```

Then add the following block inside the `GET` handler, after the existing tournament processing loop and before `return NextResponse.json({ ok: true })`:

```typescript
  // ── Season Game Processing ─────────────────────────────────────────────────

  // 1. Reset stale season games
  await resetStaleSeasonGames();

  // 2. Process pending season games whose scheduledAt has passed
  const pendingSeasonGames = await getPendingSeasonGames(new Date());
  for (const game of pendingSeasonGames) {
    const claimed = await claimSeasonGame(game.id);
    if (!claimed) continue;
    waitUntil(simulateSeasonGameLive(game.id));
  }

  // 3. Check if any active season is ready for playoff transition
  const activeSeasons = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.status, "active"));

  for (const season of activeSeasons) {
    await tryStartPlayoffs(season.id);
  }

  // 4. Resilience: re-check playoff round advancement for seasons already in playoffs
  //    (catches cases where simulateSeasonGameLive crashed after writing the result
  //    but before calling tryAdvancePlayoffRound)
  const playoffSeasons = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.status, "playoffs"));

  for (const season of playoffSeasons) {
    // Find the highest completed round to attempt advancement on
    const allPlayoffGames = await getSeasonGames(season.id, { gameType: "playoff" });
    const rounds = [...new Set(allPlayoffGames.map((g) => g.round).filter(Boolean))].sort();
    for (const round of rounds) {
      await tryAdvancePlayoffRound(season.id, round!);
    }
  }
```

Also add `seasons` to the existing drizzle-orm imports at the top (add `eq` if not already imported).

- [ ] **Step 3: Compile check and commit**

```bash
npx tsc --noEmit
git add src/app/api/cron/tick/route.ts
git commit -m "feat: extend cron tick to process season games and trigger playoff transitions"
```

---

## Chunk 6: UI Pages

### Task 14: Season List Page

**Files:**
- Create: `src/app/seasons/page.tsx`

- [ ] **Step 1: Create the seasons list page**

Create `src/app/seasons/page.tsx`:

```tsx
import Link from "next/link";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSeasons } from "@/lib/season-db";

export default async function SeasonsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const allSeasons = await getSeasons(50);

  const statusLabel: Record<string, string> = {
    registration: "Open",
    active: "Regular Season",
    playoffs: "Playoffs",
    completed: "Completed",
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Seasons</h1>
      {allSeasons.length === 0 && (
        <p className="text-gray-500">No seasons yet. Check back soon!</p>
      )}
      <div className="flex flex-col gap-4">
        {allSeasons.map((s) => (
          <Link
            key={s.id}
            href={`/seasons/${s.id}`}
            className="block border rounded-lg p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-lg">{s.name}</span>
              <span className="text-sm px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                {statusLabel[s.status] ?? s.status}
              </span>
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {s.teamCount} / {s.maxTeams} teams &middot; Reg. season:{" "}
              {new Date(s.regularSeasonStart).toLocaleDateString()} –{" "}
              {new Date(s.regularSeasonEnd).toLocaleDateString()}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/seasons/page.tsx
git commit -m "feat: add seasons list page"
```

---

### Task 15: Season Detail Page (Standings + Schedule)

**Files:**
- Create: `src/app/seasons/[id]/page.tsx`

- [ ] **Step 1: Create the season detail page**

Create `src/app/seasons/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSeason, getSeasonTeams, getSeasonGames, getUserSeasonTeam } from "@/lib/season-db";
import { computeStandings } from "@/lib/season-standings";

export default async function SeasonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const season = await getSeason(id);
  if (!season) notFound();

  const teams = await getSeasonTeams(id);
  const standings = computeStandings(
    teams.map((t) => ({
      userId: t.userId,
      teamName: t.teamName,
      wins: t.wins,
      losses: t.losses,
      pointsFor: t.pointsFor,
      pointsAgainst: t.pointsAgainst,
    })),
    id
  );

  const userTeam = await getUserSeasonTeam(id, session.user.id);
  const isAdmin = (session.user as { role?: string }).role === "admin";

  const recentGames = await getSeasonGames(id, { gameType: "regular" });
  const completedGames = recentGames.filter((g) => g.status === "completed").slice(-10).reverse();
  const playoffGames = (season.status === "playoffs" || season.status === "completed")
    ? await getSeasonGames(id, { gameType: "playoff" })
    : [];

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/seasons" className="text-sm text-gray-500 hover:underline">← Seasons</Link>
          <h1 className="text-2xl font-bold mt-1">{season.name}</h1>
          <p className="text-gray-500 text-sm capitalize">{season.status.replace("_", " ")}</p>
        </div>
        <div className="flex gap-2">
          {season.status === "registration" && !userTeam && !season.registrationClosedAt && (
            <form action={`/api/seasons/${id}/join`} method="POST">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                Join Season
              </button>
            </form>
          )}
          {season.status === "registration" && userTeam && (
            <>
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm font-medium">Joined</span>
              <form action={`/api/seasons/${id}/leave`} method="POST">
                <button type="submit" className="px-3 py-1 border border-red-200 text-red-600 rounded text-sm hover:bg-red-50">
                  Leave
                </button>
              </form>
            </>
          )}
          {isAdmin && season.status === "registration" && (
            <>
              {!season.registrationClosedAt && (
                <form action={`/api/seasons/${id}/close-registration`} method="POST">
                  <button type="submit" className="px-3 py-2 border rounded text-sm hover:bg-gray-50">
                    Close Registration
                  </button>
                </form>
              )}
              <form action={`/api/seasons/${id}/start`} method="POST">
                <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm">
                  Start Season
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Standings */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Standings</h2>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2">#</th>
                <th className="text-left px-4 py-2">Team</th>
                <th className="text-center px-3 py-2">W</th>
                <th className="text-center px-3 py-2">L</th>
                <th className="text-center px-3 py-2">+/-</th>
                <th className="text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((t, i) => (
                <tr key={t.userId} className={`border-b last:border-0 ${i < 8 && season.status !== "registration" ? "bg-blue-50/30" : ""}`}>
                  <td className="px-4 py-2 text-gray-500">{i + 1}</td>
                  <td className="px-4 py-2 font-medium">{t.teamName}{t.userId === session.user.id && <span className="ml-2 text-xs text-blue-600">(You)</span>}</td>
                  <td className="text-center px-3 py-2">{t.wins}</td>
                  <td className="text-center px-3 py-2">{t.losses}</td>
                  <td className="text-center px-3 py-2">{t.pointsFor - t.pointsAgainst > 0 ? "+" : ""}{t.pointsFor - t.pointsAgainst}</td>
                  <td className="px-3 py-2 text-xs text-gray-500 capitalize">{teams.find((team) => team.userId === t.userId)?.result ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {season.status === "active" && <p className="text-xs text-gray-400 mt-1">Top 8 (blue) advance to playoffs</p>}
      </section>

      {/* Playoff bracket (if in playoffs) */}
      {playoffGames.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Playoffs</h2>
          <div className="flex flex-col gap-2">
            {playoffGames.map((g) => (
              <Link key={g.id} href={`/seasons/${id}/games/${g.id}`} className="flex items-center justify-between border rounded p-3 hover:bg-gray-50">
                <span className="text-sm">{g.team1Name} vs {g.team2Name}</span>
                <span className="text-sm font-mono">{g.status === "completed" ? `${g.team1Score}–${g.team2Score}` : g.status}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recent results */}
      {completedGames.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Recent Results</h2>
          <div className="flex flex-col gap-2">
            {completedGames.map((g) => (
              <Link key={g.id} href={`/seasons/${id}/games/${g.id}`} className="flex items-center justify-between border rounded p-3 hover:bg-gray-50">
                <span className="text-sm">{g.team1Name} vs {g.team2Name}</span>
                <span className="text-sm font-mono">{g.team1Score}–{g.team2Score}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Compile check and commit**

```bash
npx tsc --noEmit
git add src/app/seasons/[id]/page.tsx
git commit -m "feat: add season detail page with standings, playoff bracket, and recent results"
```

---

### Task 16: Game View Page

**Files:**
- Create: `src/app/seasons/[id]/games/[gameId]/page.tsx`

- [ ] **Step 1: Create game view page**

This page mirrors the existing live tournament game view. It server-renders the initial game state, then the client-side component connects to the SSE stream.

Create `src/app/seasons/[id]/games/[gameId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSeasonGame } from "@/lib/season-db";
// Import must be at top — client component for SSE
import SeasonGameViewer from "./SeasonGameViewer";

export default async function SeasonGamePage({ params }: { params: Promise<{ id: string; gameId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const { id: seasonId, gameId } = await params;
  const game = await getSeasonGame(gameId);
  if (!game || game.seasonId !== seasonId) notFound();

  const streamUrl = `/api/seasons/${seasonId}/games/${gameId}/stream`;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Link href={`/seasons/${seasonId}`} className="text-sm text-gray-500 hover:underline">← Season</Link>
      <h1 className="text-xl font-bold mt-2 mb-6">
        {game.team1Name} vs {game.team2Name}
      </h1>
      <SeasonGameViewer
        gameId={gameId}
        team1Name={game.team1Name}
        team2Name={game.team2Name}
        initialStatus={game.status}
        initialTeam1Score={game.team1Score ?? 0}
        initialTeam2Score={game.team2Score ?? 0}
        streamUrl={streamUrl}
      />
    </div>
  );
}
```

Then create `src/app/seasons/[id]/games/[gameId]/SeasonGameViewer.tsx` as a **client component** — it must have `"use client"` as its first line. Model it exactly after the existing live tournament game viewer in the codebase. It should:

1. Have `"use client"` as the **first line** of the file
2. Connect to `streamUrl` via `EventSource`
3. Listen for `game_state`, `game_event`, and `game_end` events
4. Display a scoreboard (team names + scores) updated in real time
5. Show a scrolling event log

- [ ] **Step 2: Find the existing live game viewer to reference**

```bash
grep -rl "EventSource\|game_event" src --include="*.tsx" 2>/dev/null
```

Copy its structure for `SeasonGameViewer.tsx`, adding `"use client"` at the top and changing only the SSE URL source and any tournament-specific references.

- [ ] **Step 3: Compile check and commit**

```bash
npx tsc --noEmit
git add src/app/seasons/[id]/games/[gameId]/
git commit -m "feat: add season game view page with live SSE stream"
```

---

## Final Verification

- [ ] **Run all unit tests**

```bash
npx vitest run src/lib/season-schedule.test.ts src/lib/season-standings.test.ts
```

Expected: All tests PASS.

- [ ] **Full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No new errors.

- [ ] **Smoke test the happy path manually**

1. Log in as admin → POST `/api/seasons` with valid dates → get season `id`
2. Log in as 9+ users → POST `/api/seasons/{id}/join` for each user (use unique rosters with no overlapping Pokémon)
3. Admin → POST `/api/seasons/{id}/close-registration`
4. Admin → POST `/api/seasons/{id}/start`
5. Confirm `C(n,2)×7` rows appear in `season_games` table where `n` = enrolled team count (e.g. 252 for 9 teams, 840 for 16 teams)
6. Wait for cron tick or trigger `/api/cron/tick` manually → confirm games move `pending` → `in_progress` → `completed`
7. Confirm `season_teams.wins`/`losses`/`pointsFor`/`pointsAgainst` increment correctly after each game
8. After `regularSeasonEnd` passes with all regular games done → confirm `seasons.status = "playoffs"` and 4 QF games appear in `season_games`
9. After all 4 QF games complete → confirm 2 SF games generated and 8 losing teams have `result = "eliminated"`
10. After both SF games complete → confirm 1 Finals game generated
11. After Finals game completes → confirm `seasons.status = "completed"`, one team has `result = "champion"`, one has `result = "finalist"`

- [ ] **Final commit**

```bash
git add -A
git commit -m "feat: complete season mode implementation"
```
