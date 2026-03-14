import { NextRequest, NextResponse } from "next/server";
import { getGame, getGameEvents } from "@/lib/tournament-db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; gameId: string }> }
) {
  const { gameId } = await params;
  const game = await getGame(gameId);
  if (!game) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const eventRows = await getGameEvents(gameId);
  const events = eventRows.map((r) => r.data);

  return NextResponse.json({
    status: game.status,
    team1Score: game.team1Score,
    team2Score: game.team2Score,
    winnerId: game.winnerId,
    events,
  });
}
