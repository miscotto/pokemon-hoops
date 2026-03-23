import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getTeamSeasonStats } from "@/lib/season-stats";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: seasonId, userId } = await params;
  const stats = await getTeamSeasonStats(seasonId, userId);
  if (!stats) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  return NextResponse.json(stats);
}
