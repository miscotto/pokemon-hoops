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
