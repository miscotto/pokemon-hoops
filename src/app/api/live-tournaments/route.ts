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
  getTournament,
  startTournament,
  getUserActiveTournament,
  getAllTournaments,
} from "@/lib/tournament-db";
import { toTournamentPokemon } from "../../utils/tournamentEngine";

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

// GET /api/live-tournaments — Check if user is in a tournament, or list open tournaments
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);

  // ?available=true → list open tournaments the user can join
  if (searchParams.get("available") === "true") {
    const all = await getAllTournaments(50);
    const open = all.filter((t) => t.status === "waiting" && t.team_count < t.max_teams);
    return NextResponse.json(open);
  }

  const active = await getUserActiveTournament(user.id);
  if (active) {
    const info = await getTournament(active.tournament_id);
    return NextResponse.json({
      tournamentId: active.tournament_id,
      status: active.status,
      name: info?.name ?? "Tournament",
    });
  }

  return NextResponse.json({ tournamentId: null });
}

// POST /api/live-tournaments — Join a specific or any open live tournament
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });



  const body = await req.json().catch(() => ({}));
  const { tournamentId: requestedId } = (body ?? {}) as { tournamentId?: string };

  // Check tournament roster
  const rosterRows = await db
    .select({ id: rosters.id, name: rosters.name, city: rosters.city })
    .from(rosters)
    .where(and(eq(rosters.userId, user.id), eq(rosters.isTournamentRoster, true)));

  if (rosterRows.length === 0) {
    return NextResponse.json(
      { error: "No tournament roster set. Set one from your dashboard first." },
      { status: 400 }
    );
  }

  const { id: rosterId, name: rosterName, city: rosterCity } = rosterRows[0];
  const teamName = rosterCity ? `${rosterCity} ${rosterName}` : rosterName;

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
      slot_label: rosterPokemon.slotLabel,
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
      position: p.slot_label || undefined,
      ability: (full.ability as string) || undefined,
      rivals: (full.rivals as string[]) || [],
      allies: (full.allies as string[]) || [],
      physicalProfile: full.physicalProfile || undefined,
      bball: full.bball || undefined,
      playstyle: (full.playstyle as string[]) || undefined,
      salary: (full.salary as number) || undefined,
    };
  });

  // Find the tournament to join
  let tournamentId: string;
  if (requestedId) {
    const requested = await getTournament(requestedId);
    if (!requested || requested.status !== "waiting") {
      return NextResponse.json({ error: "Tournament is not available to join" }, { status: 400 });
    }
    const count = await getTournamentTeamCount(requestedId);
    if (count >= requested.max_teams) {
      return NextResponse.json({ error: "Tournament is full" }, { status: 400 });
    }
    tournamentId = requestedId;
  } else {
    const found = await findOpenTournament();
    tournamentId = found ?? await createTournament();
  }

  await joinTournament(tournamentId, user.id, rosterId, teamName, rosterData);

  // Check if tournament is full → start it
  const count = await getTournamentTeamCount(tournamentId);
  const tournamentInfo = await getTournament(tournamentId);
  const maxTeams = tournamentInfo?.max_teams ?? 8;

  if (count >= maxTeams) {
    const teams = await getTournamentTeams(tournamentId);

    // Rank teams by power for seeding — build a flat list with userId
    const rankedTeams = teams
      .map((t) => {
        const roster = (t.roster_data as Parameters<typeof toTournamentPokemon>[0][]).map(
          toTournamentPokemon
        );
        const power = roster.reduce(
          (sum, p) =>
            sum +
            p.bball.ppg * 2.5 +
            p.bball.rpg * 1.2 +
            p.bball.apg * 1.8 +
            p.bball.per * 1.0,
          0
        );
        return { userId: t.user_id, teamName: t.team_name, power };
      })
      .sort((a, b) => b.power - a.power);

    // Pair: seed 1 vs last, seed 2 vs second-last, etc.
    const totalRounds = Math.floor(Math.log2(maxTeams));
    const round1Matchups: Array<{
      matchupIndex: number;
      team1UserId: string;
      team1Name: string;
      team2UserId: string;
      team2Name: string;
    }> = [];

    for (let i = 0; i < rankedTeams.length / 2; i++) {
      round1Matchups.push({
        matchupIndex: i,
        team1UserId: rankedTeams[i].userId,
        team1Name: rankedTeams[i].teamName,
        team2UserId: rankedTeams[rankedTeams.length - 1 - i].userId,
        team2Name: rankedTeams[rankedTeams.length - 1 - i].teamName,
      });
    }

    await startTournament(tournamentId, round1Matchups, totalRounds);
    return NextResponse.json({ tournamentId, status: "active" });
  }

  return NextResponse.json({ tournamentId, status: "waiting", teamCount: count });
}
