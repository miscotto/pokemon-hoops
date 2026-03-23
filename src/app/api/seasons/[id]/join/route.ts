import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { rosters, rosterPokemon } from "@/lib/schema";
import { eq, and, asc } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";
import { getSeason, getSeasonTeamCount, getUserSeasonTeam, joinSeason } from "@/lib/season-db";

let cachedPool: Record<number, Record<string, unknown>> | null = null;
function loadPokemonPool(): Record<number, Record<string, unknown>> {
  if (cachedPool) return cachedPool;
  const data: Record<string, unknown>[] = JSON.parse(
    readFileSync(join(process.cwd(), "public", "pokemon-bball-stats-augmented.json"), "utf-8")
  );
  cachedPool = {};
  for (const p of data) cachedPool[p.id as number] = p;
  return cachedPool;
}

const SALARY_CAP = 160_000_000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: seasonId } = await params;
  const season = await getSeason(seasonId);
  if (!season) return NextResponse.json({ error: "Season not found" }, { status: 404 });
  if (season.status !== "registration") return NextResponse.json({ error: "Season is not open for registration" }, { status: 400 });
  if (season.registrationClosedAt) return NextResponse.json({ error: "Registration is closed" }, { status: 400 });

  const teamCount = await getSeasonTeamCount(seasonId);
  if (teamCount >= season.maxTeams) return NextResponse.json({ error: "Season is full" }, { status: 400 });

  const existing = await getUserSeasonTeam(seasonId, session.user.id);
  if (existing) return NextResponse.json({ error: "Already joined this season" }, { status: 400 });

  // Load the user's tournament roster
  const rosterRows = await db
    .select({ id: rosters.id, name: rosters.name, city: rosters.city })
    .from(rosters)
    .where(and(eq(rosters.userId, session.user.id), eq(rosters.isTournamentRoster, true)));

  if (rosterRows.length === 0) {
    return NextResponse.json({ error: "No tournament roster set. Set one from your dashboard first." }, { status: 400 });
  }

  const { id: rosterId, name: rosterName, city: rosterCity } = rosterRows[0];
  const teamName = rosterCity ? `${rosterCity} ${rosterName}` : rosterName;

  const pokemonRows = await db
    .select()
    .from(rosterPokemon)
    .where(eq(rosterPokemon.rosterId, rosterId))
    .orderBy(asc(rosterPokemon.slotPosition));

  if (pokemonRows.length !== 6) {
    return NextResponse.json({ error: "Tournament roster must have exactly 6 Pokémon." }, { status: 400 });
  }

  // Validate salary cap
  const pool = loadPokemonPool();
  let totalSalary = 0;
  const rosterData = pokemonRows.map((p) => {
    const full = pool[p.pokemonId] || {};
    const salary = (full.salary as number) ?? 0;
    totalSalary += salary;
    return {
      id: p.pokemonId,
      name: p.pokemonName,
      sprite: p.pokemonSprite,
      types: p.pokemonTypes as string[],
      stats: p.pokemonStats,
      height: p.pokemonHeight,
      weight: p.pokemonWeight,
      tag: p.pokemonTag || undefined,
      position: p.slotLabel || undefined,
      ability: (full.ability as string) || undefined,
      rivals: (full.rivals as string[]) || [],
      allies: (full.allies as string[]) || [],
      physicalProfile: full.physicalProfile || undefined,
      bball: full.bball || undefined,
      playstyle: (full.playstyle as string[]) || undefined,
      salary,
    };
  });

  if (totalSalary > SALARY_CAP) {
    return NextResponse.json({ error: `Roster exceeds $160M salary cap ($${(totalSalary / 1_000_000).toFixed(1)}M total)` }, { status: 400 });
  }

  const pokemonIds = pokemonRows.map((p) => p.pokemonId);
  const result = await joinSeason({ seasonId, userId: session.user.id, teamName, rosterData, pokemonIds });

  if (!result.success) {
    return NextResponse.json({
      error: "Some Pokémon are already taken by other teams",
      takenPokemonIds: result.takenPokemonIds,
    }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
