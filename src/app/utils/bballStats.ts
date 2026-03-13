import { Pokemon } from "../types";

export interface BballAverages {
  ppg: number; // Points Per Game
  rpg: number; // Rebounds Per Game
  apg: number; // Assists Per Game
  spg: number; // Steals Per Game
  bpg: number; // Blocks Per Game
  mpg: number; // Minutes Per Game
  per: number; // Player Efficiency Rating
}

function scale(value: number, statMax: number, outMin: number, outMax: number): number {
  const normalized = Math.min(value / statMax, 1);
  const result = outMin + normalized * (outMax - outMin);
  return Math.round(result * 10) / 10;
}

// Add some spice — pokemon weight/height influence rebounds and blocks
export function toBballAverages(pokemon: Pokemon): BballAverages {
  // Use pre-computed AI-generated stats if available
  if (pokemon.bball) {
    return { ...pokemon.bball };
  }

  const { hp, attack, defense, speed, specialAttack, specialDefense } = pokemon.stats;
  const MAX = 255;

  // PPG: Attack + SpAtk blend — pure scorers have high offensive stats
  // Weighted toward Attack (driving/finishing) with SpAtk (shooting range)
  const offensiveRaw = attack * 0.6 + specialAttack * 0.4;
  const ppg = scale(offensiveRaw, MAX, 4, 34);

  // RPG: Defense + SpDef + weight factor — defensive walls own the boards
  const weightBonus = Math.min(pokemon.weight / 1000, 0.3); // weight in hectograms
  const reboundRaw = defense * 0.55 + specialDefense * 0.45;
  const rpg = scale(reboundRaw, MAX, 1.5, 14) + weightBonus * 3;

  // APG: SpAtk + Speed — cerebral playmakers with quick reads
  const assistRaw = specialAttack * 0.55 + speed * 0.45;
  const apg = scale(assistRaw, MAX, 0.8, 11.5);

  // SPG: Speed + SpDef — quick hands and reading passing lanes
  const stealRaw = speed * 0.7 + specialDefense * 0.3;
  const spg = scale(stealRaw, MAX, 0.3, 2.8);

  // BPG: Defense + height factor — tall defensive walls
  const heightBonus = Math.min(pokemon.height / 20, 0.4); // height in decimeters
  const blockRaw = defense * 0.6 + specialDefense * 0.4;
  const bpg = scale(blockRaw, MAX, 0.1, 3.5) + heightBonus * 2;

  // MPG: HP is stamina — higher HP = more time on the floor
  const mpg = scale(hp, MAX, 18, 38);

  // PER: overall efficiency — weighted combo of all stats
  const totalStats = hp + attack + defense + speed + specialAttack + specialDefense;
  const per = scale(totalStats, 780, 8, 35);

  return {
    ppg: Math.round(ppg * 10) / 10,
    rpg: Math.round(Math.min(rpg, 15) * 10) / 10,
    apg: Math.round(apg * 10) / 10,
    spg: Math.round(Math.min(spg, 3.0) * 10) / 10,
    bpg: Math.round(Math.min(bpg, 4.5) * 10) / 10,
    mpg: Math.round(mpg * 10) / 10,
    per: Math.round(per * 10) / 10,
  };
}

// --- Salary computation (NBA CBA–inspired) ---

const SALARY_MIN = 1;   // $1M — rookie minimum
const SALARY_MAX = 44;  // $44M — supermax
export const SALARY_CAP = 175; // $160M per team of 6

// Raw score weights: scoring is king, playmaking next, defense rewarded, efficiency matters
function salaryRaw(avg: BballAverages): number {
  return (
    avg.ppg * 2.5 +
    avg.rpg * 1.5 +
    avg.apg * 2.0 +
    avg.spg * 3.0 +
    avg.bpg * 2.5 +
    avg.per * 0.8
  );
}

// Pre-computed from full 1025-pokemon dataset
const RAW_MIN = 39.2;
const RAW_MAX = 110.5;

/** Returns salary in millions ($1M–$44M) */
export function computeSalary(avg: BballAverages, pokemon?: Pokemon): number {
  // Use pre-computed salary if available
  if (pokemon?.salary !== undefined) return pokemon.salary;

  const raw = salaryRaw(avg);
  const t = Math.max(0, Math.min(1, (raw - RAW_MIN) / (RAW_MAX - RAW_MIN)));
  const salary = SALARY_MIN + t * (SALARY_MAX - SALARY_MIN);
  return Math.round(salary * 10) / 10;
}

// Fun archetype labels based on their basketball stat profile
export function getPlaystyle(avg: BballAverages, pokemon?: Pokemon): string[] {
  // Use pre-computed playstyle if available
  if (pokemon?.playstyle && pokemon.playstyle.length > 0) return pokemon.playstyle;

  const { ppg, rpg, apg, spg, bpg } = avg;

  // Fallback: derive a single label from stats
  let label: string;
  if (ppg >= 17 && apg >= 5) label = "Floor General";
  else if (ppg >= 18) label = "Scoring Machine";
  else if (rpg >= 8 && bpg >= 2.2) label = "Defensive Anchor";
  else if (ppg >= 15 && rpg >= 6) label = "Double-Double Threat";
  else if (apg >= 5) label = "Playmaker";
  else if (spg >= 1.3 && ppg >= 14) label = "Two-Way Star";
  else if (bpg >= 2.2) label = "Shot Blocker";
  else if (ppg >= 16) label = "Go-To Scorer";
  else if (rpg >= 7) label = "Glass Cleaner";
  else if (spg >= 1.2) label = "Lockdown Defender";
  else if (ppg >= 13 && rpg >= 5.5 && apg >= 3.5) label = "Swiss Army Knife";
  else if (ppg >= 14) label = "Reliable Starter";
  else if (apg >= 4) label = "Sharpshooter";
  else if (ppg >= 12 && rpg >= 5) label = "Stretch Big";
  else if (rpg >= 5.5) label = "Hustle Rebounder";
  else if (ppg >= 11) label = "Spark Plug";
  else if (bpg >= 1.8) label = "Rim Protector";
  else if (ppg < 8 && rpg < 4 && apg < 2.5) label = "Energy Guy";
  else label = "Role Player";

  return [label];
}
