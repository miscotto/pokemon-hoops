/**
 * Fetches every Pokémon from PokeAPI, computes basketball averages,
 * and writes the result to public/pokemon-bball-stats.json
 *
 * Run: npx tsx scripts/buildAllStats.ts
 */

import * as fs from "fs";
import * as path from "path";

interface PokemonStats {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
}

interface Pokemon {
  id: number;
  name: string;
  sprite: string;
  types: string[];
  stats: PokemonStats;
  height: number;
  weight: number;
}

interface BballAverages {
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  mpg: number;
  per: number;
}

interface PokemonBballEntry {
  id: number;
  name: string;
  sprite: string;
  types: string[];
  height: number;
  weight: number;
  baseStats: PokemonStats;
  bball: BballAverages;
  playstyle: string;
  salary: number;
  tag: "ball handler" | "support";
  ability?: string;
}

// --- salary computation (mirrors src/app/utils/bballStats.ts) ---

const SALARY_MIN = 1;
const SALARY_MAX = 44;
const RAW_MIN = 39.2;
const RAW_MAX = 110.5;

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

function computeSalary(avg: BballAverages): number {
  const raw = salaryRaw(avg);
  const t = Math.max(0, Math.min(1, (raw - RAW_MIN) / (RAW_MAX - RAW_MIN)));
  const salary = SALARY_MIN + t * (SALARY_MAX - SALARY_MIN);
  return Math.round(salary * 10) / 10;
}

// --- stat conversion logic (mirrors src/app/utils/bballStats.ts) ---

function scale(value: number, statMax: number, outMin: number, outMax: number): number {
  const normalized = Math.min(value / statMax, 1);
  const result = outMin + normalized * (outMax - outMin);
  return Math.round(result * 10) / 10;
}

function toBballAverages(p: Pokemon): BballAverages {
  const { hp, attack, defense, speed, specialAttack, specialDefense } = p.stats;
  const MAX = 255;

  const offensiveRaw = attack * 0.6 + specialAttack * 0.4;
  const ppg = scale(offensiveRaw, MAX, 4, 34);

  const weightBonus = Math.min(p.weight / 1000, 0.3);
  const reboundRaw = defense * 0.55 + specialDefense * 0.45;
  const rpg = scale(reboundRaw, MAX, 1.5, 14) + weightBonus * 3;

  const assistRaw = specialAttack * 0.55 + speed * 0.45;
  const apg = scale(assistRaw, MAX, 0.8, 11.5);

  const stealRaw = speed * 0.7 + specialDefense * 0.3;
  const spg = scale(stealRaw, MAX, 0.3, 2.8);

  const heightBonus = Math.min(p.height / 20, 0.4);
  const blockRaw = defense * 0.6 + specialDefense * 0.4;
  const bpg = scale(blockRaw, MAX, 0.1, 3.5) + heightBonus * 2;

  const mpg = scale(hp, MAX, 18, 38);

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

function getPlaystyle(avg: BballAverages): string {
  const { ppg, rpg, apg, spg, bpg } = avg;

  // Elite tier (top ~5%)
  if (ppg >= 17 && apg >= 5) return "Floor General";
  if (ppg >= 18) return "Scoring Machine";
  if (rpg >= 8 && bpg >= 2.2) return "Defensive Anchor";

  // Star tier (top ~15%)
  if (ppg >= 15 && rpg >= 6) return "Double-Double Threat";
  if (apg >= 5) return "Playmaker";
  if (spg >= 1.3 && ppg >= 14) return "Two-Way Star";
  if (bpg >= 2.2) return "Shot Blocker";
  if (ppg >= 16) return "Go-To Scorer";

  // Solid tier (top ~40%)
  if (rpg >= 7) return "Glass Cleaner";
  if (spg >= 1.2) return "Lockdown Defender";
  if (ppg >= 13 && rpg >= 5.5 && apg >= 3.5) return "Swiss Army Knife";
  if (ppg >= 14) return "Reliable Starter";
  if (apg >= 4) return "Sharpshooter";

  // Rotation tier
  if (ppg >= 12 && rpg >= 5) return "Stretch Big";
  if (rpg >= 5.5) return "Hustle Rebounder";
  if (ppg >= 11) return "Spark Plug";
  if (bpg >= 1.8) return "Rim Protector";

  // Bench tier
  if (ppg < 8 && rpg < 4 && apg < 2.5) return "Energy Guy";
  return "Role Player";
}

// --- support ability assignment (mirrors src/app/utils/supportAbilities.ts) ---

function getSupportAbility(id: number, stats: PokemonStats): string {
  const { hp, attack, defense, specialAttack, specialDefense, speed } = stats;
  const statValues = [hp, attack, defense, specialAttack, specialDefense, speed];
  const maxVal = Math.max(...statValues);
  const maxIdx = statValues.indexOf(maxVal);
  const variant = id % 2;

  switch (maxIdx) {
    case 0: return variant === 0 ? "Regenerator" : "Helping Hand";
    case 1: return variant === 0 ? "Intimidate" : "Pressure";
    case 2: return variant === 0 ? "Sturdy" : "Screen Cleaner";
    case 3: return variant === 0 ? "Battery" : "Telepathy";
    case 4: return variant === 0 ? "Friend Guard" : "Aroma Veil";
    case 5: return variant === 0 ? "Quick Draw" : "Prankster";
    default: return "Helping Hand";
  }
}

// --- fetching ---

const TOTAL_POKEMON = 1025;
const BATCH_SIZE = 100;

async function fetchBatch(offset: number, limit: number): Promise<Pokemon[]> {
  const listRes = await fetch(`https://pokeapi.co/api/v2/pokemon?offset=${offset}&limit=${limit}`);
  const listData = await listRes.json();

  const details = await Promise.all(
    listData.results.map(async (p: { url: string }) => {
      const res = await fetch(p.url);
      return res.json();
    })
  );

  return details.map((d: any) => ({
    id: d.id,
    name: d.name,
    sprite:
      d.sprites.other?.["official-artwork"]?.front_default ||
      d.sprites.front_default ||
      "",
    types: d.types.map((t: any) => t.type.name),
    stats: {
      hp: d.stats[0].base_stat,
      attack: d.stats[1].base_stat,
      defense: d.stats[2].base_stat,
      specialAttack: d.stats[3].base_stat,
      specialDefense: d.stats[4].base_stat,
      speed: d.stats[5].base_stat,
    },
    height: d.height,
    weight: d.weight,
  }));
}

async function main() {
  console.log(`Fetching ${TOTAL_POKEMON} Pokémon...\n`);

  const allPokemon: Pokemon[] = [];

  for (let offset = 0; offset < TOTAL_POKEMON; offset += BATCH_SIZE) {
    const limit = Math.min(BATCH_SIZE, TOTAL_POKEMON - offset);
    const batch = await fetchBatch(offset, limit);
    allPokemon.push(...batch);
    console.log(`  ✓ ${allPokemon.length} / ${TOTAL_POKEMON}`);
  }

  console.log("\nComputing basketball averages...");

  // Load position tags
  const posPath = path.join(__dirname, "..", "public", "pokemon-positions.json");
  let tagMap: Record<number, "ball handler" | "support"> = {};
  if (fs.existsSync(posPath)) {
    const posData: { id: number; position: "ball handler" | "support" }[] = JSON.parse(
      fs.readFileSync(posPath, "utf-8")
    );
    tagMap = Object.fromEntries(posData.map((p) => [p.id, p.position]));
    console.log(`  Loaded ${posData.length} position tags`);
  } else {
    console.warn("  ⚠ pokemon-positions.json not found — all Pokemon will default to 'ball handler'");
  }

  const entries: PokemonBballEntry[] = allPokemon
    .sort((a, b) => a.id - b.id)
    .map((p) => {
      const bball = toBballAverages(p);
      const tag = tagMap[p.id] || "ball handler";
      // Support Pokemon get abilities instead of traditional playstyles
      const isSupport = tag === "support";
      const ability = isSupport ? getSupportAbility(p.id, p.stats) : undefined;
      const playstyle = isSupport ? ability! : getPlaystyle(bball);
      return {
        id: p.id,
        name: p.name,
        sprite: p.sprite,
        types: p.types,
        height: p.height,
        weight: p.weight,
        baseStats: p.stats,
        bball,
        playstyle,
        salary: computeSalary(bball),
        tag,
        ...(ability ? { ability } : {}),
      };
    });

  // Print some fun leaderboards
  console.log("\n🏀 BASKETBALL LEADERBOARDS\n");

  const top = (label: string, key: keyof BballAverages, n = 10) => {
    const sorted = [...entries].sort((a, b) => b.bball[key] - a.bball[key]);
    console.log(`  ${label}:`);
    sorted.slice(0, n).forEach((e, i) => {
      console.log(`    ${i + 1}. ${e.name.padEnd(20)} ${e.bball[key]} ${key.toUpperCase()}`);
    });
    console.log();
  };

  top("🔥 Top Scorers (PPG)", "ppg");
  top("🏀 Top Rebounders (RPG)", "rpg");
  top("🎯 Top Playmakers (APG)", "apg");
  top("🤚 Top Thieves (SPG)", "spg");
  top("🚫 Top Shot Blockers (BPG)", "bpg");
  top("⭐ Best Overall (PER)", "per");

  // Salary leaderboard
  console.log("\n  💰 Highest Paid:");
  const bySalary = [...entries].sort((a, b) => b.salary - a.salary);
  bySalary.slice(0, 10).forEach((e, i) => {
    console.log(`    ${i + 1}. ${e.name.padEnd(20)} $${e.salary}M`);
  });
  console.log(`\n  Salary Cap: $100M for a team of 6`);
  console.log(`  Average salary: $${(entries.reduce((s, e) => s + e.salary, 0) / entries.length).toFixed(1)}M`);

  // Playstyle distribution
  const playstyleCounts: Record<string, number> = {};
  entries.forEach((e) => {
    playstyleCounts[e.playstyle] = (playstyleCounts[e.playstyle] || 0) + 1;
  });
  console.log("  📊 Playstyle Distribution:");
  Object.entries(playstyleCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([style, count]) => {
      console.log(`    ${style.padEnd(25)} ${count} Pokémon`);
    });

  // Write JSON
  const outPath = path.join(__dirname, "..", "public", "pokemon-bball-stats.json");
  fs.writeFileSync(outPath, JSON.stringify(entries, null, 2));
  console.log(`\n✅ Wrote ${entries.length} entries to ${outPath}`);
}

main().catch(console.error);
