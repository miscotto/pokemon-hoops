import { eq, and, lt, sql, asc, desc, ne, inArray, not, isNull, isNotNull } from "drizzle-orm";
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
    // Re-read season status inside transaction to prevent double-start
    const latestSeason = await tx.select({ status: seasons.status }).from(seasons).where(eq(seasons.id, seasonId));
    if (!latestSeason[0] || latestSeason[0].status !== "registration") return;

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
        isNotNull(seasonGames.claimedAt),
        lt(seasonGames.claimedAt, new Date(Date.now() - 800_000))
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
        isNull(seasonGames.claimedAt),
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

    // Derive each team's actual score from winnerId
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
  // Quick pre-check outside transaction (cheap path for most calls)
  const season = await getSeason(seasonId);
  if (!season || season.status !== "active") return false;
  if (new Date() < season.regularSeasonEnd) return false;

  let started = false;

  await db.transaction(async (tx) => {
    // Advisory lock to serialize concurrent playoff-start attempts
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${seasonId || ""}::text))`);

    // Re-read season status inside transaction
    const seasonRows = await tx.select().from(seasons).where(eq(seasons.id, seasonId));
    const latestSeason = seasonRows[0];
    if (!latestSeason || latestSeason.status !== "active") return;
    if (new Date() < latestSeason.regularSeasonEnd) return;

    // Check if any regular season games are still pending/in_progress
    const incomplete = await tx
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(seasonGames)
      .where(
        and(
          eq(seasonGames.seasonId, seasonId),
          eq(seasonGames.gameType, "regular"),
          ne(seasonGames.status, "completed")
        )
      );

    if (incomplete[0].count > 0) return;

    // Compute standings — pass seasonId for deterministic tiebreaker
    const teams = await tx
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

    const standings = computeStandings(teams, seasonId);
    const bracket = seedPlayoffBracket(standings);

    // Distribute QF games across first third of playoff window
    const windowMs = latestSeason.playoffEnd.getTime() - latestSeason.playoffStart.getTime();
    const qfWindowEnd = new Date(latestSeason.playoffStart.getTime() + windowMs / 3);
    const qfInterval = (qfWindowEnd.getTime() - latestSeason.playoffStart.getTime()) / 4;

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
        scheduledAt: new Date(latestSeason.playoffStart.getTime() + i * qfInterval),
        round: 1,
        matchupIndex: m.matchupIndex,
        status: "pending",
      });
    }

    await tx.update(seasons).set({ status: "playoffs" }).where(eq(seasons.id, seasonId));
    started = true;
  });

  return started;
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
