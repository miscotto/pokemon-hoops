import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { rosters, rosterPokemon } from "@/lib/schema";
import { headers } from "next/headers";
import { eq, and, asc } from "drizzle-orm";
import { isRosterInActiveTournament } from "@/lib/tournament-db";

async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

// GET /api/rosters/[id] — get a single roster with its pokemon
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const rosterRows = await db
    .select({
      id: rosters.id,
      name: rosters.name,
      city: rosters.city,
      is_tournament_roster: rosters.isTournamentRoster,
      created_at: rosters.createdAt,
      updated_at: rosters.updatedAt,
    })
    .from(rosters)
    .where(and(eq(rosters.id, id), eq(rosters.userId, user.id)));

  if (rosterRows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pokemon = await db
    .select({
      slot_position: rosterPokemon.slotPosition,
      slot_label: rosterPokemon.slotLabel,
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
    .where(eq(rosterPokemon.rosterId, id))
    .orderBy(asc(rosterPokemon.slotPosition));

  return NextResponse.json({ ...rosterRows[0], pokemon });
}

// PUT /api/rosters/[id] — update roster name or pokemon
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  // Verify ownership
  const owned = await db
    .select({ id: rosters.id })
    .from(rosters)
    .where(and(eq(rosters.id, id), eq(rosters.userId, user.id)));

  if (owned.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Block edits if roster is in an active live tournament
  if (await isRosterInActiveTournament(id)) {
    return NextResponse.json(
      { error: "This roster is locked — it's currently in a live tournament." },
      { status: 403 }
    );
  }

  // Update name/city if provided
  if (body.name || body.city !== undefined) {
    await db
      .update(rosters)
      .set({
        ...(body.name ? { name: body.name.trim() } : {}),
        ...(body.city !== undefined ? { city: body.city.trim() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(rosters.id, id));
  }

  // Update pokemon slots if provided
  if (body.pokemon && Array.isArray(body.pokemon)) {
    await db.delete(rosterPokemon).where(eq(rosterPokemon.rosterId, id));

    const slots = body.pokemon.filter((s: { pokemon_id?: number }) => s.pokemon_id);
    if (slots.length > 0) {
      await db.insert(rosterPokemon).values(
        slots.map((slot: {
          slot_position: number;
          slot_label: string;
          pokemon_id: number;
          pokemon_name: string;
          pokemon_sprite: string;
          pokemon_types: unknown;
          pokemon_stats: unknown;
          pokemon_height: number;
          pokemon_weight: number;
          pokemon_tag?: string;
        }) => ({
          rosterId: id,
          slotPosition: slot.slot_position,
          slotLabel: slot.slot_label,
          pokemonId: slot.pokemon_id,
          pokemonName: slot.pokemon_name,
          pokemonSprite: slot.pokemon_sprite,
          pokemonTypes: slot.pokemon_types,
          pokemonStats: slot.pokemon_stats,
          pokemonHeight: slot.pokemon_height,
          pokemonWeight: slot.pokemon_weight,
          pokemonTag: slot.pokemon_tag || null,
        }))
      );
    }

    await db
      .update(rosters)
      .set({ updatedAt: new Date() })
      .where(eq(rosters.id, id));
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/rosters/[id] — delete a roster
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const result = await db
    .delete(rosters)
    .where(and(eq(rosters.id, id), eq(rosters.userId, user.id)))
    .returning({ id: rosters.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
