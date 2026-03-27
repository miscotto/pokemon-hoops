import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seasonLockedPokemon, seasons } from "@/lib/schema";
import { inArray, eq } from "drizzle-orm";

export async function GET() {
  try {
    const rows = await db
      .selectDistinct({ pokemonId: seasonLockedPokemon.pokemonId })
      .from(seasonLockedPokemon)
      .innerJoin(seasons, eq(seasonLockedPokemon.seasonId, seasons.id))
      .where(inArray(seasons.status, ["registration", "active", "playoffs"]));

    const lockedPokemonIds = rows.map((r) => r.pokemonId);

    return NextResponse.json(
      { lockedPokemonIds },
      { headers: { "Cache-Control": "max-age=30" } }
    );
  } catch {
    return NextResponse.json({ lockedPokemonIds: [] });
  }
}
