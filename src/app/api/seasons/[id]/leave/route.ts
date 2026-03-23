import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getSeason, getUserSeasonTeam, leaveSeason } from "@/lib/season-db";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: seasonId } = await params;
  const season = await getSeason(seasonId);
  if (!season) return NextResponse.json({ error: "Season not found" }, { status: 404 });
  if (season.status !== "registration") {
    return NextResponse.json({ error: "Cannot leave a season that has already started" }, { status: 400 });
  }
  if (season.registrationClosedAt) {
    return NextResponse.json({ error: "Cannot leave after registration has been closed" }, { status: 400 });
  }

  const team = await getUserSeasonTeam(seasonId, session.user.id);
  if (!team) return NextResponse.json({ error: "Not enrolled in this season" }, { status: 400 });

  await leaveSeason(seasonId, session.user.id);
  return NextResponse.json({ ok: true });
}
