# Tournament Live Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tournament games feel genuinely live — playback driven by server time, no pause/skip, variable event pacing, richer event descriptions, and a working leave/rejoin waiting room.

**Architecture:** All game events are pre-simulated at tournament start and stored in the DB with a `displayAtMs` timing field. The client computes which events to reveal based on `Date.now() - gameVirtualStartMs`, where `gameVirtualStartMs` derives from the server's `tournament.startedAt` timestamp. All viewers see identical state at the same moment.

**Tech Stack:** Next.js App Router (TypeScript), Drizzle ORM, PostgreSQL, Vitest

**Spec:** `docs/superpowers/specs/2026-03-13-tournament-live-redesign.md`

---

## Chunk 1: Tournament Engine — `displayAtMs`, cursor, burst mode, richer events

### Task 1: Add `displayAtMs` to `GameEvent` type and write failing tests

**Files:**
- Modify: `src/app/utils/tournamentEngine.ts` (line 47 — `GameEvent` interface)
- Create: `src/app/utils/tournamentEngine.test.ts`

- [ ] **Step 1: Create the test file with failing tests**

```ts
// src/app/utils/tournamentEngine.test.ts
import { describe, it, expect } from "vitest";
import { simulateMatchup, generateAITeam, TournamentPokemon, TournamentTeam } from "./tournamentEngine";

// Minimal stub pokemon for testing
function makeTeam(id: string): TournamentTeam {
  const p: TournamentPokemon = {
    id: 1, name: "Testmon", sprite: "", types: ["fire"],
    stats: { hp: 100, attack: 100, defense: 100, "special-attack": 100, "special-defense": 100, speed: 100 },
    height: 10, weight: 100,
    bball: { ppg: 20, rpg: 5, apg: 5, spg: 2, bpg: 1, per: 18, fg: 0.5, tp: 0.35, ft: 0.8 },
  };
  return { id, name: `Team ${id}`, coast: "west", seed: 1, isPlayer: false, roster: [p, p, p, p, p, p] };
}

describe("simulateMatchup — displayAtMs", () => {
  it("every event has a displayAtMs field", () => {
    const result = simulateMatchup(makeTeam("a"), makeTeam("b"));
    for (const e of result.events) {
      expect(typeof e.displayAtMs).toBe("number");
    }
  });

  it("no event has displayAtMs > 300_000", () => {
    const result = simulateMatchup(makeTeam("a"), makeTeam("b"));
    for (const e of result.events) {
      expect(e.displayAtMs).toBeLessThanOrEqual(300_000);
    }
  });

  it("events are in non-decreasing displayAtMs order", () => {
    const result = simulateMatchup(makeTeam("a"), makeTeam("b"));
    for (let i = 1; i < result.events.length; i++) {
      expect(result.events[i].displayAtMs).toBeGreaterThanOrEqual(result.events[i - 1].displayAtMs);
    }
  });

  it("game_start event has displayAtMs === 0", () => {
    const result = simulateMatchup(makeTeam("a"), makeTeam("b"));
    const start = result.events.find(e => e.type === "game_start");
    expect(start?.displayAtMs).toBe(0);
  });

  it("game_end event has displayAtMs <= 300_000", () => {
    const result = simulateMatchup(makeTeam("a"), makeTeam("b"));
    const end = result.events.find(e => e.type === "game_end");
    expect(end?.displayAtMs).toBeLessThanOrEqual(300_000);
  });

  it("consecutive non-scoring events after a steal have shorter gaps than slow narrative events", () => {
    // Run many simulations and verify that gaps between events immediately after a steal
    // are shorter on average than gaps for momentum/narrative events.
    // Proxy: check that the minimum inter-event gap in any game is < 1500ms (burst range)
    // and the max gap is >= 1500ms (slow range). This confirms both fast and slow pacing exist.
    let minGap = Infinity;
    let maxGap = 0;
    for (let i = 0; i < 5; i++) {
      const result = simulateMatchup(makeTeam("a"), makeTeam("b"));
      for (let j = 1; j < result.events.length; j++) {
        const gap = result.events[j].displayAtMs - result.events[j - 1].displayAtMs;
        if (gap > 0) {
          minGap = Math.min(minGap, gap);
          maxGap = Math.max(maxGap, gap);
        }
      }
    }
    expect(minGap).toBeLessThan(1500);   // burst events exist
    expect(maxGap).toBeGreaterThanOrEqual(1500); // slow events exist
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/rajanrahman/CascadeProjects/windsurf-project-4
npx vitest run src/app/utils/tournamentEngine.test.ts
```

Expected: FAIL — `e.displayAtMs` is `undefined` (field doesn't exist yet).

### Task 2: Add `displayAtMs` to `GameEvent` interface

**Files:**
- Modify: `src/app/utils/tournamentEngine.ts` (line 47 — `GameEvent` interface)

- [ ] **Step 3: Add `displayAtMs` to the interface**

In `src/app/utils/tournamentEngine.ts`, add `displayAtMs: number` to `GameEvent`:

```ts
export interface GameEvent {
  gameTimeSec: number;
  quarter: 1 | 2 | 3 | 4;
  clock: string;
  type: GameEventType;
  team: Side;
  pokemonName: string;
  pokemonSprite?: string;
  description: string;
  pointsScored?: number;
  statType?: "rebound" | "assist" | "steal" | "block" | "foul";
  homeScore: number;
  awayScore: number;
  displayAtMs: number;  // NEW: ms from game start for client-side reveal timing
}
```

- [ ] **Step 4: Add `displayAtMs: 0` to the `game_start` event push**

Find the `game_start` push in `generateGameEvents` (around line 356):

```ts
events.push({
  gameTimeSec: 0, quarter: 1, clock: "12:00",
  type: "game_start", team: "home",
  pokemonName: "Tip-off",
  description: `${homeTeam.name} vs ${awayTeam.name} — Tip-off!`,
  homeScore: 0, awayScore: 0,
  displayAtMs: 0,  // ADD THIS
});
```

- [ ] **Step 5: Run tests — game_start test should pass, others still fail**

```bash
npx vitest run src/app/utils/tournamentEngine.test.ts
```

Expected: 1 pass (game_start), 4 fail (other events still missing `displayAtMs`).

### Task 3: Rewrite `generateGameEvents` with cursor and burst mode

**Files:**
- Modify: `src/app/utils/tournamentEngine.ts` (the `generateGameEvents` function body)

This is the main engine rewrite. The existing `sec` loop that drives `gameTimeSec` is preserved. We add a parallel `cursorMs` counter that drives `displayAtMs`.

- [ ] **Step 6: Add cursor and burst state variables at the top of `generateGameEvents`, right after the `statsMap` initialization**

```ts
// --- Timing cursor for displayAtMs ---
let cursorMs = 0;
let burstRemaining = 0;
let consecutiveScoringEvents = 0; // track runs for momentum-shift burst
```

- [ ] **Step 7: Add a `getStepForEvent` arrow function inside `generateGameEvents` (before the loop)**

Use an arrow function (not a `function` declaration) to avoid `no-inner-declarations` linter warnings:

```ts
const getStepForEvent = (type: GameEventType, isBurst: boolean): number => {
  if (isBurst) return rand(600, 1200);
  if (type === "quarter_start" || type === "quarter_end" || type === "halftime") return 4000;
  if (type === "score_2pt" || type === "score_3pt" || type === "dunk" || type === "layup" || type === "clutch") return rand(600, 1200);
  if (type === "block" || type === "steal" || type === "rebound") return rand(800, 1500);
  // assist, foul, special, momentum, injury, fatigue all fall here (1500–3500ms range)
  return rand(1500, 3500);
};

- [ ] **Step 8: In the loop, before each `events.push(...)` call, compute and advance `cursorMs`**

At the end of each loop iteration, after `eventType` and related variables are set but before the final `events.push(...)`, add:

```ts
// Advance cursor
const isBurst = burstRemaining > 0;
if (isBurst) burstRemaining--;
const stepMs = getStepForEvent(eventType, isBurst);
cursorMs = Math.min(cursorMs + stepMs, 299_000);

// Trigger burst on steal, block, or momentum shift (3+ consecutive scoring)
// Spec: steal = exactly 2; block = rand 2–3
if (eventType === "steal") {
  burstRemaining = 2;
  consecutiveScoringEvents = 0;
} else if (eventType === "block") {
  burstRemaining = Math.floor(rand(2, 4));
  consecutiveScoringEvents = 0;
} else if (["score_2pt", "score_3pt", "dunk", "layup", "clutch"].includes(eventType)) {
  consecutiveScoringEvents++;
  if (consecutiveScoringEvents >= 3) {
    burstRemaining = 2;
    consecutiveScoringEvents = 0;
  }
} else {
  consecutiveScoringEvents = 0;
}
```

Then add `displayAtMs: cursorMs` to the final `events.push({...})` call at the bottom of the loop.

- [ ] **Step 9: Assign `displayAtMs` to quarter_start and halftime inline events**

The quarter_start and halftime events are pushed inline inside the loop (before the main event push). For these, advance `cursorMs` by 4000 and assign it:

```ts
// Quarter start events
if (quarter > 1 && !quarterStartsDone.has(quarter)) {
  quarterStartsDone.add(quarter);
  cursorMs = Math.min(cursorMs + 4000, 299_000);
  events.push({
    gameTimeSec: (quarter - 1) * QUARTER_DURATION, quarter, clock: "12:00",
    type: "quarter_start", team: "home",
    pokemonName: `Q${quarter}`,
    description: `Quarter ${quarter} begins!`,
    homeScore, awayScore,
    displayAtMs: cursorMs,
  });
}

// Halftime
if (quarter >= 3 && !halftimeDone) {
  halftimeDone = true;
  cursorMs = Math.min(cursorMs + 4000, 299_000);
  events.push({
    gameTimeSec: QUARTER_DURATION * 2, quarter: 2, clock: "0:00",
    type: "halftime", team: "home",
    pokemonName: "Halftime",
    description: `Halftime! ${homeTeam.name} ${homeScore} - ${awayScore} ${awayTeam.name}`,
    homeScore, awayScore,
    displayAtMs: cursorMs,
  });
}
```

- [ ] **Step 10: Add `displayAtMs: 299_000` to the tie-break buzzer beater**

Find the post-loop `if (homeScore === awayScore)` block (around line 596) and add `displayAtMs: 299_000`:

```ts
events.push({
  gameTimeSec: GAME_DURATION - 5, quarter: 4, clock: "0:05",
  type: "clutch", team: clutchSide,
  pokemonName: clutchPlayer.name,
  pokemonSprite: clutchPlayer.sprite,
  description: `BUZZER BEATER! ${clutchPlayer.name} wins it at the horn for ${clutchTeam.name}!`,
  pointsScored: pts,
  homeScore, awayScore,
  displayAtMs: 299_000,  // ADD THIS
});
```

- [ ] **Step 11: Add `displayAtMs` to the `game_end` event**

```ts
events.push({
  gameTimeSec: GAME_DURATION, quarter: 4, clock: "0:00",
  type: "game_end", team: winner,
  pokemonName: "Final",
  description: `Game Over! ${winnerTeam.name} wins ${winner === "home" ? homeScore : awayScore}-${winner === "home" ? awayScore : homeScore}!`,
  homeScore, awayScore,
  displayAtMs: 300_000,  // ADD THIS
});
```

- [ ] **Step 12: Also add `displayAtMs: 0` to the game_start event already done in Task 2**

(Already done in Step 4.)

- [ ] **Step 13: Run tests — all should now pass**

```bash
npx vitest run src/app/utils/tournamentEngine.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 14: Commit**

```bash
git add src/app/utils/tournamentEngine.ts src/app/utils/tournamentEngine.test.ts
git commit -m "feat(engine): add displayAtMs to GameEvent with cursor and burst timing"
```

### Task 4: Delete `computeCurrentEventIndex` and `LIVE_EVENT_INTERVAL`

**Files:**
- Modify: `src/app/utils/tournamentEngine.ts` (lines 733–865)

- [ ] **Step 15: Delete the two constants and function**

Remove from `tournamentEngine.ts`:
- Line ~735: `export const LIVE_EVENT_INTERVAL = 2;` (line 733 is `LIVE_GAME_REAL_SECONDS` — do NOT delete that)
- Lines ~857–865: the entire `export function computeCurrentEventIndex(...)` block

Do NOT remove `LIVE_GAME_REAL_SECONDS`, `LIVE_ROUND_BUFFER`, `simulateConferenceRounds`, `simulateBracketForSize`, `SerializedMatchup` — those are used by the legacy single-player bracket path.

- [ ] **Step 16: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: No errors related to `computeCurrentEventIndex` or `LIVE_EVENT_INTERVAL`. (Fix any type errors introduced by the `displayAtMs` addition if TypeScript complains about event objects missing the field in other places.)

- [ ] **Step 17: Commit**

```bash
git add src/app/utils/tournamentEngine.ts
git commit -m "refactor(engine): delete computeCurrentEventIndex and LIVE_EVENT_INTERVAL"
```

### Task 5: Probability rebalancing and richer event descriptions

**Files:**
- Modify: `src/app/utils/tournamentEngine.ts` (the `if/else if` roll ladder in `generateGameEvents`)

Replace the event-type selection ladder. New cumulative thresholds:
- `roll < 0.33` → scoring
- `roll < 0.51` → defense
- `roll < 0.60` → assists
- `roll < 0.67` → fouls
- `roll < 0.77` → special
- `roll < 0.92` → momentum/narrative
- else → injury/fatigue

- [ ] **Step 18: Update the scoring branch (roll < 0.33) with richer 3pt and dunk descriptions**

Replace the scoring sub-branch (`sr < 0.35` etc.) with:

```ts
if (roll < 0.33) {
  const sr = Math.random();
  const oppTeam = side === "home" ? awayTeam : homeTeam;
  const victim = pick(oppTeam.roster);
  if (sr < 0.30) {
    eventType = "score_2pt"; points = 2;
    description = pick([
      `${player.name} hits a mid-range jumper!`,
      `${player.name} converts the tough floater!`,
      `${player.name} rises up for the pull-up mid-range — good!`,
    ]);
  } else if (sr < 0.55) {
    eventType = "score_3pt"; points = 3;
    description = pick([
      `${player.name} buries the corner three — ${activeTeam.name} extends the lead!`,
      `${player.name} step-back three from the logo — ARE YOU KIDDING?!`,
      `${player.name} catches and fires — GOOD!`,
      `${player.name} off the screen, pulls up — BANG! Three-ball!`,
    ]);
  } else if (sr < 0.78) {
    eventType = "dunk"; points = 2;
    const r = Math.random();
    if (r < 0.4) {
      description = `${player.name} bulldozes baseline and throws it DOWN on ${victim.name}!`;
    } else if (r < 0.7) {
      const ally = activeRoster.find(p => p.name !== player.name);
      const lober = ally ?? player;
      description = `${lober.name} lobs it up — ${player.name} finishes with AUTHORITY!`;
    } else {
      description = `${player.name} posterizes ${victim.name}! That's going on the highlight reel!`;
    }
  } else {
    eventType = "layup"; points = 2;
    description = pick([
      `${player.name} with a beautiful layup.`,
      `${player.name} uses the glass — and it falls!`,
      `${player.name} splits the defense and lays it up softly!`,
    ]);
  }
  if (side === "home") { homeScore += points; homeMomentum += points === 3 ? 2 : 1; }
  else { awayScore += points; awayMomentum += points === 3 ? 2 : 1; }
  pStats.points += points;
```

- [ ] **Step 19: Update the defense branch (roll < 0.51) with richer descriptions**

```ts
} else if (roll < 0.51) {
  const oppTeam = side === "home" ? awayTeam : homeTeam;
  const victim = pick(oppTeam.roster);
  const dr = Math.random();
  if (dr < 0.35) {
    eventType = "block"; statType = "block";
    description = pick([
      `${player.name} rises up and STUFFS the layup attempt by ${victim.name}!`,
      `${player.name} sends ${victim.name}'s shot into the stands!`,
      `${player.name}'s ${player.types[0]} typing gives it extra authority — REJECTED!`,
      `DENIED! ${player.name} with the emphatic block!`,
    ]);
    pStats.blocks++;
  } else if (dr < 0.65) {
    eventType = "steal"; statType = "steal";
    description = pick([
      `${player.name} reaches in and strips ${victim.name}!`,
      `${player.name} tips the pass — ${activeTeam.name} ball!`,
      `${player.name} read the play perfectly — clean steal!`,
      `${player.name} pickpockets ${victim.name} on the drive!`,
    ]);
    pStats.steals++;
  } else {
    eventType = "rebound"; statType = "rebound";
    const isOffensive = Math.random() < 0.3;
    description = isOffensive
      ? pick([
          `${player.name} crashes the glass for the offensive board!`,
          `${player.name} tips it back in for the put-back opportunity!`,
        ])
      : pick([
          `${player.name} secures the defensive board and pushes the pace!`,
          `${player.name} grabs the rebound — possession change!`,
          `${player.name} with the big defensive board!`,
        ]);
    pStats.rebounds++;
  }
  if (side === "home") { homeMomentum += 0.5; awayMomentum = Math.max(0, awayMomentum - 0.3); }
  else { awayMomentum += 0.5; homeMomentum = Math.max(0, homeMomentum - 0.3); }
```

- [ ] **Step 20: Update the assist branch (roll < 0.60) with named two-player plays**

```ts
} else if (roll < 0.60) {
  eventType = "assist"; statType = "assist";
  const scorer = activeRoster.find(p => p.name !== player.name);
  const scorerName = scorer?.name ?? player.name;
  description = pick([
    `${player.name} threads the needle to ${scorerName} cutting to the rim!`,
    `${player.name} fires the skip pass — ${scorerName} is wide open in the corner!`,
    `${player.name} with the no-look dime to ${scorerName}!`,
    `Beautiful ball movement — ${player.name} finds ${scorerName} for the bucket!`,
  ]);
  pStats.assists++;
```

- [ ] **Step 21: Update the foul branch (roll < 0.67) with intentional foul logic**

```ts
} else if (roll < 0.67) {
  eventType = "foul"; statType = "foul";
  pStats.fouls++;
  const myScore = side === "home" ? homeScore : awayScore;
  const oppScore = side === "home" ? awayScore : homeScore;
  const isLateGame = gameSec > GAME_DURATION * 0.95;
  const isLosingBig = oppScore - myScore >= 5;
  if (pStats.fouls >= 6) {
    eventType = "foul_out";
    description = `${player.name} has fouled out! ${activeTeam.name} is playing shorthanded.`;
    pStats.injured = true;
  } else if (isLateGame && isLosingBig) {
    description = `Intentional foul by ${player.name} — ${activeTeam.name} trying to stop the clock. (${pStats.fouls}/6)`;
  } else {
    description = `${player.name} commits a personal foul. (${pStats.fouls}/6)`;
  }
  if (side === "home") homeMomentum = Math.max(0, homeMomentum - 1);
  else awayMomentum = Math.max(0, awayMomentum - 1);
```

- [ ] **Step 22: Update the special branch (roll < 0.77) — fix clutch condition and description**

The clutch sub-case fires when `gameSec > GAME_DURATION * 0.9` and `Math.abs(homeScore - awayScore) <= 8`. The current source has `0.85` and `<= 10` — update both to match the spec:

```ts
// Inside the special/clutch sub-case — replace the existing condition:
if (gameSec > GAME_DURATION * 0.9 && Math.abs(homeScore - awayScore) <= 8) {
  eventType = "clutch";
  points = Math.random() < 0.4 ? 3 : 2;
  description = Math.random() < 0.5
    ? `${player.name} in the CLUTCH — hits the tough shot with ${clock} left!`
    : `${player.name} draws the foul — and-1 opportunity! The crowd goes WILD!`;
  if (side === "home") { homeScore += points; homeMomentum += 5; }
  else { awayScore += points; awayMomentum += 5; }
  pStats.points += points;
} else {
  // Falls outside clutch window — treat as rebound instead
  eventType = "rebound"; statType = "rebound";
  description = `${player.name} rebounds.`;
  pStats.rebounds++;
}
```

- [ ] **Step 23: Update the momentum branch (roll < 0.92) with richer narratives**

Replace the `narratives` array with:

```ts
const narratives = [
  `${activeTeam.name} on a run — ${side === "home" ? awayTeam.name : homeTeam.name} calls timeout!`,
  `The energy is electric — ${activeTeam.name} feeding off the crowd!`,
  `Great ball movement from ${activeTeam.name} — defense can't keep up!`,
  `Coach ${activeTeam.name} calls a timeout to regroup.`,
  `${player.name} firing up the sideline!`,
  `${activeTeam.name} defense is suffocating right now!`,
  `${player.name} is locked in — watch out!`,
];
```

- [ ] **Step 24: Run tests — all engine tests should still pass**

```bash
npx vitest run src/app/utils/tournamentEngine.test.ts
```

Expected: All 6 PASS.

- [ ] **Step 25: Verify TypeScript compilation**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 26: Commit**

```bash
git add src/app/utils/tournamentEngine.ts
git commit -m "feat(engine): richer event descriptions, probability rebalancing, burst mode"
```

---

## Chunk 2: Backend — `leaveTournament`, leave endpoint, `startedAt` in GET response

### Task 6: Add `leaveTournament` to `tournament-db.ts`

**Files:**
- Modify: `src/lib/tournament-db.ts`

- [ ] **Step 1: Add the `leaveTournament` function at the end of `tournament-db.ts`**

```ts
/**
 * Remove a user from a tournament waiting room.
 * Only works while the tournament is still "waiting".
 */
export async function leaveTournament(
  tournamentId: string,
  userId: string
): Promise<"left" | "not_in_tournament" | "already_started"> {
  // Check tournament status first
  const tournament = await getTournament(tournamentId);
  if (!tournament) return "not_in_tournament";
  if (tournament.status !== "waiting") return "already_started";

  // Check if user is in this tournament
  const existing = await db
    .select({ id: liveTournamentTeams.id })
    .from(liveTournamentTeams)
    .where(
      and(
        eq(liveTournamentTeams.tournamentId, tournamentId),
        eq(liveTournamentTeams.userId, userId)
      )
    )
    .limit(1);

  if (existing.length === 0) return "not_in_tournament";

  await db
    .delete(liveTournamentTeams)
    .where(
      and(
        eq(liveTournamentTeams.tournamentId, tournamentId),
        eq(liveTournamentTeams.userId, userId)
      )
    );

  return "left";
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tournament-db.ts
git commit -m "feat(db): add leaveTournament helper"
```

### Task 7: Create the leave endpoint

**Files:**
- Create: `src/app/api/live-tournaments/[id]/leave/route.ts`

The `src/app/api/live-tournaments/[id]/` directory already exists. Create a new `leave/` subdirectory with a `route.ts` file.

- [ ] **Step 4: Create `src/app/api/live-tournaments/[id]/leave/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { leaveTournament } from "@/lib/tournament-db";

async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await leaveTournament(id, user.id);

  if (result === "left") {
    return NextResponse.json({ left: true });
  }
  if (result === "already_started") {
    return NextResponse.json({ error: "Tournament already started" }, { status: 400 });
  }
  return NextResponse.json({ error: "Not in tournament" }, { status: 400 });
}
```

- [ ] **Step 5: Verify TypeScript compilation**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/live-tournaments/[id]/leave/route.ts
git commit -m "feat(api): add DELETE /api/live-tournaments/[id]/leave endpoint"
```

### Task 8: Add `startedAt` to the tournament GET response

**Files:**
- Modify: `src/app/api/live-tournaments/[id]/route.ts`

- [ ] **Step 7: Add `startedAt` to the active/completed response object**

In `src/app/api/live-tournaments/[id]/route.ts`, find the final `return NextResponse.json({...})` block (around line 89) and add `startedAt`:

```ts
return NextResponse.json({
  id: tournament.id,
  name: tournament.name,
  status: tournament.status,
  maxTeams: tournament.max_teams,
  totalRounds: bracketData.totalRounds,
  matchups,
  userTeamName,
  startedAt: tournament.started_at?.toISOString() ?? null,  // ADD THIS
});
```

- [ ] **Step 8: Verify TypeScript compilation**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/live-tournaments/[id]/route.ts
git commit -m "feat(api): include startedAt in tournament GET response"
```

---

## Chunk 3: Frontend — Live playback, leave button, box score fix

### Task 9: Fix the box score tip-off bug

**Files:**
- Modify: `src/app/tournaments/[id]/page.tsx` (the `computeBoxScore` function, line 178)

- [ ] **Step 1: Add the structural event type guard to `computeBoxScore`**

Find `computeBoxScore` (around line 178). Add the guard as the FIRST check inside the `for` loop:

```ts
const STRUCTURAL_TYPES = new Set([
  "game_start", "game_end", "quarter_start", "quarter_end", "halftime",
]);

function computeBoxScore(events: GameEvent[], side: "home" | "away"): PlayerStat[] {
  const map = new Map<string, PlayerStat>();
  for (const e of events) {
    if (STRUCTURAL_TYPES.has(e.type)) continue;  // ADD THIS — first check
    if (e.team !== side) continue;
    // ... rest unchanged
  }
  // ...
}
```

Place `STRUCTURAL_TYPES` as a module-level constant above `computeBoxScore` so it isn't re-created on every call.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/tournaments/[id]/page.tsx
git commit -m "fix(ui): exclude structural events from box score computation"
```

### Task 10: Update interfaces — `TournamentState`, `ViewingGame`, and page-local `GameEvent`

**Files:**
- Modify: `src/app/tournaments/[id]/page.tsx` (interfaces at the top of the file)

- [ ] **Step 4: Add `displayAtMs` to the page-local `GameEvent` interface**

`page.tsx` has its own local `GameEvent` interface (around line 38) that is separate from the one in `tournamentEngine.ts`. Add `displayAtMs` to it:

```ts
interface GameEvent {
  type: string;
  description: string;
  homeScore: number;
  awayScore: number;
  quarter: number;
  clock: string;
  team: "home" | "away";
  pokemonName: string;
  pokemonSprite?: string;
  pointsScored?: number;
  statType?: string;
  displayAtMs: number;  // ADD THIS
}
```

Without this, the `e.displayAtMs <= elapsed` filter in `GameDetailView` will produce a TypeScript error.

- [ ] **Step 5: Add `startedAt` to `TournamentState`**

```ts
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
  startedAt?: string | null;  // ADD THIS
}
```

- [ ] **Step 6: Add `startedAt`, `round`, and `tournamentId` to `ViewingGame`**

`tournamentId` is needed by `GameDetailView` to construct the polling URL. Thread it in from the URL param `id`.

```ts
interface ViewingGame {
  gameId: string;
  tournamentId: string;  // ADD THIS — needed for polling URL in GameDetailView
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
  winnerId: string | null;
  events: GameEvent[];
  startedAt: string;     // ADD THIS
  round: number;         // ADD THIS
}
```

- [ ] **Step 7: Update `handleViewGameData` to populate the new fields**

In `handleViewGameData`, update the `setViewingGame` call. `tournament.startedAt` is required for timing — if it's null (tournament not yet active), guard and return early since games aren't watchable in that state anyway.

```ts
const handleViewGameData = async (matchup: MatchupState, tournamentId: string) => {
  try {
    const res = await fetch(`/api/live-tournaments/${tournamentId}/games/${matchup.gameId}`);
    const data = await res.json();
    if (data.error) { setError(data.error); return; }
    const startedAt = tournament?.startedAt;
    if (!startedAt) { setError("Tournament not yet started"); return; }
    setViewingGame({
      gameId: matchup.gameId,
      tournamentId,                                    // ADD
      team1Name: matchup.team1Name,
      team2Name: matchup.team2Name,
      team1Score: data.team1Score ?? matchup.team1Score ?? 0,
      team2Score: data.team2Score ?? matchup.team2Score ?? 0,
      winnerId: data.winnerId ?? matchup.winnerId,
      events: (data.events as GameEvent[]) ?? [],
      startedAt,                                       // ADD
      round: matchup.round,                            // ADD
    });
  } catch {
    setError("Failed to load game");
  }
};
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add src/app/tournaments/[id]/page.tsx
git commit -m "feat(ui): add startedAt, round, tournamentId to ViewingGame interface"
```

### Task 11: Rewrite `GameDetailView` with time-driven playback

**Files:**
- Modify: `src/app/tournaments/[id]/page.tsx` (the `GameDetailView` component, lines 268–366)

- [ ] **Step 10: Replace `GameDetailView` with the new time-driven version**

Replace the entire `GameDetailView` component with:

```tsx
const ROUND_DURATION_MS = 300_000;
const ROUND_BUFFER_MS = 15_000;

function GameDetailView({ game, onBack }: { game: ViewingGame; onBack: () => void }) {
  const [allEvents, setAllEvents] = useState<GameEvent[]>(game.events);
  const [now, setNow] = useState(Date.now());

  const gameVirtualStartMs =
    new Date(game.startedAt).getTime() +
    (game.round - 1) * (ROUND_DURATION_MS + ROUND_BUFFER_MS);

  const elapsed = now - gameVirtualStartMs;
  const isDone = elapsed >= ROUND_DURATION_MS;
  const visibleEvents = allEvents.filter((e) => e.displayAtMs <= elapsed);
  const currentEvent = visibleEvents[visibleEvents.length - 1];
  const liveScore = currentEvent
    ? { home: currentEvent.homeScore, away: currentEvent.awayScore }
    : { home: 0, away: 0 };

  // Poll game endpoint every 750ms while live.
  // Needed because the main simulation path (simulateAllRounds) runs synchronously when the
  // tournament starts, so events are available immediately. But we also poll to ensure
  // allEvents stays fresh if a viewer opens the game before the server finishes writing results.
  useEffect(() => {
    if (isDone) return;
    const interval = setInterval(async () => {
      setNow(Date.now());
      try {
        const res = await fetch(
          `/api/live-tournaments/${game.tournamentId}/games/${game.gameId}`
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.events) && data.events.length > allEvents.length) {
            setAllEvents(data.events as GameEvent[]);
          }
        }
      } catch {
        // silent — clock still ticks
      }
    }, 750);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone, game.tournamentId, game.gameId]);

  const team1Wins = game.team1Score > game.team2Score;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <PokeButton variant="ghost" size="sm" onClick={onBack} className="flex items-center gap-1">
          ← BACK TO BRACKET
        </PokeButton>
        {!isDone && (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            <span className="font-pixel text-[5px]" style={{ color: "var(--color-danger)" }}>
              LIVE
            </span>
          </div>
        )}
      </div>

      {/* Scoreboard */}
      <PokeCard variant="highlighted" className="overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5">
          <div className="flex-1">
            <div className="font-pixel text-[8px]" style={{ color: "var(--color-text)" }}>{game.team1Name}</div>
          </div>
          <div className="text-center px-8">
            <div className="flex items-center gap-4">
              <span
                className="font-pixel text-[24px] tabular-nums"
                style={{ color: liveScore.home >= liveScore.away ? "var(--color-primary)" : "var(--color-text-muted)" }}
              >
                {liveScore.home}
              </span>
              <span className="font-pixel text-[16px]" style={{ color: "var(--color-border)" }}>-</span>
              <span
                className="font-pixel text-[24px] tabular-nums"
                style={{ color: liveScore.away > liveScore.home ? "var(--color-primary)" : "var(--color-text-muted)" }}
              >
                {liveScore.away}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-center gap-1.5">
              {!isDone && <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />}
              <span
                className="font-pixel text-[6px] px-2 py-0.5"
                style={{ backgroundColor: isDone ? "var(--color-danger)" : "var(--color-primary)", color: "#fff" }}
              >
                {isDone ? "FINAL" : currentEvent ? `Q${currentEvent.quarter} ${currentEvent.clock}` : "LIVE"}
              </span>
            </div>
          </div>
          <div className="flex-1 text-right">
            <div className="font-pixel text-[8px]" style={{ color: "var(--color-text)" }}>{game.team2Name}</div>
          </div>
        </div>
        {isDone && (
          <div
            className="px-6 py-2 text-center font-pixel text-[6px]"
            style={{ backgroundColor: "var(--color-surface)", color: "var(--color-primary)" }}
          >
            {team1Wins ? game.team1Name : game.team2Name} WINS!
          </div>
        )}
      </PokeCard>

      {/* Event Feed + Box Score */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <EventFeed events={visibleEvents} />
        </div>
        <div className="lg:col-span-2">
          <BoxScore events={visibleEvents} team1Name={game.team1Name} team2Name={game.team2Name} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 11: Remove unused state/variables from the old `GameDetailView`**

Ensure the old `PLAYBACK_MS`, `eventIndex`, `setEventIndex`, `playing`, `setPlaying`, `skip`, and `isDone` (old version) are all gone.

- [ ] **Step 12: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 13: Commit**

```bash
git add src/app/tournaments/[id]/page.tsx
git commit -m "feat(ui): replace index-based playback with time-driven GameDetailView"
```

### Task 12: Add leave button and waiting-room polling

**Files:**
- Modify: `src/app/tournaments/[id]/page.tsx` (the waiting lobby section and polling logic)

- [ ] **Step 14: Add `leaving` state and `handleLeave` handler to `TournamentPage`**

In `TournamentPage` component, add alongside existing state:

```ts
const [leaving, setLeaving] = useState(false);

const handleLeave = async () => {
  setLeaving(true);
  try {
    const res = await fetch(`/api/live-tournaments/${id}/leave`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to leave"); return; }
    await fetchTournament();
  } catch {
    setError("Failed to leave tournament");
  } finally {
    setLeaving(false);
  }
};
```

- [ ] **Step 15: Add the LEAVE TOURNAMENT button to the waiting lobby section**

In the `{tournament.status === "waiting" && (...)}` block, add the leave button after the join button:

```tsx
{isParticipant && tournament.status === "waiting" && (
  <PokeButton
    variant="danger"
    size="sm"
    onClick={handleLeave}
    disabled={leaving}
    className="mb-6"
  >
    {leaving ? "LEAVING..." : "LEAVE TOURNAMENT"}
  </PokeButton>
)}
```

- [ ] **Step 16: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 17: Commit**

```bash
git add src/app/tournaments/[id]/page.tsx
git commit -m "feat(ui): add leave button and waiting-room polling to tournament page"
```

### Task 13: Final check — run all tests and verify build

- [ ] **Step 18: Run the full test suite**

```bash
npx vitest run
```

Expected: All tests pass (including the 6 new engine tests and the existing `abilityModifier` tests).

- [ ] **Step 19: Verify TypeScript compilation one final time**

```bash
npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 20: Verify Next.js build succeeds**

```bash
npx next build 2>&1 | tail -20
```

Expected: Build completes without errors.

- [ ] **Step 21: Final commit if any loose ends**

```bash
git add -A
git status
# Only commit if there are unstaged changes from the build check
```

---

## Summary of Files Changed

| File | Tasks |
|---|---|
| `src/app/utils/tournamentEngine.ts` | Tasks 1–5 |
| `src/app/utils/tournamentEngine.test.ts` | Task 1 (new) |
| `src/lib/tournament-db.ts` | Task 6 |
| `src/app/api/live-tournaments/[id]/leave/route.ts` | Task 7 (new) |
| `src/app/api/live-tournaments/[id]/route.ts` | Task 8 |
| `src/app/tournaments/[id]/page.tsx` | Tasks 9–12 |
