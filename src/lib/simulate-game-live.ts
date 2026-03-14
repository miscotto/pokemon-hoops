import { db } from "./db";
import { tournamentGames } from "./schema";
import { eq } from "drizzle-orm";
import {
  insertGameEvent,
  writeGameResult,
  deleteGameEvents,
  getGameEvents,
  getTeamRosterData,
  tryAdvanceRound,
  updateTeamResult,
} from "./tournament-db";
import { toTournamentPokemon, TournamentTeam } from "../app/utils/tournamentEngine";
import { createGameIterator } from "./game-iterator";

const DEADLINE_MS = 280_000; // flush remaining events without sleep if approaching limit

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeTeam(userId: string, name: string, rosterData: unknown): TournamentTeam {
  return {
    id: userId,
    name,
    coast: "west",
    seed: 1,
    isPlayer: true,
    roster: (rosterData as Parameters<typeof toTournamentPokemon>[0][]).map(toTournamentPokemon),
  };
}

export async function simulateGameLive(gameId: string): Promise<void> {
  // Load game to get tournament context
  const gameRows = await db
    .select()
    .from(tournamentGames)
    .where(eq(tournamentGames.id, gameId));

  const game = gameRows[0];
  if (!game || game.status !== "in_progress") return;

  const tournamentId = game.tournamentId;
  const round = game.round;

  // Load rosters
  const [team1Data, team2Data] = await Promise.all([
    getTeamRosterData(tournamentId, game.team1UserId!),
    getTeamRosterData(tournamentId, game.team2UserId!),
  ]);

  if (!team1Data || !team2Data) {
    console.error(`[simulateGameLive] Missing roster data for game ${gameId}`);
    return;
  }

  // Clear any partial events from a previous crashed attempt
  await deleteGameEvents(gameId);

  // Mark started_at
  await db
    .update(tournamentGames)
    .set({ startedAt: new Date() })
    .where(eq(tournamentGames.id, gameId));

  const homeTeam = makeTeam(game.team1UserId!, team1Data.team_name, team1Data.roster_data);
  const awayTeam = makeTeam(game.team2UserId!, team2Data.team_name, team2Data.roster_data);

  const iterator = createGameIterator(homeTeam, awayTeam);
  const startMs = Date.now();

  let event;
  while ((event = iterator.next()) !== null) {
    // Write event to DB
    await insertGameEvent(gameId, event.sequence, event.type, event as unknown as Record<string, unknown>);

    // Sleep (skip if we're approaching the Vercel deadline)
    const elapsed = Date.now() - startMs;
    if (elapsed < DEADLINE_MS && event.type !== "game_end") {
      await sleep(event.sleepMs);
    }
  }

  // After the loop — find the game_end event to get final scores
  const allEvents = await getGameEvents(gameId);
  const gameEndEvt = allEvents.reverse().find((e) => e.type === "game_end");
  const scores = gameEndEvt?.data as { homeScore: number; awayScore: number } | undefined;

  if (!scores) {
    console.error(`[simulateGameLive] No game_end event found for game ${gameId}`);
    return;
  }

  const team1Score = scores.homeScore;
  const team2Score = scores.awayScore;
  const winnerId = team1Score > team2Score ? game.team1UserId! : game.team2UserId!;
  const loserId = winnerId === game.team1UserId ? game.team2UserId! : game.team1UserId!;

  // game_end is already in DB — safe to set status=completed now
  await writeGameResult(gameId, team1Score, team2Score, winnerId);
  await updateTeamResult(tournamentId, loserId, "eliminated", round);
  await tryAdvanceRound(tournamentId, round);
}
