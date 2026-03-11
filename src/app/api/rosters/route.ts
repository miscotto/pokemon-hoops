import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { rosters } from "@/lib/schema";
import { headers } from "next/headers";
import { eq, desc, sql } from "drizzle-orm";

async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

// GET /api/rosters — list all rosters for current user
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      id: rosters.id,
      name: rosters.name,
      is_tournament_roster: rosters.isTournamentRoster,
      created_at: rosters.createdAt,
      updated_at: rosters.updatedAt,
      pokemon_count: sql<number>`(SELECT COUNT(*) FROM roster_pokemon WHERE roster_id = ${rosters.id})::int`,
    })
    .from(rosters)
    .where(eq(rosters.userId, user.id))
    .orderBy(desc(rosters.createdAt));

  return NextResponse.json(rows);
}

// POST /api/rosters — create a new roster
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const result = await db
    .insert(rosters)
    .values({ userId: user.id, name: name.trim() })
    .returning({
      id: rosters.id,
      name: rosters.name,
      is_tournament_roster: rosters.isTournamentRoster,
      created_at: rosters.createdAt,
      updated_at: rosters.updatedAt,
    });

  return NextResponse.json(result[0], { status: 201 });
}
