import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { liveTournamentTeams } from "@/lib/schema";
import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import {
  getTournament,
  getTournamentTeams,
  completeTournament,
} from "@/lib/tournament-db";
import { SerializedMatchup, computeCurrentEventIndex } from "../../../utils/tournamentEngine";

async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

// GET /api/live-tournaments/[id] — Get tournament bracket state
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tournament = await getTournament(id);
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  // Waiting state: return lobby info
  if (tournament.status === "waiting") {
    const teams = await getTournamentTeams(id);
    return NextResponse.json({
      status: "waiting",
      teamCount: teams.length,
      maxTeams: tournament.max_teams,
      teams: teams.map((t) => ({
        teamName: t.team_name,
        joinedAt: t.joined_at,
      })),
    });
  }

  const bracketData = tournament.bracket_data as SerializedMatchup[] | null;
  if (!bracketData) {
    return NextResponse.json({ error: "No bracket data" }, { status: 500 });
  }

  const startedAt = new Date(tournament.started_at!).getTime();
  const elapsed = (Date.now() - startedAt) / 1000;

  // Find user's team name
  const userTeamRows = await db
    .select({ teamName: liveTournamentTeams.teamName })
    .from(liveTournamentTeams)
    .where(
      and(
        eq(liveTournamentTeams.tournamentId, id),
        eq(liveTournamentTeams.userId, user.id)
      )
    );
  const userTeamName = userTeamRows[0]?.teamName ?? null;

  // Build bracket overview (no events — lightweight)
  const matchups = bracketData.map((m) => {
    const eventIdx = computeCurrentEventIndex(elapsed, m.startsAtOffset, m.events.length);

    let status: string;
    let homeScore = 0;
    let awayScore = 0;
    let winner = null;
    let mvp = null;

    if (eventIdx < 0) {
      status = "upcoming";
    } else if (eventIdx >= m.events.length - 1) {
      status = "completed";
      homeScore = m.finalHomeScore;
      awayScore = m.finalAwayScore;
      winner = m.winner;
      const topScorer = m.playerStats.sort((a, b) => b.points - a.points)[0];
      if (topScorer) {
        mvp = { name: topScorer.name, sprite: topScorer.sprite, points: topScorer.points };
      }
    } else {
      status = "in_progress";
      const event = m.events[eventIdx];
      homeScore = event.homeScore;
      awayScore = event.awayScore;
    }

    return {
      id: m.id,
      round: m.round,
      conference: m.conference,
      homeTeam: {
        id: m.homeTeam.id,
        name: m.homeTeam.name,
        coast: m.homeTeam.coast,
        seed: m.homeTeam.seed,
        isPlayer: m.homeTeam.isPlayer,
      },
      awayTeam: {
        id: m.awayTeam.id,
        name: m.awayTeam.name,
        coast: m.awayTeam.coast,
        seed: m.awayTeam.seed,
        isPlayer: m.awayTeam.isPlayer,
      },
      status,
      homeScore,
      awayScore,
      winner,
      mvp,
    };
  });

  // Check if all games completed → mark tournament done
  const allDone = matchups.every((m) => m.status === "completed");
  if (allDone && tournament.status === "active") {
    await completeTournament(id);
  }

  return NextResponse.json({
    status: allDone ? "completed" : "active",
    startedAt: tournament.started_at,
    matchups,
    userTeamName,
  });
}
