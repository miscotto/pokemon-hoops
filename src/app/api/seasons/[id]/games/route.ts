import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getSeasonGames } from "@/lib/season-db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: seasonId } = await params;
  const { searchParams } = new URL(req.url);
  const gameType = searchParams.get("gameType") ?? undefined;
  const round = searchParams.get("round") ? Number(searchParams.get("round")) : undefined;

  const games = await getSeasonGames(seasonId, { gameType, round });
  return NextResponse.json(games);
}
