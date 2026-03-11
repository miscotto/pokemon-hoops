import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { rosters, rosterPokemon } from "@/lib/schema";
import { headers } from "next/headers";
import { eq, and, asc } from "drizzle-orm";

async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

// POST /api/tournament/simulate — run a tournament simulation
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Find the user's tournament roster
  const rosterRows = await db
    .select({ id: rosters.id, name: rosters.name })
    .from(rosters)
    .where(and(eq(rosters.userId, user.id), eq(rosters.isTournamentRoster, true)));

  if (rosterRows.length === 0) {
    return NextResponse.json(
      { error: "No tournament roster set. Please set a roster as your tournament roster first." },
      { status: 400 }
    );
  }

  const { id: rosterId, name: rosterName } = rosterRows[0];

  // Get the pokemon in the roster
  const pokemon = await db
    .select({
      pokemon_id: rosterPokemon.pokemonId,
      pokemon_name: rosterPokemon.pokemonName,
      pokemon_sprite: rosterPokemon.pokemonSprite,
      pokemon_types: rosterPokemon.pokemonTypes,
      pokemon_stats: rosterPokemon.pokemonStats,
      pokemon_height: rosterPokemon.pokemonHeight,
      pokemon_weight: rosterPokemon.pokemonWeight,
      pokemon_tag: rosterPokemon.pokemonTag,
    })
    .from(rosterPokemon)
    .where(eq(rosterPokemon.rosterId, rosterId))
    .orderBy(asc(rosterPokemon.slotPosition));

  if (pokemon.length < 6) {
    return NextResponse.json(
      { error: "Tournament roster must have 6 Pokémon." },
      { status: 400 }
    );
  }

  const playerRoster = pokemon.map((p) => ({
    id: p.pokemon_id,
    name: p.pokemon_name,
    sprite: p.pokemon_sprite,
    types: p.pokemon_types as string[],
    stats: p.pokemon_stats as {
      hp: number;
      attack: number;
      defense: number;
      speed: number;
      specialAttack: number;
      specialDefense: number;
    },
    height: p.pokemon_height,
    weight: p.pokemon_weight,
    tag: (p.pokemon_tag as "ball handler" | "support") || undefined,
  }));

  return NextResponse.json({
    playerTeam: {
      id: rosterId,
      name: rosterName,
      roster: playerRoster,
    },
  });
}
