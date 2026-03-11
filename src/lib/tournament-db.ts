import { eq, and, asc, desc, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { liveTournaments, liveTournamentTeams } from "./schema";

// ─── Queries ────────────────────────────────────────────────────────────────

/** Find a waiting tournament that isn't full yet */
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

/** Create a new tournament and return its ID */
export async function createTournament(): Promise<string> {
  const result = await db
    .insert(liveTournaments)
    .values({ status: "waiting", maxTeams: 8 })
    .returning({ id: liveTournaments.id });
  return result[0].id;
}

/** Add a team to a tournament */
export async function joinTournament(
  tournamentId: string,
  userId: string,
  rosterId: string,
  teamName: string,
  rosterData: unknown
): Promise<void> {
  await db
    .insert(liveTournamentTeams)
    .values({ tournamentId, userId, rosterId, teamName, rosterData })
    .onConflictDoNothing();
}

/** Get count of teams in a tournament */
export async function getTournamentTeamCount(tournamentId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(liveTournamentTeams)
    .where(eq(liveTournamentTeams.tournamentId, tournamentId));
  return result[0].count;
}

/** Get all teams in a tournament */
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

/** Start a tournament: set status to active, store bracket data */
export async function startTournament(
  tournamentId: string,
  bracketData: unknown
): Promise<void> {
  await db
    .update(liveTournaments)
    .set({ status: "active", startedAt: new Date(), bracketData })
    .where(eq(liveTournaments.id, tournamentId));
}

/** Get tournament by ID */
export async function getTournament(tournamentId: string): Promise<{
  id: string;
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
    status: r.status,
    max_teams: r.maxTeams,
    created_at: r.createdAt,
    started_at: r.startedAt ?? null,
    bracket_data: r.bracketData,
  };
}

/** Find user's current active (waiting or active) tournament */
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

/** Check if a roster is locked in an active tournament */
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

/** Mark tournament as completed */
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
