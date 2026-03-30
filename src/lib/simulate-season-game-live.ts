import { db } from "./db";
import { seasonGames } from "./schema";
import { eq } from "drizzle-orm";
import {
  insertSeasonGameEvent,
  writeSeasonGameResult,
  deleteSeasonGameEvents,
  getSeasonGameEvents,
  getSeasonGameRosterData,
  tryAdvancePlayoffRound,
} from "./season-db";
import { toTournamentPokemon, TournamentTeam } from "../app/utils/tournamentEngine";
import { createGameIterator } from "./game-iterator";

const DEADLINE_MS = 280_000;

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

export async function simulateSeasonGameLive(gameId: string): Promise<void> {
  const gameRows = await db.select().from(seasonGames).where(eq(seasonGames.id, gameId));
  const game = gameRows[0];
  if (!game || game.status !== "in_progress") return;

  const seasonId = game.seasonId;

  const [team1Data, team2Data] = await Promise.all([
    getSeasonGameRosterData(seasonId, game.team1UserId),
    getSeasonGameRosterData(seasonId, game.team2UserId),
  ]);

  if (!team1Data || !team2Data) {
    console.error(`[simulateSeasonGameLive] Missing roster data for game ${gameId}`);
    return;
  }

  await deleteSeasonGameEvents(gameId);

  await db.update(seasonGames).set({ startedAt: new Date() }).where(eq(seasonGames.id, gameId));

  const homeTeam = makeTeam(game.team1UserId, team1Data.teamName, team1Data.rosterData);
  const awayTeam = makeTeam(game.team2UserId, team2Data.teamName, team2Data.rosterData);

  const iterator = createGameIterator(homeTeam, awayTeam);
  const startMs = Date.now();

  let event;
  while ((event = iterator.next()) !== null) {
    await insertSeasonGameEvent(gameId, event.sequence, event.type, event as unknown as Record<string, unknown>);
    const elapsed = Date.now() - startMs;
    if (elapsed < DEADLINE_MS && event.type !== "game_end") {
      await sleep(event.sleepMs);
    }
  }

  const allEvents = await getSeasonGameEvents(gameId);
  const gameEndEvt = allEvents.reverse().find((e) => e.type === "game_end");
  const scores = gameEndEvt?.data as { homeScore: number; awayScore: number } | undefined;

  if (!scores) {
    console.error(`[simulateSeasonGameLive] No game_end event for game ${gameId}`);
    return;
  }

  const team1Score = scores.homeScore;
  const team2Score = scores.awayScore;
  const winnerId = team1Score > team2Score ? game.team1UserId : game.team2UserId;
  const loserId = winnerId === game.team1UserId ? game.team2UserId : game.team1UserId;

  const seriesResult = await writeSeasonGameResult(
    gameId, seasonId, game.team1UserId, team1Score, team2Score, winnerId, loserId
  );

  if (seriesResult) {
    if (seriesResult.nextGameNumber !== null) {
      // Series continues — schedule the next game in this series
      await db.insert(seasonGames).values({
        seasonId,
        gameType: "playoff",
        team1UserId: seriesResult.team1UserId,
        team1Name: seriesResult.team1Name,
        team2UserId: seriesResult.team2UserId,
        team2Name: seriesResult.team2Name,
        scheduledAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
        round: seriesResult.round,
        matchupIndex: seriesResult.matchupIndex,
        seriesId: seriesResult.seriesId,
        gameNumberInSeries: seriesResult.nextGameNumber,
        status: "pending",
      });
    } else {
      // Series clinched — advance the playoff round (opens its own tx with advisory lock)
      await tryAdvancePlayoffRound(seasonId, seriesResult.round);
    }
  } else if (game.gameType === "playoff" && game.round != null && !game.seriesId) {
    // Legacy: in-flight playoff games from before the migration have no seriesId.
    // Fall back to the old round-advancement path so they complete cleanly.
    await tryAdvancePlayoffRound(seasonId, game.round);
  }
}
