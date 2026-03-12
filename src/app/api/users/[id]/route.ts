import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rosters, rosterPokemon } from "@/lib/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { getUserTournamentHistory } from "@/lib/tournament-db";

// Public endpoint — no auth required
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await params;

  // Fetch user from better-auth user table (not in Drizzle schema)
  const userRows = await db.execute(
    sql`SELECT id, name, created_at FROM "user" WHERE id = ${userId} LIMIT 1`
  );
  const userRow = userRows.rows[0] as { id: string; name: string; created_at: string } | undefined;
  if (!userRow) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Fetch tournament history
  const history = await getUserTournamentHistory(userId);

  // Compute stats
  const played = history.length;
  const wins = history.filter((h) => h.result === "champion").length;
  const losses = history.filter((h) => h.result === "eliminated" || h.result === "finalist").length;
  const winRate = played > 0 ? Math.round((wins / played) * 100) : 0;

  // Fetch tournament roster (the one marked isTournamentRoster)
  const rosterRows = await db
    .select({ id: rosters.id, name: rosters.name, city: rosters.city })
    .from(rosters)
    .where(and(eq(rosters.userId, userId), eq(rosters.isTournamentRoster, true)))
    .limit(1);

  let tournamentRoster = null;
  if (rosterRows[0]) {
    const pokemon = await db
      .select()
      .from(rosterPokemon)
      .where(eq(rosterPokemon.rosterId, rosterRows[0].id))
      .orderBy(asc(rosterPokemon.slotPosition));

    tournamentRoster = {
      id: rosterRows[0].id,
      name: rosterRows[0].name,
      city: rosterRows[0].city,
      pokemon: pokemon.map((p) => ({
        slotPosition: p.slotPosition,
        slotLabel: p.slotLabel,
        pokemonId: p.pokemonId,
        pokemonName: p.pokemonName,
        pokemonSprite: p.pokemonSprite,
        pokemonTypes: p.pokemonTypes,
      })),
    };
  }

  return NextResponse.json({
    user: {
      id: userRow.id,
      name: userRow.name,
      createdAt: userRow.created_at,
    },
    stats: { played, wins, losses, winRate },
    tournamentRoster,
    tournamentHistory: history.map((h) => ({
      tournamentId: h.tournament_id,
      tournamentName: h.tournament_name,
      result: h.result,
      roundReached: h.round_reached,
      joinedAt: h.joined_at,
    })),
  });
}
