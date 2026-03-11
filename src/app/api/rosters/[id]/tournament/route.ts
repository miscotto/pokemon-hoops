import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { rosters, rosterPokemon } from "@/lib/schema";
import { headers } from "next/headers";
import { eq, and, sql } from "drizzle-orm";

async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

// POST /api/rosters/[id]/tournament — set this roster as the tournament roster
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify ownership and pokemon count
  const rows = await db
    .select({
      id: rosters.id,
      pokemon_count: sql<number>`(SELECT COUNT(*) FROM ${rosterPokemon} WHERE roster_id = ${rosters.id})::int`,
    })
    .from(rosters)
    .where(and(eq(rosters.id, id), eq(rosters.userId, user.id)));

  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (rows[0].pokemon_count < 6) {
    return NextResponse.json(
      { error: "Roster must have 6 Pokémon to be used in tournament" },
      { status: 400 }
    );
  }

  // Unset any existing tournament roster for this user
  await db
    .update(rosters)
    .set({ isTournamentRoster: false })
    .where(and(eq(rosters.userId, user.id), eq(rosters.isTournamentRoster, true)));

  // Set this roster as tournament roster
  await db
    .update(rosters)
    .set({ isTournamentRoster: true, updatedAt: new Date() })
    .where(eq(rosters.id, id));

  return NextResponse.json({ success: true });
}

// DELETE /api/rosters/[id]/tournament — unset tournament roster
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  await db
    .update(rosters)
    .set({ isTournamentRoster: false, updatedAt: new Date() })
    .where(and(eq(rosters.id, id), eq(rosters.userId, user.id)));

  return NextResponse.json({ success: true });
}
