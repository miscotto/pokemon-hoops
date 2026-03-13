import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getTournament,
  getGame,
  claimGame,
  writeGameResult,
  updateTeamResult,
  getTeamRosterData,
  getTournamentGames,
  appendNextRound,
  completeTournament,
  BracketStructure,
} from "@/lib/tournament-db";
import { simulateMatchup, TournamentTeam, toTournamentPokemon } from "@/app/utils/tournamentEngine";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; gameId: string }> }
) {
  const { gameId } = await params;
  const game = await getGame(gameId);
  if (!game) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    status: game.status,
    team1Score: game.team1Score,
    team2Score: game.team2Score,
    winnerId: game.winnerId,
    events: [],
  });
}

async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; gameId: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: tournamentId, gameId } = await params;

  const tournament = await getTournament(tournamentId);
  if (!tournament || tournament.status !== "active") {
    return NextResponse.json({ error: "Tournament not active" }, { status: 400 });
  }

  // Try to atomically claim the game
  const claimed = await claimGame(gameId);
  if (!claimed) {
    // Already completed or being simulated — return existing result
    const existing = await getGame(gameId);
    if (!existing) return NextResponse.json({ error: "Game not found" }, { status: 404 });
    return NextResponse.json({
      status: existing.status,
      team1Score: existing.team1Score,
      team2Score: existing.team2Score,
      winnerId: existing.winnerId,
      events: [],
    });
  }

  // Load roster data for both teams
  const [team1Data, team2Data] = await Promise.all([
    getTeamRosterData(tournamentId, claimed.team1UserId!),
    getTeamRosterData(tournamentId, claimed.team2UserId!),
  ]);

  if (!team1Data || !team2Data) {
    return NextResponse.json({ error: "Team data not found" }, { status: 500 });
  }

  // Convert to TournamentTeam format for simulation
  const makeTeam = (userId: string, name: string, rosterData: unknown): TournamentTeam => ({
    id: userId,
    name,
    coast: "west",
    seed: 1,
    isPlayer: true,
    roster: (rosterData as Parameters<typeof toTournamentPokemon>[0][]).map(toTournamentPokemon),
  });

  const team1 = makeTeam(claimed.team1UserId!, team1Data.team_name, team1Data.roster_data);
  const team2 = makeTeam(claimed.team2UserId!, team2Data.team_name, team2Data.roster_data);

  // Simulate the game
  const result = simulateMatchup(team1, team2);
  const team1Score = result.finalHomeScore;
  const team2Score = result.finalAwayScore;
  // result.winner is "home" | "away" — team1 is homeTeam
  const winnerId = result.winner === "home" ? claimed.team1UserId! : claimed.team2UserId!;
  const loserId = winnerId === claimed.team1UserId ? claimed.team2UserId! : claimed.team1UserId!;

  // Write game result
  await writeGameResult(gameId, team1Score, team2Score, winnerId);

  // Determine current round
  const bracket = tournament.bracket_data as BracketStructure;
  const currentRound = claimed.round;

  // Update loser's result
  await updateTeamResult(tournamentId, loserId, "eliminated", currentRound);

  // Check if all games in this round are now complete
  const allGames = await getTournamentGames(tournamentId);
  const roundGames = allGames.filter((g) => g.round === currentRound);
  const allRoundDone = roundGames.every((g) => g.status === "completed");

  if (allRoundDone) {
    const nextRound = currentRound + 1;
    const isFinal = nextRound > bracket.totalRounds;

    if (isFinal) {
      // Tournament complete — mark winner and finalist
      const finalGame = roundGames[0]; // Only 1 game in the final round
      const finalWinnerId = finalGame.winner_id!;
      const finalLoserId = finalWinnerId === finalGame.team1_user_id
        ? finalGame.team2_user_id!
        : finalGame.team1_user_id!;

      await updateTeamResult(tournamentId, finalWinnerId, "champion", currentRound);
      await updateTeamResult(tournamentId, finalLoserId, "finalist", currentRound);
      await completeTournament(tournamentId);
    } else {
      // Advance bracket: pair round winners for next round
      const winners = roundGames.map((g) => ({
        userId: g.winner_id!,
        name: g.winner_id === g.team1_user_id ? g.team1_name! : g.team2_name!,
      }));

      // Update in_progress players' roundReached
      for (const w of winners) {
        await updateTeamResult(tournamentId, w.userId, "in_progress", nextRound);
      }

      // Pair winners: 0 vs 1, 2 vs 3, etc.
      const nextMatchups = [];
      for (let i = 0; i < winners.length; i += 2) {
        nextMatchups.push({
          matchupIndex: i / 2,
          team1UserId: winners[i].userId,
          team1Name: winners[i].name,
          team2UserId: winners[i + 1].userId,
          team2Name: winners[i + 1].name,
        });
      }
      await appendNextRound(tournamentId, nextRound, nextMatchups);
    }
  }

  return NextResponse.json({
    status: "completed",
    team1Score,
    team2Score,
    winnerId,
    events: [],
  });
}
