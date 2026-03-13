import { Pokemon, PhysicalProfile } from "../types";
import { toBballAverages, BballAverages, computeSalary, SALARY_CAP } from "./bballStats";
import { calcTypeAdvantage } from "./typeChart";
import { computeAbilityModifier } from "./abilityModifier";
import { createGameIterator } from "../../lib/game-iterator";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TournamentPokemon {
  id: number;
  name: string;
  sprite: string;
  types: string[];
  stats: Pokemon["stats"];
  height: number;
  weight: number;
  tag?: "ball handler" | "support";
  ability?: string;
  rivals?: string[];
  allies?: string[];
  physicalProfile?: PhysicalProfile;
  bball: BballAverages;
  playstyle?: string[];
  salary?: number;
}

export type Coast = "west" | "east";
export type Side = "home" | "away";

export interface TournamentTeam {
  id: string;
  name: string;
  coast: Coast;
  seed: number;
  isPlayer: boolean;
  roster: TournamentPokemon[];
}

export type GameEventType =
  | "score_2pt" | "score_3pt" | "dunk" | "layup"
  | "block" | "steal" | "assist" | "rebound"
  | "foul" | "foul_out" | "injury"
  | "hot_hand" | "cold_streak" | "clutch" | "fatigue" | "momentum"
  | "type_advantage" | "ability_trigger" | "rivalry_clash" | "ally_boost"
  | "halftime" | "game_start" | "game_end" | "quarter_start" | "quarter_end";

export interface GameEvent {
  gameTimeSec: number;
  quarter: 1 | 2 | 3 | 4;
  clock: string;
  type: GameEventType;
  team: Side;
  pokemonName: string;
  pokemonSprite?: string;
  description: string;
  pointsScored?: number;
  statType?: "rebound" | "assist" | "steal" | "block" | "foul";
  homeScore: number;
  awayScore: number;
  displayAtMs: number; // ms from game start for client-side reveal timing
}

export interface PlayerGameStats {
  name: string;
  sprite: string;
  team: Side;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  fouls: number;
  injured: boolean;
}

export interface LiveGameResult {
  homeTeam: TournamentTeam;
  awayTeam: TournamentTeam;
  events: GameEvent[];
  finalHomeScore: number;
  finalAwayScore: number;
  winner: Side;
  mvp: { name: string; sprite: string; points: number; team: Side };
  playerStats: PlayerGameStats[];
}

export interface BracketMatchup {
  id: string;
  round: number;
  conference: "west" | "east" | "finals";
  homeTeam: TournamentTeam | null;
  awayTeam: TournamentTeam | null;
  result: LiveGameResult | null;
  winner: TournamentTeam | null;
}

export interface TournamentBracketData {
  westTeams: TournamentTeam[];
  eastTeams: TournamentTeam[];
  matchups: BracketMatchup[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

// NBA-style: 4 quarters × 12 minutes = 48 minutes (2880 game seconds)
const GAME_DURATION = 2880;

const WEST_TEAM_NAMES = [
  "LA Flamethrowers", "Bay Area Currents", "Pacific Dragonites",
  "Sunset Strikers", "Golden Coast Blazers", "Cascade Crushers",
  "Desert Stormers", "Coastal Clefables",
];
const EAST_TEAM_NAMES = [
  "NY Thunderbolts", "Gotham Gengar", "Atlantic Titans",
  "Midnight Mewtwo", "Harbor Hawks", "Metro Machamps",
  "Frost Bite Force", "Harbor Hydreigons",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── AI Opponent Generation ──────────────────────────────────────────────────

export function generateAITeam(
  allPokemon: TournamentPokemon[],
  usedIds: Set<number>,
  coast: Coast,
  seed: number,
  usedNames: Set<string>,
): TournamentTeam {
  const available = allPokemon.filter(p => !usedIds.has(p.id) && p.tag !== "support");
  const namePool = coast === "west" ? WEST_TEAM_NAMES : EAST_TEAM_NAMES;
  const freeNames = namePool.filter(n => !usedNames.has(n));
  const name = freeNames.length > 0 ? pick(freeNames) : `${coast === "west" ? "West" : "East"} Team ${seed}`;

  // Higher seeds get less random boost (weaker teams)
  const randomFactor = seed === 1 ? 30 : seed === 2 ? 25 : seed === 3 ? 18 : 12;

  const scored = available.map(p => {
    const b = p.bball;
    const score = b.ppg * 2.5 + b.rpg * 1.2 + b.apg * 1.8 + b.spg * 2.0 + b.bpg * 1.5 + b.per * 1.0 + Math.random() * randomFactor;
    return { pokemon: p, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const roster: TournamentPokemon[] = [];
  const localUsed = new Set<number>();
  let totalSalary = 0;

  for (const { pokemon } of scored) {
    if (localUsed.has(pokemon.id)) continue;
    const salary = computeSalary(pokemon.bball);
    if (totalSalary + salary > SALARY_CAP) continue;
    roster.push(pokemon);
    localUsed.add(pokemon.id);
    totalSalary += salary;
    if (roster.length === 6) break;
  }

  // Fill if needed
  if (roster.length < 6) {
    const remaining = scored
      .filter(({ pokemon }) => !localUsed.has(pokemon.id))
      .sort((a, b) => computeSalary(a.pokemon.bball) - computeSalary(b.pokemon.bball));
    for (const { pokemon } of remaining) {
      if (roster.length >= 6) break;
      roster.push(pokemon);
      localUsed.add(pokemon.id);
    }
  }

  // Mark IDs as used globally
  for (const p of roster) usedIds.add(p.id);

  return { id: `ai-${coast}-${seed}`, name, coast, seed, isPlayer: false, roster };
}

// ─── Tournament Bracket Generation ──────────────────────────────────────────

export function generateTournamentBracket(
  playerTeam: TournamentTeam,
  allPokemon: TournamentPokemon[],
): TournamentBracketData {
  const usedIds = new Set(playerTeam.roster.map(p => p.id));
  const usedNames = new Set([playerTeam.name]);

  const westTeams: TournamentTeam[] = [];
  const eastTeams: TournamentTeam[] = [];

  if (playerTeam.coast === "west") {
    westTeams.push({ ...playerTeam, seed: 1 });
    for (let seed = 2; seed <= 4; seed++) {
      const team = generateAITeam(allPokemon, usedIds, "west", seed, usedNames);
      usedNames.add(team.name);
      westTeams.push(team);
    }
    for (let seed = 1; seed <= 4; seed++) {
      const team = generateAITeam(allPokemon, usedIds, "east", seed, usedNames);
      usedNames.add(team.name);
      eastTeams.push(team);
    }
  } else {
    eastTeams.push({ ...playerTeam, seed: 1 });
    for (let seed = 2; seed <= 4; seed++) {
      const team = generateAITeam(allPokemon, usedIds, "east", seed, usedNames);
      usedNames.add(team.name);
      eastTeams.push(team);
    }
    for (let seed = 1; seed <= 4; seed++) {
      const team = generateAITeam(allPokemon, usedIds, "west", seed, usedNames);
      usedNames.add(team.name);
      westTeams.push(team);
    }
  }

  const matchups: BracketMatchup[] = [
    // Round 1: 1v4, 2v3 each conference
    { id: "west-r1-g1", round: 1, conference: "west", homeTeam: westTeams[0], awayTeam: westTeams[3], result: null, winner: null },
    { id: "west-r1-g2", round: 1, conference: "west", homeTeam: westTeams[1], awayTeam: westTeams[2], result: null, winner: null },
    { id: "east-r1-g1", round: 1, conference: "east", homeTeam: eastTeams[0], awayTeam: eastTeams[3], result: null, winner: null },
    { id: "east-r1-g2", round: 1, conference: "east", homeTeam: eastTeams[1], awayTeam: eastTeams[2], result: null, winner: null },
    // Round 2: Conference Finals (teams TBD)
    { id: "west-r2", round: 2, conference: "west", homeTeam: null, awayTeam: null, result: null, winner: null },
    { id: "east-r2", round: 2, conference: "east", homeTeam: null, awayTeam: null, result: null, winner: null },
    // Round 3: Championship (teams TBD)
    { id: "finals", round: 3, conference: "finals", homeTeam: null, awayTeam: null, result: null, winner: null },
  ];

  return { westTeams, eastTeams, matchups };
}

// ─── Team Factors (MDX formula) ─────────────────────────────────────────────

interface TeamFactors {
  teamBaseScore: number;
  headToHeadMatchup: number;
  clutchFatigue: number;
  abilityModifier: number;
  finalRating: number;
  foulOutInjuryChance: number;
}

export function calculateTeamFactors(
  team: TournamentTeam,
  opponent: TournamentTeam,
  score: { home: number; away: number },
  gameTimeSec: number,
  teamSide: Side,
): TeamFactors {
  const roster = team.roster;

  // 1. Team Base Score (0-100)
  const totals = roster.reduce((acc, p) => ({
    ppg: acc.ppg + p.bball.ppg, rpg: acc.rpg + p.bball.rpg,
    apg: acc.apg + p.bball.apg, spg: acc.spg + p.bball.spg,
    bpg: acc.bpg + p.bball.bpg, per: acc.per + p.bball.per,
  }), { ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, per: 0 });

  const n = roster.length || 1;
  const teamBaseScore = Math.min(100,
    ((totals.ppg / n) * 2.5 + (totals.rpg / n) * 1.2 + (totals.apg / n) * 1.8 +
     (totals.spg / n) * 2.0 + (totals.bpg / n) * 1.5 + (totals.per / n) * 1.0) / 80 * 100
  );

  // 2. Head-to-Head (type advantage + rivalry/ally)
  const teamTypes = roster.map(p => p.types);
  const oppTypes = opponent.roster.map(p => p.types);
  const typeAdv = calcTypeAdvantage(teamTypes, oppTypes) - calcTypeAdvantage(oppTypes, teamTypes);

  let rivalryBonus = 0;
  let allyBonus = 0;
  for (const p of roster) {
    if (p.rivals?.some(r => opponent.roster.some(o => o.name === r))) rivalryBonus += 2;
    if (p.allies?.some(a => roster.some(o => o.name === a))) allyBonus += 1;
  }

  const headToHeadMatchup = typeAdv * 1.5 + rivalryBonus + allyBonus;

  // 3. Clutch & Fatigue
  const myScore = teamSide === "home" ? score.home : score.away;
  const oppScore = teamSide === "home" ? score.away : score.home;
  const isClutchTime = gameTimeSec > GAME_DURATION * 0.9 && Math.abs(myScore - oppScore) <= 8;
  const fatigueFactor = gameTimeSec / GAME_DURATION;
  const clutchFatigue = isClutchTime ? 5 : -fatigueFactor * 2;

  // 4. Injury chance rises late
  const foulOutInjuryChance = 0.05 + (gameTimeSec > GAME_DURATION * 0.7 ? 0.03 : 0);

  const abilityModifier = computeAbilityModifier(
    roster.map(p => p.ability ?? ""),
    opponent.roster.map(p => p.ability ?? ""),
  );

  const finalRating = teamBaseScore + headToHeadMatchup + clutchFatigue + abilityModifier;

  return { teamBaseScore, headToHeadMatchup, clutchFatigue, abilityModifier, finalRating, foulOutInjuryChance };
}

// ─── Main Simulation ─────────────────────────────────────────────────────────

export function simulateMatchup(
  homeTeam: TournamentTeam,
  awayTeam: TournamentTeam,
): LiveGameResult {
  const iterator = createGameIterator(homeTeam, awayTeam);
  const events: GameEvent[] = [];
  const playerStatsMap = new Map<string, PlayerGameStats>();

  // Seed player stat entries
  for (const p of homeTeam.roster) {
    playerStatsMap.set(`home-${p.name}`, {
      name: p.name, sprite: p.sprite, team: "home",
      points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, fouls: 0, injured: false,
    });
  }
  for (const p of awayTeam.roster) {
    playerStatsMap.set(`away-${p.name}`, {
      name: p.name, sprite: p.sprite, team: "away",
      points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, fouls: 0, injured: false,
    });
  }

  // Drain iterator
  let cursor = 0;
  let ev = iterator.next();
  while (ev !== null) {
    // Cap displayAtMs: game_end always at 300_000, others at most 299_000
    const displayAtMs = ev.type === "game_end" ? 300_000 : Math.min(cursor, 299_000);
    const gameEvent: GameEvent = {
      gameTimeSec: ev.gameTimeSec,
      quarter: ev.quarter,
      clock: ev.clock,
      type: ev.type,
      team: ev.team,
      pokemonName: ev.pokemonName,
      pokemonSprite: ev.pokemonSprite,
      description: ev.description,
      pointsScored: ev.pointsScored,
      statType: ev.statType,
      homeScore: ev.homeScore,
      awayScore: ev.awayScore,
      displayAtMs,
    };
    cursor = Math.min(cursor + ev.sleepMs, 299_000);
    events.push(gameEvent);

    // Accumulate player stats
    const side = ev.team;
    const pKey = `${side}-${ev.pokemonName}`;
    const ps = playerStatsMap.get(pKey);
    if (ps && ev.pointsScored) ps.points += ev.pointsScored;
    if (ps && ev.statType === "rebound") ps.rebounds++;
    if (ps && ev.statType === "assist") ps.assists++;
    if (ps && ev.statType === "steal") ps.steals++;
    if (ps && ev.statType === "block") ps.blocks++;
    if (ps && (ev.statType === "foul" || ev.type === "foul_out")) {
      ps.fouls++;
      if (ev.type === "foul_out") ps.injured = true;
    }
    if (ps && ev.type === "injury") ps.injured = true;

    ev = iterator.next();
  }

  const finalEvent = events[events.length - 1];
  const winner: Side = finalEvent.homeScore > finalEvent.awayScore ? "home" : "away";
  const playerStats = Array.from(playerStatsMap.values());

  // MVP — highest points
  let mvp = { name: "None", sprite: "", points: 0, team: "home" as Side };
  for (const ps of playerStats) {
    if (ps.points > mvp.points) {
      mvp = { name: ps.name, sprite: ps.sprite, points: ps.points, team: ps.team };
    }
  }

  return {
    homeTeam, awayTeam, events,
    finalHomeScore: finalEvent.homeScore,
    finalAwayScore: finalEvent.awayScore,
    winner, mvp, playerStats,
  };
}

// ─── Utility Functions ───────────────────────────────────────────────────────

export function toTournamentPokemon(p: {
  id: number; name: string; sprite: string; types: string[];
  stats: Pokemon["stats"]; height: number; weight: number;
  tag?: "ball handler" | "support"; ability?: string;
  bball?: Pokemon["bball"]; playstyle?: string[]; salary?: number;
  rivals?: string[]; allies?: string[]; physicalProfile?: PhysicalProfile;
}): TournamentPokemon {
  const pokemon: Pokemon = {
    id: p.id, name: p.name, sprite: p.sprite, types: p.types,
    stats: p.stats, height: p.height, weight: p.weight,
    tag: p.tag, bball: p.bball, playstyle: p.playstyle, salary: p.salary,
  };
  return {
    ...pokemon,
    ability: p.ability,
    bball: toBballAverages(pokemon),
    rivals: p.rivals,
    allies: p.allies,
    physicalProfile: p.physicalProfile,
  };
}

// ─── Bracket Advancement Helpers ─────────────────────────────────────────────

export function advanceBracket(matchups: BracketMatchup[]): BracketMatchup[] {
  const updated = matchups.map(m => ({ ...m }));

  // Check Round 1 → Round 2
  const wr1g1 = updated.find(m => m.id === "west-r1-g1");
  const wr1g2 = updated.find(m => m.id === "west-r1-g2");
  const wr2 = updated.find(m => m.id === "west-r2");
  if (wr1g1?.winner && wr1g2?.winner && wr2 && !wr2.homeTeam) {
    wr2.homeTeam = wr1g1.winner;
    wr2.awayTeam = wr1g2.winner;
  }

  const er1g1 = updated.find(m => m.id === "east-r1-g1");
  const er1g2 = updated.find(m => m.id === "east-r1-g2");
  const er2 = updated.find(m => m.id === "east-r2");
  if (er1g1?.winner && er1g2?.winner && er2 && !er2.homeTeam) {
    er2.homeTeam = er1g1.winner;
    er2.awayTeam = er1g2.winner;
  }

  // Check Round 2 → Finals
  const finals = updated.find(m => m.id === "finals");
  if (wr2?.winner && er2?.winner && finals && !finals.homeTeam) {
    finals.homeTeam = wr2.winner;
    finals.awayTeam = er2.winner;
  }

  return updated;
}

export function isMatchupPlayable(matchup: BracketMatchup): boolean {
  return matchup.homeTeam !== null && matchup.awayTeam !== null && matchup.result === null;
}

export function isTournamentComplete(matchups: BracketMatchup[]): boolean {
  return matchups.find(m => m.id === "finals")?.winner !== null;
}

// ─── Live Tournament (Server-Side Full Simulation) ──────────────────────────

export interface SerializedMatchup {
  id: string;
  round: number;
  conference: "west" | "east" | "finals";
  homeTeam: TournamentTeam;
  awayTeam: TournamentTeam;
  events: GameEvent[];
  playerStats: PlayerGameStats[];
  finalHomeScore: number;
  finalAwayScore: number;
  winner: Side;
  winnerTeam: TournamentTeam;
  startsAtOffset: number; // seconds from tournament start
}

/**
 * Run a single-elimination conference bracket for any number of teams.
 * Top seeds get byes when team count is odd.
 * Returns all matchups and the conference winner.
 */
function simulateConferenceRounds(
  teams: TournamentTeam[], // sorted by seed, index 0 = best seed
  conference: "west" | "east",
  roundStart: number,
  timeStart: number,
): { matchups: SerializedMatchup[]; winner: TournamentTeam; finalRound: number; finalOffset: number } {
  const toSerialized = (
    id: string, round: number, conf: "west" | "east" | "finals",
    r: LiveGameResult, offset: number,
  ): SerializedMatchup => ({
    id, round, conference: conf,
    homeTeam: r.homeTeam, awayTeam: r.awayTeam,
    events: r.events, playerStats: r.playerStats,
    finalHomeScore: r.finalHomeScore, finalAwayScore: r.finalAwayScore,
    winner: r.winner, winnerTeam: r.winner === "home" ? r.homeTeam : r.awayTeam,
    startsAtOffset: offset,
  });

  let currentTeams = [...teams];
  const allMatchups: SerializedMatchup[] = [];
  let round = roundStart;
  let timeOffset = timeStart;

  while (currentTeams.length > 1) {
    const hasBye = currentTeams.length % 2 !== 0;
    const byeTeam = hasBye ? currentTeams[0] : null; // best seed gets bye
    const playing = hasBye ? currentTeams.slice(1) : currentTeams;
    const roundWinners: TournamentTeam[] = byeTeam ? [byeTeam] : [];
    const half = playing.length / 2;

    for (let i = 0; i < half; i++) {
      const home = playing[i];
      const away = playing[playing.length - 1 - i];
      const result = simulateMatchup(home, away);
      const winner = result.winner === "home" ? home : away;
      const gameId = `${conference}-r${round}-g${i + 1}`;
      allMatchups.push(toSerialized(gameId, round, conference, result, timeOffset));
      roundWinners.push(winner);
    }

    currentTeams = roundWinners;
    round++;
    timeOffset += 300 + 15; // LIVE_GAME_REAL_SECONDS + LIVE_ROUND_BUFFER
  }

  return {
    matchups: allMatchups,
    winner: currentTeams[0],
    finalRound: round - 1,
    finalOffset: timeOffset - 300 - 15, // LIVE_GAME_REAL_SECONDS + LIVE_ROUND_BUFFER
  };
}

/**
 * Simulate a bracket for any even team count >= 2.
 * Splits teams into west/east conferences and runs single-elimination,
 * then a championship finals.
 */
export function simulateBracketForSize(
  westTeams: TournamentTeam[],
  eastTeams: TournamentTeam[],
  maxTeams: number,
): SerializedMatchup[] {
  const toSerialized = (
    id: string, round: number, conf: "west" | "east" | "finals",
    r: LiveGameResult, offset: number,
  ): SerializedMatchup => ({
    id, round, conference: conf,
    homeTeam: r.homeTeam, awayTeam: r.awayTeam,
    events: r.events, playerStats: r.playerStats,
    finalHomeScore: r.finalHomeScore, finalAwayScore: r.finalAwayScore,
    winner: r.winner, winnerTeam: r.winner === "home" ? r.homeTeam : r.awayTeam,
    startsAtOffset: offset,
  });

  // 2-team: single championship game
  if (maxTeams === 2) {
    const home = westTeams[0] ?? eastTeams[0];
    const away = eastTeams[0] ?? westTeams[1];
    const result = simulateMatchup(home, away);
    return [toSerialized("finals", 1, "finals", result, 0)];
  }

  const west = simulateConferenceRounds(westTeams, "west", 1, 0);
  const east = simulateConferenceRounds(eastTeams, "east", 1, 0);

  const finalsOffset =
    Math.max(west.finalOffset, east.finalOffset) + 300 + 15; // LIVE_GAME_REAL_SECONDS + LIVE_ROUND_BUFFER
  const finalsRound = Math.max(west.finalRound, east.finalRound) + 1;

  const finalsResult = simulateMatchup(west.winner, east.winner);
  const finalsMatchup = toSerialized("finals", finalsRound, "finals", finalsResult, finalsOffset);

  return [...west.matchups, ...east.matchups, finalsMatchup];
}

