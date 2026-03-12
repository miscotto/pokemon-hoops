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
