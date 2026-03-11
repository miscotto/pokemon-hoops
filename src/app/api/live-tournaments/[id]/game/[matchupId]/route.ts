import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getTournament,
} from "@/lib/tournament-db";
import { SerializedMatchup, computeCurrentEventIndex } from "../../../../../utils/tournamentEngine";

async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

// GET /api/live-tournaments/[id]/game/[matchupId] — Get live game events
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; matchupId: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, matchupId } = await params;
  const tournament = await getTournament(id);
  if (!tournament || tournament.status === "waiting") {
    return NextResponse.json({ error: "Tournament not started" }, { status: 400 });
  }

  const bracketData: SerializedMatchup[] =
    typeof tournament.bracket_data === "string"
      ? JSON.parse(tournament.bracket_data)
      : tournament.bracket_data;

  const matchup = bracketData.find(m => m.id === matchupId);
  if (!matchup) {
    return NextResponse.json({ error: "Matchup not found" }, { status: 404 });
  }

  const startedAt = new Date(tournament.started_at!).getTime();
  const elapsed = (Date.now() - startedAt) / 1000;
  const eventIdx = computeCurrentEventIndex(elapsed, matchup.startsAtOffset, matchup.events.length);

  if (eventIdx < 0) {
    return NextResponse.json({
      status: "upcoming",
      homeTeam: matchup.homeTeam,
      awayTeam: matchup.awayTeam,
      events: [],
      currentHomeScore: 0,
      currentAwayScore: 0,
    });
  }

  const isComplete = eventIdx >= matchup.events.length - 1;
  const visibleEvents = matchup.events.slice(0, eventIdx + 1);
  const lastEvent = visibleEvents[visibleEvents.length - 1];

  return NextResponse.json({
    status: isComplete ? "completed" : "in_progress",
    homeTeam: matchup.homeTeam,
    awayTeam: matchup.awayTeam,
    events: visibleEvents,
    currentHomeScore: lastEvent?.homeScore || 0,
    currentAwayScore: lastEvent?.awayScore || 0,
    playerStats: isComplete ? matchup.playerStats : undefined,
    winner: isComplete ? matchup.winner : undefined,
    finalHomeScore: isComplete ? matchup.finalHomeScore : undefined,
    finalAwayScore: isComplete ? matchup.finalAwayScore : undefined,
    mvp: isComplete
      ? (() => {
          const top = matchup.playerStats.sort((a, b) => b.points - a.points)[0];
          return top ? { name: top.name, sprite: top.sprite, points: top.points, team: top.team } : null;
        })()
      : undefined,
  });
}
