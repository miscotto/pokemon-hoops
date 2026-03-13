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
