// src/app/api/live-tournaments/[id]/fill-bots/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  getTournament,
  getTournamentTeamCount,
  getTournamentTeams,
  joinTournament,
  startTournament,
} from "@/lib/tournament-db";
import { loadPokemonPool } from "@/lib/pokemon-pool";
// Using relative import — vitest config lacks @/ alias resolution
import { toTournamentPokemon } from "../../../../utils/tournamentEngine";

// ─── Bot name data ────────────────────────────────────────────────────────────

const BOT_CITIES = [
  "Pallet", "Cerulean", "Vermilion", "Lavender", "Celadon",
  "Fuchsia", "Saffron", "Cinnabar", "Viridian", "Pewter",
  "Goldenrod", "Ecruteak", "Olivine", "Mahogany", "Blackthorn", "Azalea",
];

const BOT_MASCOTS = [
  "Charizards", "Arcanines", "Gengars", "Machamps", "Alakazams",
  "Gyaradoses", "Snorlaxes", "Electrodes", "Nidokings", "Tauros",
  "Rhydons", "Onixes",
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateBotNames(count: number): string[] {
  const cities = shuffle(BOT_CITIES);
  const mascots = shuffle(BOT_MASCOTS);
  return Array.from({ length: count }, (_, i) => {
    const city = cities[i % cities.length];
    const mascot = mascots[i % mascots.length];
    return `${city} ${mascot}`;
  });
}

// ─── Bot roster generation ────────────────────────────────────────────────────

const SLOT_LABELS = ["PG", "SG", "SF", "PF", "C", "6MAN"];

function generateBotRoster(pool: Record<number, Record<string, unknown>>) {
  const ids = shuffle(Object.keys(pool).map(Number)).slice(0, 6);
  return ids.map((id, i) => {
    const p = pool[id];
    return {
      id,
      name: p.name as string,
      sprite: (p.sprite as string) ?? undefined,
      types: (p.types as string[]) ?? [],
      stats: p.stats ?? {},
      height: (p.height as number) ?? undefined,
      weight: (p.weight as number) ?? undefined,
      position: SLOT_LABELS[i],
      ability: (p.ability as string) ?? undefined,
      rivals: (p.rivals as string[]) ?? [],
      allies: (p.allies as string[]) ?? [],
      physicalProfile: p.physicalProfile ?? undefined,
      bball: p.bball ?? {},
      playstyle: (p.playstyle as string[]) ?? undefined,
      salary: (p.salary as number) ?? undefined,
    };
  });
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;

  // Auth
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Tournament exists?
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  // Creator check
  if (!tournament.created_by || tournament.created_by !== session.user.id) {
    return NextResponse.json(
      { error: "Only the tournament creator can fill with bots" },
      { status: 403 }
    );
  }

  // Fast-path pre-checks (avoid acquiring the lock unnecessarily)
  if (tournament.status !== "waiting") {
    return NextResponse.json({ error: "Tournament has already started" }, { status: 400 });
  }
  const currentCount = await getTournamentTeamCount(tournamentId);
  if (currentCount >= tournament.max_teams) {
    return NextResponse.json({ error: "Tournament is already full" }, { status: 400 });
  }

  // Load pool before transaction
  const pool = loadPokemonPool();

  // ── Transaction: advisory lock + re-check + bot inserts ───────────────────
  let aborted = false;

  await db.transaction(async (tx) => {
    // Advisory transaction lock — blocks concurrent fill-bots for the same tournament
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${tournamentId + ":fill"}))`
    );

    // Re-check status + count atomically inside the lock
    const [row] = await tx.execute(
      sql`SELECT status, (SELECT COUNT(*)::int FROM live_tournament_teams WHERE tournament_id = ${tournamentId}) AS count FROM live_tournaments WHERE id = ${tournamentId}`
    ) as unknown as [{ status: string; count: number }];

    if (!row || row.status !== "waiting" || row.count >= tournament.max_teams) {
      aborted = true;
      return;
    }

    const remaining = tournament.max_teams - row.count;
    const names = generateBotNames(remaining);

    for (let i = 0; i < remaining; i++) {
      const botUserId = `bot_${crypto.randomUUID()}`;
      const rosterData = generateBotRoster(pool);
      // Bots have no real roster row — use botUserId for both userId and rosterId
      await joinTournament(tournamentId, botUserId, botUserId, names[i], rosterData, tx);
    }
  });

  if (aborted) {
    return NextResponse.json({ error: "Tournament no longer available" }, { status: 400 });
  }

  // ── Seed and start (outside transaction) ──────────────────────────────────
  const teams = await getTournamentTeams(tournamentId);
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

  const totalRounds = Math.floor(Math.log2(tournament.max_teams));
  const round1Matchups = [];
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
