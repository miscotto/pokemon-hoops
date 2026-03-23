import { db } from "./db";
import { seasonGames, seasonGameEvents, seasonTeams } from "./schema";
import { eq, and, or, inArray } from "drizzle-orm";

export interface PlayerSeasonStats {
  name: string;
  sprite: string;
  games: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  fouls: number;
  ppg: number;
  rpg: number;
  apg: number;
}

export interface GameLogEntry {
  gameId: string;
  opponent: string;
  result: "W" | "L";
  teamScore: number;
  oppScore: number;
  scheduledAt: Date;
  gameType: string;
  round: number | null;
}

export interface TeamSeasonStats {
  userId: string;
  teamName: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  result: string;
  players: PlayerSeasonStats[];
  gameLog: GameLogEntry[];
}

const SCORING_TYPES = new Set(["score_2pt", "score_3pt", "dunk", "layup", "clutch"]);

export async function getTeamSeasonStats(
  seasonId: string,
  userId: string
): Promise<TeamSeasonStats | null> {
  // 1. Load team record
  const teamRows = await db
    .select()
    .from(seasonTeams)
    .where(and(eq(seasonTeams.seasonId, seasonId), eq(seasonTeams.userId, userId)));

  const team = teamRows[0];
  if (!team) return null;

  // 2. Load all completed games for this team
  const games = await db
    .select()
    .from(seasonGames)
    .where(
      and(
        eq(seasonGames.seasonId, seasonId),
        eq(seasonGames.status, "completed"),
        or(eq(seasonGames.team1UserId, userId), eq(seasonGames.team2UserId, userId))
      )
    );

  if (games.length === 0) {
    return {
      userId,
      teamName: team.teamName,
      wins: team.wins,
      losses: team.losses,
      pointsFor: team.pointsFor,
      pointsAgainst: team.pointsAgainst,
      result: team.result,
      players: [],
      gameLog: [],
    };
  }

  const gameIds = games.map((g) => g.id);

  // 3. Load all events for those games in one query
  const events = await db
    .select()
    .from(seasonGameEvents)
    .where(inArray(seasonGameEvents.gameId, gameIds));

  // 4. Build a map of gameId → game for quick lookup
  const gameMap = new Map(games.map((g) => [g.id, g]));

  // 5. Aggregate per-player stats
  const playerStats = new Map<string, { name: string; sprite: string; games: Set<string>; points: number; rebounds: number; assists: number; steals: number; blocks: number; fouls: number }>();

  for (const ev of events) {
    const game = gameMap.get(ev.gameId);
    if (!game) continue;

    const data = ev.data as {
      type: string;
      team: "home" | "away";
      pokemonName: string;
      pokemonSprite?: string;
      pointsScored?: number;
    };

    // Determine which side this team was
    const ourSide: "home" | "away" = game.team1UserId === userId ? "home" : "away";

    // Only count events by our team
    if (data.team !== ourSide) continue;

    const name = data.pokemonName;
    if (!name || name === "Tip-off" || name === "Final") continue;

    if (!playerStats.has(name)) {
      playerStats.set(name, {
        name,
        sprite: data.pokemonSprite ?? "",
        games: new Set(),
        points: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        fouls: 0,
      });
    }

    const ps = playerStats.get(name)!;
    ps.games.add(ev.gameId);

    // Track sprite (may not be on every event)
    if (data.pokemonSprite && !ps.sprite) ps.sprite = data.pokemonSprite;

    const type = ev.type;

    if (SCORING_TYPES.has(type)) {
      ps.points += data.pointsScored ?? 0;
    } else if (type === "rebound") {
      ps.rebounds += 1;
    } else if (type === "assist") {
      ps.assists += 1;
    } else if (type === "steal") {
      ps.steals += 1;
    } else if (type === "block") {
      ps.blocks += 1;
    } else if (type === "foul" || type === "foul_out") {
      ps.fouls += 1;
    }
  }

  // 6. Convert to PlayerSeasonStats with per-game averages
  const players: PlayerSeasonStats[] = Array.from(playerStats.values())
    .map((ps) => {
      const g = Math.max(1, ps.games.size);
      return {
        name: ps.name,
        sprite: ps.sprite,
        games: ps.games.size,
        points: ps.points,
        rebounds: ps.rebounds,
        assists: ps.assists,
        steals: ps.steals,
        blocks: ps.blocks,
        fouls: ps.fouls,
        ppg: Math.round((ps.points / g) * 10) / 10,
        rpg: Math.round((ps.rebounds / g) * 10) / 10,
        apg: Math.round((ps.assists / g) * 10) / 10,
      };
    })
    .sort((a, b) => b.ppg - a.ppg);

  // 7. Build game log
  const gameLog: GameLogEntry[] = games
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
    .slice(0, 30)
    .map((g) => {
      const isHome = g.team1UserId === userId;
      const teamScore = isHome ? (g.team1Score ?? 0) : (g.team2Score ?? 0);
      const oppScore = isHome ? (g.team2Score ?? 0) : (g.team1Score ?? 0);
      const opponent = isHome ? g.team2Name : g.team1Name;
      const result: "W" | "L" = teamScore > oppScore ? "W" : "L";
      return {
        gameId: g.id,
        opponent,
        result,
        teamScore,
        oppScore,
        scheduledAt: g.scheduledAt,
        gameType: g.gameType,
        round: g.round,
      };
    });

  return {
    userId,
    teamName: team.teamName,
    wins: team.wins,
    losses: team.losses,
    pointsFor: team.pointsFor,
    pointsAgainst: team.pointsAgainst,
    result: team.result,
    players,
    gameLog,
  };
}
