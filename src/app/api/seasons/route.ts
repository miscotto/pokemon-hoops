import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createSeason, getSeasons } from "@/lib/season-db";

async function getAdminUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user ?? null;
  if (!user) return null;
  if ((user as { role?: string }).role !== "admin") return null;
  return user;
}

// GET /api/seasons — list all seasons
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allSeasons = await getSeasons(50);
  return NextResponse.json(allSeasons);
}

// POST /api/seasons — admin: create a season
export async function POST(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { name, regularSeasonStart, regularSeasonEnd, playoffStart, playoffEnd } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const dates = { regularSeasonStart, regularSeasonEnd, playoffStart, playoffEnd };
  for (const [key, val] of Object.entries(dates)) {
    if (!val || isNaN(Date.parse(val))) {
      return NextResponse.json({ error: `${key} must be a valid ISO date string` }, { status: 400 });
    }
  }

  const rss = new Date(regularSeasonStart);
  const rse = new Date(regularSeasonEnd);
  const ps = new Date(playoffStart);
  const pe = new Date(playoffEnd);

  if (rse <= rss) return NextResponse.json({ error: "regularSeasonEnd must be after regularSeasonStart" }, { status: 400 });
  if (ps <= rse) return NextResponse.json({ error: "playoffStart must be after regularSeasonEnd" }, { status: 400 });
  if (pe <= ps) return NextResponse.json({ error: "playoffEnd must be after playoffStart" }, { status: 400 });

  const id = await createSeason({
    name: name.trim(),
    createdBy: admin.id,
    regularSeasonStart: rss,
    regularSeasonEnd: rse,
    playoffStart: ps,
    playoffEnd: pe,
  });

  return NextResponse.json({ id }, { status: 201 });
}
