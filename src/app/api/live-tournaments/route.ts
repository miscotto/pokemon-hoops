import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { rosters, rosterPokemon } from "@/lib/schema";
import { headers } from "next/headers";
import { eq, and, asc } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";
import {
  findOpenTournament,
  createTournament,
  joinTournament,
  getTournamentTeamCount,
  getTournamentTeams,
  startTournament,
  getUserActiveTournament,
} from "@/lib/tournament-db";
import {
  TournamentTeam,
  toTournamentPokemon,
  simulateFullBracket,
  Coast,
} from "../../utils/tournamentEngine";

async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

// Cache the augmented pokemon pool in memory
let cachedPool: Record<number, Record<string, unknown>> | null = null;

function loadPokemonPool(): Record<number, Record<string, unknown>> {
  if (cachedPool) return cachedPool;
  const filePath = join(process.cwd(), "public", "pokemon-bball-stats-augmented.json");
  const data: Record<string, unknown>[] = JSON.parse(readFileSync(filePath, "utf-8"));
  cachedPool = {};
  for (const p of data) {
    cachedPool[p.id as number] = p;
  }
  return cachedPool;
}

// GET /api/live-tournaments — Check if user is in a tournament
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const active = await getUserActiveTournament(user.id);
  if (active) {
    return NextResponse.json({
      tournamentId: active.tournament_id,
      status: active.status,
    });
  }

  return NextResponse.json({ tournamentId: null });
}

// POST /api/live-tournaments — Join or create a live tournament
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check if user already in a tournament
  const active = await getUserActiveTournament(user.id);
  if (active) {
    return NextResponse.json({
      tournamentId: active.tournament_id,
      status: active.status,
    });
  }

  // Check tournament roster
  const rosterRows = await db
    .select({ id: rosters.id, name: rosters.name })
    .from(rosters)
    .where(and(eq(rosters.userId, user.id), eq(rosters.isTournamentRoster, true)));

  if (rosterRows.length === 0) {
    return NextResponse.json(
      { error: "No tournament roster set. Set one from your dashboard first." },
      { status: 400 }
    );
  }

  const { id: rosterId, name: rosterName } = rosterRows[0];

  // Load roster pokemon
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
      { error: "Tournament roster must have 6 Pokemon." },
      { status: 400 }
    );
  }

  // Augment with full data (ability, rivals, allies, etc.)
  const pool = loadPokemonPool();
  const rosterData = pokemon.map((p) => {
    const id = p.pokemon_id;
    const full = pool[id] || {};
    return {
      id,
      name: p.pokemon_name,
      sprite: p.pokemon_sprite,
      types: p.pokemon_types as string[],
      stats: p.pokemon_stats,
      height: p.pokemon_height,
      weight: p.pokemon_weight,
      tag: p.pokemon_tag || undefined,
      ability: (full.ability as string) || undefined,
      rivals: (full.rivals as string[]) || [],
      allies: (full.allies as string[]) || [],
      physicalProfile: full.physicalProfile || undefined,
      bball: full.bball || undefined,
      playstyle: (full.playstyle as string) || undefined,
      salary: (full.salary as number) || undefined,
    };
  });

  // Find or create tournament
  let tournamentId = await findOpenTournament();
  if (!tournamentId) {
    tournamentId = await createTournament();
  }

  await joinTournament(tournamentId, user.id, rosterId, rosterName, rosterData);

  // Check if tournament is full → start it
  const count = await getTournamentTeamCount(tournamentId);
  if (count >= 8) {
    const teams = await getTournamentTeams(tournamentId);

    const tournamentTeams: TournamentTeam[] = teams.map((t) => ({
      id: t.id,
      name: t.team_name,
      coast: "west" as Coast,
      seed: 1,
      isPlayer: true,
      roster: (t.roster_data as Parameters<typeof toTournamentPokemon>[0][]).map(
        (p) => toTournamentPokemon(p)
      ),
    }));

    // Rank by team power for seeding
    const ranked = tournamentTeams
      .map((t) => ({
        team: t,
        power: t.roster.reduce(
          (sum, p) =>
            sum +
            p.bball.ppg * 2.5 +
            p.bball.rpg * 1.2 +
            p.bball.apg * 1.8 +
            p.bball.per * 1.0,
          0
        ),
      }))
      .sort((a, b) => b.power - a.power);

    // Alternate assignment: #1→West, #2→East, #3→West, #4→East, ...
    const westTeams: TournamentTeam[] = [];
    const eastTeams: TournamentTeam[] = [];
    for (let i = 0; i < ranked.length; i++) {
      const team = ranked[i].team;
      if (i % 2 === 0) {
        team.coast = "west";
        team.seed = westTeams.length + 1;
        westTeams.push(team);
      } else {
        team.coast = "east";
        team.seed = eastTeams.length + 1;
        eastTeams.push(team);
      }
    }

    const bracketData = simulateFullBracket(westTeams, eastTeams);
    await startTournament(tournamentId, bracketData);

    return NextResponse.json({ tournamentId, status: "active" });
  }

  return NextResponse.json({ tournamentId, status: "waiting", teamCount: count });
}
