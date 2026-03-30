import { eq, and, lt, sql, asc, desc, ne, inArray, not, isNull, isNotNull } from "drizzle-orm";
import { db } from "./db";
import {
  seasons,
  seasonTeams,
  seasonLockedPokemon,
  seasonGames,
  seasonGameEvents,
  seasonPlayoffSeries,
} from "./schema";
import { generateSeasonSchedule } from "./season-schedule";
import { computeStandings, seedPlayoffBracket } from "./season-standings";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Returned by writeSeasonGameResult for playoff games.
 * Carries all info the caller needs to schedule the next game or advance the round.
 */
export interface SeriesResult {
  seriesId: string;
  round: number;
  matchupIndex: number;
  team1UserId: string;
  team1Name: string;
  team2UserId: string;
  team2Name: string;
  team1Wins: number;
  team2Wins: number;
  winnerId: string | null;
  /** The next game number to schedule, or null if the series is over. */
  nextGameNumber: number | null;
}

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
): Promise<SeriesResult | null> {
  let seriesResult: SeriesResult | null = null;

  await db.transaction(async (tx) => {
    // Write final score
    await tx
      .update(seasonGames)
      .set({ team1Score, team2Score, winnerId, status: "completed", completedAt: new Date() })
      .where(eq(seasonGames.id, gameId));

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

    // ── Series tracking (playoff games only) ──────────────────────────────────
    const gameRows = await tx
      .select({
        seriesId: seasonGames.seriesId,
        gameNumberInSeries: seasonGames.gameNumberInSeries,
        round: seasonGames.round,
      })
      .from(seasonGames)
      .where(eq(seasonGames.id, gameId));

    const game = gameRows[0];
    if (!game?.seriesId) return; // regular season game — no series tracking

    const seriesRows = await tx
      .select()
      .from(seasonPlayoffSeries)
      .where(eq(seasonPlayoffSeries.id, game.seriesId));

    const series = seriesRows[0];
    if (!series) return;

    // Atomic win increment — avoids read-modify-write race condition
    const isTeam1Winner = winnerId === series.team1UserId;
    const updatedSeriesRows = await tx
      .update(seasonPlayoffSeries)
      .set({
        team1Wins: isTeam1Winner
          ? sql`${seasonPlayoffSeries.team1Wins} + 1`
          : seasonPlayoffSeries.team1Wins,
        team2Wins: isTeam1Winner
          ? seasonPlayoffSeries.team2Wins
          : sql`${seasonPlayoffSeries.team2Wins} + 1`,
      })
      .where(eq(seasonPlayoffSeries.id, game.seriesId))
      .returning({
        team1Wins: seasonPlayoffSeries.team1Wins,
        team2Wins: seasonPlayoffSeries.team2Wins,
      });

    const updated = updatedSeriesRows[0];
    if (!updated) return;

    const newTeam1Wins = updated.team1Wins;
    const newTeam2Wins = updated.team2Wins;
    const seriesWinnerId =
      newTeam1Wins === 4 ? series.team1UserId :
      newTeam2Wins === 4 ? series.team2UserId :
      null;

    if (seriesWinnerId) {
      await tx
        .update(seasonPlayoffSeries)
        .set({ winnerId: seriesWinnerId, status: "completed" })
        .where(eq(seasonPlayoffSeries.id, game.seriesId));
    }

    // Populate result for caller (closure capture — committed when tx resolves)
    seriesResult = {
      seriesId: game.seriesId,
      round: game.round ?? 1,
      matchupIndex: series.matchupIndex,
      team1UserId: series.team1UserId,
      team1Name: series.team1Name,
      team2UserId: series.team2UserId,
      team2Name: series.team2Name,
      team1Wins: newTeam1Wins,
      team2Wins: newTeam2Wins,
      winnerId: seriesWinnerId,
      nextGameNumber: seriesWinnerId ? null : Math.min((game.gameNumberInSeries ?? 1) + 1, 7),
    };
  });

  return seriesResult;
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

    // Insert QF series + game 1 of each series
    for (let i = 0; i < bracket.length; i++) {
      const m = bracket[i];

      // Create the series record first
      const seriesRows = await tx
        .insert(seasonPlayoffSeries)
        .values({
          seasonId,
          round: 1,
          matchupIndex: m.matchupIndex,
          team1UserId: m.team1UserId,
          team1Name: m.team1Name,
          team2UserId: m.team2UserId,
          team2Name: m.team2Name,
          status: "active",
        })
        .returning({ id: seasonPlayoffSeries.id });

      const seriesId = seriesRows[0].id;

      // Schedule game 1; stagger by 30s per matchup to avoid cron batch collision
      await tx.insert(seasonGames).values({
        seasonId,
        gameType: "playoff",
        team1UserId: m.team1UserId,
        team1Name: m.team1Name,
        team2UserId: m.team2UserId,
        team2Name: m.team2Name,
        scheduledAt: new Date(Date.now() + i * 30_000),
        round: 1,
        matchupIndex: m.matchupIndex,
        seriesId,
        gameNumberInSeries: 1,
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

    // Fetch all series for the completed round — authoritative source for round completion
    const seriesInRound = await tx
      .select()
      .from(seasonPlayoffSeries)
      .where(
        and(
          eq(seasonPlayoffSeries.seasonId, seasonId),
          eq(seasonPlayoffSeries.round, completedRound)
        )
      )
      .orderBy(asc(seasonPlayoffSeries.matchupIndex));

    if (seriesInRound.length === 0) return; // no series yet for this round
    if (seriesInRound.some((s) => s.status !== "completed")) return;

    if (completedRound === 3) {
      // Read winner from the Finals series row (not from a seasonGames row)
      const finalsSeries = seriesInRound[0];
      if (!finalsSeries?.winnerId) return;
      const loserId =
        finalsSeries.winnerId === finalsSeries.team1UserId
          ? finalsSeries.team2UserId
          : finalsSeries.team1UserId;
      await tx.update(seasonTeams)
        .set({ result: "champion" })
        .where(and(eq(seasonTeams.seasonId, seasonId), eq(seasonTeams.userId, finalsSeries.winnerId)));
      await tx.update(seasonTeams)
        .set({ result: "finalist" })
        .where(and(eq(seasonTeams.seasonId, seasonId), eq(seasonTeams.userId, loserId)));
      await tx.update(seasons)
        .set({ status: "completed" })
        .where(eq(seasons.id, seasonId));
      return;
    }

    // Pair series winners for next round
    const nextRound = completedRound + 1;
    const nextMatchups: Array<{
      team1UserId: string; team1Name: string;
      team2UserId: string; team2Name: string;
      matchupIndex: number;
    }> = [];

    for (let i = 0; i < seriesInRound.length; i += 2) {
      const s1 = seriesInRound[i];
      const s2 = seriesInRound[i + 1];
      if (!s1 || !s2 || !s1.winnerId || !s2.winnerId) {
        throw new Error(`[tryAdvancePlayoffRound] Unexpected missing winner in round ${completedRound} series pairing (season ${seasonId})`);
      }
      const w1Name = s1.winnerId === s1.team1UserId ? s1.team1Name : s1.team2Name;
      const w2Name = s2.winnerId === s2.team1UserId ? s2.team1Name : s2.team2Name;
      nextMatchups.push({
        team1UserId: s1.winnerId,
        team1Name: w1Name,
        team2UserId: s2.winnerId,
        team2Name: w2Name,
        matchupIndex: i / 2,
      });
    }

    // Create next-round series + game 1 for each
    for (let i = 0; i < nextMatchups.length; i++) {
      const m = nextMatchups[i];
      const newSeriesRows = await tx
        .insert(seasonPlayoffSeries)
        .values({
          seasonId,
          round: nextRound,
          matchupIndex: m.matchupIndex,
          team1UserId: m.team1UserId,
          team1Name: m.team1Name,
          team2UserId: m.team2UserId,
          team2Name: m.team2Name,
          status: "active",
        })
        .returning({ id: seasonPlayoffSeries.id });

      await tx.insert(seasonGames).values({
        seasonId,
        gameType: "playoff",
        team1UserId: m.team1UserId,
        team1Name: m.team1Name,
        team2UserId: m.team2UserId,
        team2Name: m.team2Name,
        scheduledAt: new Date(Date.now() + i * 30_000),
        round: nextRound,
        matchupIndex: m.matchupIndex,
        seriesId: newSeriesRows[0].id,
        gameNumberInSeries: 1,
        status: "pending",
      });
    }

    // Mark eliminated teams (loser of each completed series in this round)
    for (const s of seriesInRound) {
      if (!s.winnerId) continue;
      const loserId = s.winnerId === s.team1UserId ? s.team2UserId : s.team1UserId;
      await tx.update(seasonTeams)
        .set({ result: "eliminated" })
        .where(and(eq(seasonTeams.seasonId, seasonId), eq(seasonTeams.userId, loserId)));
    }
  });
}

/** Returns all playoff series for a season, ordered by round then matchupIndex. */
export async function getSeasonPlayoffSeries(seasonId: string) {
  return db
    .select()
    .from(seasonPlayoffSeries)
    .where(eq(seasonPlayoffSeries.seasonId, seasonId))
    .orderBy(asc(seasonPlayoffSeries.round), asc(seasonPlayoffSeries.matchupIndex));
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
