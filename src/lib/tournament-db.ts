import { eq, and, asc, desc, inArray, sql, ne, gt } from "drizzle-orm";
import { db } from "./db";
import { liveTournaments, liveTournamentTeams, tournamentGames, tournamentGameEvents } from "./schema";

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
  rosterData: unknown,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0]
): Promise<void> {
  const executor = tx ?? db;
  await executor
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
  created_by: string | null;
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
    created_by: r.createdBy ?? null,
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

export async function completeTournament(
  tournamentId: string,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0]
): Promise<void> {
  const executor = tx ?? db;
  await executor
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
    .set({ status: "in_progress", claimedAt: new Date() })
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
): Promise<void> {
  await db
    .update(tournamentGames)
    .set({
      status: "completed",
      team1Score,
      team2Score,
      winnerId,
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
 * - Initializes empty bracketData with totalRounds
 * - Marks participants as in_progress
 * - Creates round-1 game rows via appendNextRound
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
  // Initialize empty bracket structure with totalRounds first,
  // so appendNextRound can read-modify-write bracketData safely.
  await db
    .update(liveTournaments)
    .set({ status: "active", startedAt: new Date(), bracketData: { totalRounds, matchups: [] } })
    .where(eq(liveTournaments.id, tournamentId));

  // Mark all participants as in_progress
  await db
    .update(liveTournamentTeams)
    .set({ result: "in_progress", roundReached: 1 })
    .where(eq(liveTournamentTeams.tournamentId, tournamentId));

  // Create round 1 game rows and append to bracketData
  await appendNextRound(tournamentId, 1, round1Matchups);
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
  }>,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0]
): Promise<string[]> {
  const executor = tx ?? db;

  // Create game rows
  const rows = await executor
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

  const gameIds = rows.map((r) => r.id);

  // Read current bracketData
  const tRows = await executor
    .select({ bracketData: liveTournaments.bracketData })
    .from(liveTournaments)
    .where(eq(liveTournaments.id, tournamentId));

  const bracket = tRows[0]?.bracketData as BracketStructure;

  const newMatchups: BracketMatchup[] = matchups.map((m, i) => ({
    gameId: gameIds[i],
    round,
    matchupIndex: m.matchupIndex,
    team1UserId: m.team1UserId,
    team1Name: m.team1Name,
    team2UserId: m.team2UserId,
    team2Name: m.team2Name,
  }));

  await executor
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

export async function tryAdvanceRound(
  tournamentId: string,
  completedRound: number
): Promise<void> {
  await db.transaction(async (tx) => {
    // Advisory lock — prevents concurrent advancement from two games finishing at the same time.
    // The lock key is a 32-bit int derived from the tournament+round string.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${tournamentId + ":" + completedRound}))`
    );

    // Check if all games in this round are completed
    const result = await tx
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(tournamentGames)
      .where(
        and(
          eq(tournamentGames.tournamentId, tournamentId),
          eq(tournamentGames.round, completedRound),
          ne(tournamentGames.status, "completed")
        )
      );

    if (result[0].count > 0) return; // other games still running

    // Fetch tournament to check total rounds
    const tRows = await tx
      .select({ bracketData: liveTournaments.bracketData, totalRounds: sql<number>`(bracket_data->>'totalRounds')::int` })
      .from(liveTournaments)
      .where(eq(liveTournaments.id, tournamentId));

    const totalRounds = tRows[0]?.totalRounds ?? 1;

    // Fetch all completed games in this round to get winners
    const roundGames = await tx
      .select({
        id: tournamentGames.id,
        team1UserId: tournamentGames.team1UserId,
        team1Name: tournamentGames.team1Name,
        team2UserId: tournamentGames.team2UserId,
        team2Name: tournamentGames.team2Name,
        winnerId: tournamentGames.winnerId,
      })
      .from(tournamentGames)
      .where(
        and(
          eq(tournamentGames.tournamentId, tournamentId),
          eq(tournamentGames.round, completedRound)
        )
      );

    const winners = roundGames.map((g) => ({
      userId: g.winnerId!,
      name: g.winnerId === g.team1UserId ? g.team1Name! : g.team2Name!,
    }));

    if (completedRound >= totalRounds) {
      // Final round complete — mark champion and finalist
      if (roundGames.length === 1) {
        const finalGame = roundGames[0];
        const champId = finalGame.winnerId!;
        const finalistId = champId === finalGame.team1UserId
          ? finalGame.team2UserId!
          : finalGame.team1UserId!;
        await tx
          .update(liveTournamentTeams)
          .set({ result: "champion", roundReached: completedRound })
          .where(and(eq(liveTournamentTeams.tournamentId, tournamentId), eq(liveTournamentTeams.userId, champId)));
        await tx
          .update(liveTournamentTeams)
          .set({ result: "finalist", roundReached: completedRound })
          .where(and(eq(liveTournamentTeams.tournamentId, tournamentId), eq(liveTournamentTeams.userId, finalistId)));
      }
      await completeTournament(tournamentId, tx);
    } else {
      // Advance winners to next round
      const nextRound = completedRound + 1;
      for (const w of winners) {
        await tx
          .update(liveTournamentTeams)
          .set({ result: "in_progress", roundReached: nextRound })
          .where(and(eq(liveTournamentTeams.tournamentId, tournamentId), eq(liveTournamentTeams.userId, w.userId)));
      }

      // Guard: if next round games already exist, another concurrent call already advanced
      const existingNextRound = await tx
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(tournamentGames)
        .where(
          and(
            eq(tournamentGames.tournamentId, tournamentId),
            eq(tournamentGames.round, nextRound)
          )
        );
      if (existingNextRound[0].count > 0) return;

      // Pair winners: 0 vs 1, 2 vs 3, etc.
      const nextMatchups = [];
      for (let i = 0; i < Math.floor(winners.length / 2); i++) {
        nextMatchups.push({
          matchupIndex: i,
          team1UserId: winners[i].userId,
          team1Name: winners[i].name,
          team2UserId: winners[winners.length - 1 - i].userId,
          team2Name: winners[winners.length - 1 - i].name,
        });
      }
      await appendNextRound(tournamentId, nextRound, nextMatchups, tx);
    }
  });
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

/**
 * Remove a user from a tournament waiting room.
 * Only works while the tournament is still "waiting".
 */
export async function leaveTournament(
  tournamentId: string,
  userId: string
): Promise<"left" | "not_in_tournament" | "already_started"> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) return "not_in_tournament";
  if (tournament.status !== "waiting") return "already_started";

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

// ─── New: Game Events ────────────────────────────────────────────────────────

/**
 * Insert a game event.
 * Uses onConflictDoNothing() to handle retries safely
 * (UNIQUE constraint on game_id, sequence prevents duplicates).
 */
export async function insertGameEvent(
  gameId: string,
  sequence: number,
  type: string,
  data: Record<string, unknown>
): Promise<void> {
  await db
    .insert(tournamentGameEvents)
    .values({ gameId, sequence, type, data })
    .onConflictDoNothing();
}

/**
 * Get all game events for a specific game after a given sequence.
 * Default afterSequence is -1, so calling getGameEvents(gameId)
 * returns all events for that game.
 */
export async function getGameEvents(gameId: string, afterSequence = -1) {
  const rows = await db
    .select()
    .from(tournamentGameEvents)
    .where(
      and(
        eq(tournamentGameEvents.gameId, gameId),
        gt(tournamentGameEvents.sequence, afterSequence)
      )
    )
    .orderBy(asc(tournamentGameEvents.sequence));
  return rows;
}

/**
 * Delete all events for a specific game.
 */
export async function deleteGameEvents(gameId: string): Promise<void> {
  await db
    .delete(tournamentGameEvents)
    .where(eq(tournamentGameEvents.gameId, gameId));
}
