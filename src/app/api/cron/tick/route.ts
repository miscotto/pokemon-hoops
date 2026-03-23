import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { db } from "@/lib/db";
import { liveTournaments, tournamentGames, seasons } from "@/lib/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import { claimGame } from "@/lib/tournament-db";
import { simulateGameLive } from "@/lib/simulate-game-live";
import {
  resetStaleSeasonGames,
  getPendingSeasonGames,
  claimSeasonGame,
  tryStartPlayoffs,
  tryAdvancePlayoffRound,
  getSeasonGames,
} from "@/lib/season-db";
import { simulateSeasonGameLive } from "@/lib/simulate-season-game-live";

export const maxDuration = 800;

// How long each round lasts (seconds)
const ROUND_DURATION_S = 300;
const ROUND_BUFFER_S = 15;

export async function GET(req: NextRequest) {
  // Verify Vercel Cron authorization header in production
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Reset stale in_progress games (claimed > 800s ago — function must have crashed)
  await db
    .update(tournamentGames)
    .set({ status: "pending", claimedAt: null })
    .where(
      and(
        eq(tournamentGames.status, "in_progress"),
        lt(tournamentGames.claimedAt!, new Date(Date.now() - 800_000))
      )
    );

  // 2. Find all active tournaments
  const activeTournaments = await db
    .select({ id: liveTournaments.id, startedAt: liveTournaments.startedAt })
    .from(liveTournaments)
    .where(eq(liveTournaments.status, "active"));

  for (const tournament of activeTournaments) {
    if (!tournament.startedAt) continue;
    const startedAtMs = tournament.startedAt.getTime();
    const now = Date.now();

    // Find all pending games for this tournament
    const pendingGames = await db
      .select({
        id: tournamentGames.id,
        round: tournamentGames.round,
      })
      .from(tournamentGames)
      .where(
        and(
          eq(tournamentGames.tournamentId, tournament.id),
          eq(tournamentGames.status, "pending")
        )
      );

    for (const game of pendingGames) {
      // Check if this round's window has opened
      const roundStartMs = startedAtMs + (game.round - 1) * (ROUND_DURATION_S + ROUND_BUFFER_S) * 1000;
      if (now < roundStartMs) continue; // round hasn't started yet

      // Atomically claim and dispatch
      const claimed = await claimGame(game.id);
      if (!claimed) continue; // already claimed by concurrent request

      // Fire-and-forget background simulation
      waitUntil(simulateGameLive(game.id));
    }
  }

  // ── Season Game Processing ─────────────────────────────────────────────────

  // 1. Reset stale season games
  await resetStaleSeasonGames();

  // 2. Process pending season games whose scheduledAt has passed
  const pendingSeasonGames = await getPendingSeasonGames(new Date());
  for (const game of pendingSeasonGames) {
    const claimed = await claimSeasonGame(game.id);
    if (!claimed) continue;
    waitUntil(simulateSeasonGameLive(game.id));
  }

  // 3. Check if any active season is ready for playoff transition
  const activeSeasons = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.status, "active"));

  for (const season of activeSeasons) {
    await tryStartPlayoffs(season.id);
  }

  // 4. Resilience: re-check playoff round advancement for seasons already in playoffs
  //    (catches cases where simulateSeasonGameLive crashed after writing the result
  //    but before calling tryAdvancePlayoffRound)
  const playoffSeasons = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.status, "playoffs"));

  for (const season of playoffSeasons) {
    // Find the highest completed round to attempt advancement on
    const allPlayoffGames = await getSeasonGames(season.id, { gameType: "playoff" });
    const rounds = [...new Set(allPlayoffGames.map((g) => g.round).filter(Boolean))].sort();
    for (const round of rounds) {
      await tryAdvancePlayoffRound(season.id, round!);
    }
  }

  return NextResponse.json({ ok: true });
}
