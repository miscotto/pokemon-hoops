import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getSeasonGame, getSeasonGameEvents } from "@/lib/season-db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; gameId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { gameId } = await params;
  const game = await getSeasonGame(gameId);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  const events = await getSeasonGameEvents(gameId);
  return NextResponse.json({ game, events });
}
