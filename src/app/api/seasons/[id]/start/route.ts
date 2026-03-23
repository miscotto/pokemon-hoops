import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getSeason, getSeasonTeamCount, startSeason } from "@/lib/season-db";

async function getAdminUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user ?? null;
  if (!user) return null;
  if ((user as { role?: string }).role !== "admin") return null;
  return user;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: seasonId } = await params;
  const season = await getSeason(seasonId);
  if (!season) return NextResponse.json({ error: "Season not found" }, { status: 404 });
  if (season.status !== "registration") return NextResponse.json({ error: "Season is not in registration phase" }, { status: 400 });

  const teamCount = await getSeasonTeamCount(seasonId);
  if (teamCount < 9) return NextResponse.json({ error: `Need at least 9 teams to start (currently ${teamCount})` }, { status: 400 });

  try {
    await startSeason(seasonId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to start season";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
