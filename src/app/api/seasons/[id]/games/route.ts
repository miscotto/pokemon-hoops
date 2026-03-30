import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getSeasonGamesFiltered } from "@/lib/season-db";

const STATUS_MAP: Record<string, string> = {
  live: "in_progress",
  upcoming: "pending",
  completed: "completed",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: seasonId } = await params;
  const { searchParams } = new URL(req.url);

  const statusParam = searchParams.get("status") ?? undefined;
  const status = statusParam ? (STATUS_MAP[statusParam] ?? undefined) : undefined;
  const userId = searchParams.get("userId") ?? undefined;
  const gameType = searchParams.get("gameType") ?? undefined;
  const limitRaw = Number(searchParams.get("limit") ?? "50");
  const offsetRaw = Number(searchParams.get("offset") ?? "0");
  const limit = Number.isFinite(limitRaw) ? limitRaw : 50;
  const offset = Number.isFinite(offsetRaw) ? offsetRaw : 0;

  const games = await getSeasonGamesFiltered(seasonId, { status, userId, gameType, limit, offset });
  return NextResponse.json(games);
}
