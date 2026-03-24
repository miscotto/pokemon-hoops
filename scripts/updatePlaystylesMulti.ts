/**
 * Reads pokemon-bball-stats-augmented.json, recomputes each Pokémon's
 * playstyle as a string[] (up to 3 archetypes when scores are within 10%
 * of the top), assigns balanced salaries, and writes the result back.
 *
 * Run: npx tsx scripts/updatePlaystylesMulti.ts
 */

import * as fs from "fs";
import * as path from "path";

type Pokemon = {
  id: number;
  name: string;
  salary?: number;
  playstyle?: string[];
  tag?: string;
  bball: {
    ppg: number;
    rpg: number;
    apg: number;
    spg: number;
    bpg: number;
    mpg: number;
    per: number;
  };
  physicalProfile?: {
    sizeAndReach: number;
    speedAndAgility: number;
    jumpingAbility: number;
    coordination: number;
    stamina: number;
    balance: number;
    strength: number;
  };
  baseStats?: {
    hp: number;
    attack: number;
    defense: number;
    specialAttack: number;
    specialDefense: number;
    speed: number;
  };
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function getLegendaryStatus(pokemon: Pokemon): "legendary" | "mythical" | "ultraBeast" | "normal" {
  const name = pokemon.name.toLowerCase();

  const mythicals = new Set([
    "mew", "celebi", "jirachi", "deoxys", "phione", "manaphy", "darkrai",
    "shaymin", "arceus", "victini", "keldeo", "meloetta", "genesect",
    "diancie", "hoopa", "volcanion", "magearna", "marshadow", "zeraora",
    "meltan", "melmetal", "zarude", "pecharunt"
  ]);

  const legendaries = new Set([
    "articuno", "zapdos", "moltres", "mewtwo",
    "raikou", "entei", "suicune", "lugia", "ho-oh",
    "regirock", "regice", "registeel", "latias", "latios",
    "kyogre", "groudon", "rayquaza",
    "uxie", "mesprit", "azelf", "dialga", "palkia", "heatran", "regigigas",
    "giratina", "cresselia",
    "cobalion", "terrakion", "virizion", "tornadus", "thundurus", "reshiram",
    "zekrom", "landorus", "kyurem",
    "xerneas", "yveltal", "zygarde",
    "type: null", "silvally", "tapu koko", "tapu lele", "tapu bulu", "tapu fini",
    "cosmog", "cosmoem", "solgaleo", "lunala", "necrozma",
    "zacian", "zamazenta", "eternatus", "kubfu", "urshifu", "regieleki",
    "regidrago", "glastrier", "spectrier", "calyrex",
    "wo-chien", "chien-pao", "ting-lu", "chi-yu", "koraidon", "miraidon",
    "okidogi", "munkidori", "fezandipiti", "ogerpon", "terapagos"
  ]);

  const ultraBeasts = new Set([
    "nihilego", "buzzwole", "pheromosa", "xurkitree", "celesteela",
    "kartana", "guzzlord", "poipole", "naganadel", "stakataka", "blacephalon"
  ]);

  if (mythicals.has(name)) return "mythical";
  if (legendaries.has(name)) return "legendary";
  if (ultraBeasts.has(name)) return "ultraBeast";
  return "normal";
}

function defaultPhysical() {
  return {
    sizeAndReach: 50,
    speedAndAgility: 50,
    jumpingAbility: 50,
    coordination: 50,
    stamina: 50,
    balance: 50,
    strength: 50,
  };
}

function defaultBaseStats() {
  return {
    hp: 50,
    attack: 50,
    defense: 50,
    specialAttack: 50,
    specialDefense: 50,
    speed: 50,
  };
}

// ── Salary Logic ─────────────────────────────────────────────────────────────

function getValueScore(pokemon: Pokemon): number {
  const b = pokemon.bball;
  const p = pokemon.physicalProfile ?? defaultPhysical();
  const s = pokemon.baseStats ?? defaultBaseStats();

  const scoring =
    b.ppg * 2.3 +
    b.per * 1.8 +
    s.attack * 0.10 +
    s.specialAttack * 0.16 +
    p.coordination * 0.14;

  const playmaking =
    b.apg * 3.0 +
    p.coordination * 0.22 +
    p.balance * 0.10 +
    s.speed * 0.08;

  const defense =
    b.spg * 3.4 +
    b.bpg * 3.8 +
    s.defense * 0.16 +
    s.specialDefense * 0.10 +
    p.balance * 0.12 +
    p.stamina * 0.10;

  const rebounding =
    b.rpg * 2.2 +
    p.sizeAndReach * 0.18 +
    p.strength * 0.14 +
    p.jumpingAbility * 0.12;

  const athleticism =
    p.speedAndAgility * 0.18 +
    p.jumpingAbility * 0.12 +
    s.speed * 0.12 +
    p.stamina * 0.10;

  const minutesValue = b.mpg * 0.7;

  const lowSecondaryImpactPenalty =
    b.ppg >= 18 && b.apg < 2.5 && b.rpg < 4 && b.spg < 1 && b.bpg < 0.8 ? 6 : 0;

  return (
    scoring +
    playmaking +
    defense +
    rebounding +
    athleticism +
    minutesValue -
    lowSecondaryImpactPenalty
  );
}

function getPercentileRank(sortedAscending: number[], value: number): number {
  let idx = sortedAscending.findIndex((v) => v >= value);
  if (idx === -1) idx = sortedAscending.length - 1;
  if (sortedAscending.length <= 1) return 1;
  return idx / (sortedAscending.length - 1);
}

function percentileOfSorted(sortedAscending: number[], p: number): number {
  if (sortedAscending.length === 0) return 0;
  if (sortedAscending.length === 1) return sortedAscending[0];

  const clampedP = clamp(p, 0, 1);
  const index = clampedP * (sortedAscending.length - 1);
  const lo = Math.floor(index);
  const hi = Math.ceil(index);

  if (lo === hi) return sortedAscending[lo];

  const t = index - lo;
  return lerp(sortedAscending[lo], sortedAscending[hi], t);
}

function getSalaryMultiplier(pokemon: Pokemon): number {
  const b = pokemon.bball;
  const p = pokemon.physicalProfile ?? defaultPhysical();
  const s = pokemon.baseStats ?? defaultBaseStats();

  const creationScore =
    b.apg * 8 + p.coordination + p.balance + s.speed + s.specialAttack;
  const defenseScore =
    b.spg * 15 + b.bpg * 15 + s.defense + s.specialDefense + p.stamina;
  const sizeScore = p.sizeAndReach + p.strength + s.hp + s.defense;

  let mult = 1.0;

  if (b.apg >= 5 && b.per >= 22) mult += 0.05;
  if (creationScore >= 290) mult += 0.04;
  if (b.per >= 24 && defenseScore >= 140) mult += 0.04;
  if (b.rpg >= 8 && (b.bpg >= 1.8 || sizeScore >= 300)) mult += 0.03;

  const rarity = getLegendaryStatus(pokemon);
  if (rarity === "legendary") mult += 0.08;
  if (rarity === "mythical") mult += 0.10;
  if (rarity === "ultraBeast") mult += 0.06;
  if (rarity !== "normal" && (b.per >= 24 || b.ppg >= 22)) mult += 0.03;

  if (b.mpg <= 12 && b.per <= 10) mult -= 0.10;
  if (b.ppg <= 4 && b.apg <= 1.5 && b.rpg <= 2) mult -= 0.05;

  return clamp(mult, 0.85, 1.25);
}

function baseSalaryFromPercentile(percentile: number): number {
  if (percentile < 0.10) return lerp(1, 3, percentile / 0.10);
  if (percentile < 0.25) return lerp(3, 7, (percentile - 0.10) / 0.15);
  if (percentile < 0.45) return lerp(7, 14, (percentile - 0.25) / 0.20);
  if (percentile < 0.65) return lerp(14, 22, (percentile - 0.45) / 0.20);
  if (percentile < 0.82) return lerp(22, 30, (percentile - 0.65) / 0.17);
  if (percentile < 0.93) return lerp(30, 36, (percentile - 0.82) / 0.11);
  return lerp(36, 40, (percentile - 0.93) / 0.07);
}

function applySalarySanityRules(pokemon: Pokemon, salary: number): number {
  const b = pokemon.bball;
  const p = pokemon.physicalProfile ?? defaultPhysical();
  const s = pokemon.baseStats ?? defaultBaseStats();

  let adjusted = salary;
  const rarity = getLegendaryStatus(pokemon);

  if (b.ppg >= 24 || b.per >= 28) adjusted = Math.max(adjusted, 30);
  if (b.ppg >= 28 || b.per >= 32) adjusted = Math.max(adjusted, 35);
  if (b.apg >= 6 && b.per >= 24) adjusted = Math.max(adjusted, 31);
  if (b.rpg >= 9 && b.bpg >= 2) adjusted = Math.max(adjusted, 28);

  if (rarity === "ultraBeast") adjusted = Math.max(adjusted, 12);

  if (rarity === "legendary") {
    adjusted = Math.max(adjusted, 16);
    if (b.per >= 20 || b.ppg >= 16) adjusted = Math.max(adjusted, 22);
    if (b.per >= 24 || b.ppg >= 22) adjusted = Math.max(adjusted, 28);
  }

  if (rarity === "mythical") {
    adjusted = Math.max(adjusted, 18);
    if (b.per >= 20 || b.ppg >= 16) adjusted = Math.max(adjusted, 24);
    if (b.per >= 24 || b.ppg >= 22) adjusted = Math.max(adjusted, 30);
  }

  if (rarity === "normal") {
    if (b.mpg <= 12 && b.per <= 10) adjusted = Math.min(adjusted, 4);
    if (b.ppg <= 3 && b.apg <= 1 && b.rpg <= 1.5) adjusted = Math.min(adjusted, 3);
  }

  const weakProfile =
    s.hp < 50 &&
    s.attack < 60 &&
    s.defense < 60 &&
    s.specialAttack < 60 &&
    s.specialDefense < 60 &&
    s.speed < 70 &&
    p.sizeAndReach < 35 &&
    p.speedAndAgility < 60;

  if (weakProfile && rarity === "normal") adjusted = Math.min(adjusted, 6);

  return clamp(adjusted, 1, 40);
}

function assignBalancedSalaries(pokemonList: Pokemon[]) {
  const withValue = pokemonList.map((pokemon) => {
    const rawValue = getValueScore(pokemon);
    const adjustedValue = rawValue * getSalaryMultiplier(pokemon);
    return { pokemon, rawValue, adjustedValue };
  });

  const sortedValues = withValue.map((x) => x.adjustedValue).sort((a, b) => a - b);

  const p75 = percentileOfSorted(sortedValues, 0.75);
  const p90 = percentileOfSorted(sortedValues, 0.90);
  const p97 = percentileOfSorted(sortedValues, 0.97);

  return withValue.map(({ pokemon, adjustedValue }) => {
    const percentile = getPercentileRank(sortedValues, adjustedValue);

    let salary = baseSalaryFromPercentile(percentile);

    if (adjustedValue >= p97) salary += 2.5;
    else if (adjustedValue >= p90) salary += 1.5;
    else if (adjustedValue >= p75) salary += 0.5;

    salary = applySalarySanityRules(pokemon, salary);
    salary = roundToTenth(salary);

    pokemon.salary = salary;
    return pokemon;
  });
}

// ── Playstyle Logic ──────────────────────────────────────────────────────────

/**
 * Returns 1–3 playstyle archetypes for a Pokémon.
 * Secondary archetypes are included when their score is within 10% of the top.
 */
function definePlayStyles(pokemon: Pokemon): string[] {
  const b = pokemon.bball;
  const p = pokemon.physicalProfile ?? defaultPhysical();
  const s = pokemon.baseStats ?? defaultBaseStats();

  const size = (p.sizeAndReach + p.strength + s.hp + s.defense) / 4;
  const mobility = (p.speedAndAgility + p.jumpingAbility + s.speed) / 3;
  const skill = (p.coordination + p.balance + s.specialAttack) / 3;
  const interiorDefense = (p.sizeAndReach + p.jumpingAbility + s.defense + b.bpg * 15) / 4;
  const perimeterDefense = (p.speedAndAgility + p.balance + p.stamina + b.spg * 20) / 4;
  const rebounding = (p.sizeAndReach + p.strength + p.jumpingAbility + b.rpg * 8) / 4;
  const creation = (p.coordination + p.balance + s.speed + s.specialAttack + b.apg * 10) / 5;
  const scoring = (s.attack + s.specialAttack + mobility + b.ppg * 4 + b.per * 2) / 5;
  const motor = (p.stamina + p.speedAndAgility + b.mpg) / 3;

  // Design rules (composite variable ranges from real data):
  //   scoring: p50=47.6, p75=61.8, max=108.6
  //   creation: p50=49.6, p75=63, max=105.8
  //   interiorDefense: p50=36.9, p75=49.3, max=89.4
  //   perimeterDefense: p50=42.5, p75=53.8, max=77.5
  //   rebounding: p50=34.5, p75=51.3, max=91.3
  //   motor: p50=40, p75=51.7, max=72.3
  //   size: p50=57.5, max=115.8  |  skill: p50=56.7, max=113
  //   mobility: p50=51, max=110.3
  //
  // DESIGN: "Reliable Starter" is the default at p50≈103.5.
  // All other archetypes score BELOW 103.5 at median stats but clearly ABOVE
  // for Pokémon that are strong in their specialist dimension.
  //
  // p50 stat values:
  //   scoring=47.6, creation=49.6, skill=56.7, mobility=51, motor=40
  //   interiorDefense=36.9, perimeterDefense=42.5, rebounding=34.5
  //   size=57.5 | ppg=2, rpg=1, apg=1, spg=0.2, bpg=0.2, mpg=10
  const archetypes = [
    // ── DEFAULT: wins for all-around average Pokémon ──────────────────────
    { name: "Reliable Starter",
      score: motor * 1.2 + (creation + scoring) * 0.5 + rebounding * 0.2 },
    // p50≈103.5. Replaces skill with rebounding so defensive specialists can escape this bucket.

    // ── Versatile elite (need high creation+scoring+ppg together) ─────────
    { name: "Offensive Hub",
      score: (creation * scoring) / 60 + b.apg * 4 + b.ppg * 4 },
    // p50≈57. Product gate (divisor 60): wins when BOTH creation AND scoring ≥70.

    { name: "Point Forward",
      score: creation * 1.6 + size * 0.5 - mobility * 1.2 + rebounding * 0.4 },
    // p50≈61. Wins for large-bodied playmakers; strong mobility penalty blocks fast players.

    { name: "Shot Creator",
      score: (scoring * mobility) / 60 + b.ppg * 5 + skill * 0.1 },
    // p50≈58. Tighter product gate: wins when scoring≥65 AND mobility≥65 AND ppg≥10.

    { name: "Swiss Army Knife",
      score: perimeterDefense * 1.5 + interiorDefense * 1.5 + rebounding * 1.0
             - creation * 0.8 - scoring * 0.7 - motor * 0.3 },
    // p50≈69. Wins when perimDef+intDef BOTH ≥60 — the all-defense no-offense player.

    // ── Scoring specialists (need scoring ≥ p75 OR high ppg) ──────────────
    { name: "Scoring Machine",
      score: scoring * 2.0 + b.ppg * 6 - creation * 1.0 - mobility * 0.8 },
    // p50≈-16. Wins for dominant scorers with high ppg AND low creation/mobility.

    { name: "Go-To Scorer",
      score: scoring * 2.0 + mobility * 0.5 - creation * 1.2 + b.ppg * 3 },
    // p50≈67. Wins for mobile-first scorers (scoring≥65 and ppg≥12).

    { name: "Primary Scorer",
      score: scoring * 1.4 + b.ppg * 5 - rebounding * 0.5 - creation * 0.3 },
    // p50≈44. Wins for volume scorers with low rebounding.

    { name: "Sharpshooter",
      score: skill * 1.5 + scoring * 0.5 - size * 0.8 - rebounding * 0.4 + b.ppg * 2 },
    // p50≈53. Wins for small skilled Pokémon who score but don't rebound.

    // ── PG / Creation specialists (need creation ≥ p75 + high apg) ────────
    { name: "Playmaker",
      score: b.apg * 30 + scoring * 0.5 - motor * 0.3 },
    // p50≈42. APG-first: wins for apg≥4 scorer-playmakers; motor penalty blocks high-energy players.

    { name: "Floor General",
      score: b.apg * 40 - scoring * 0.5 - motor * 0.5 },
    // p50≈-4. Wins for apg≥5 pure passers with low scoring and low motor (chess-move player).

    // ── Wing / versatile (need perimDef or mobility above p75) ───────────
    { name: "Two-Way Star",
      score: perimeterDefense * 1.2 + scoring * 0.7 + b.spg * 10 },
    // p50≈86. Wins for scoring-defensive wings (perimDef≥58 + spg≥1.0 + decent scoring).

    { name: "3-and-D Wing",
      score: perimeterDefense * 1.2 + skill * 0.7 + b.spg * 8 - size * 0.5 + b.ppg * 1.5 },
    // p50≈67. Wins for skilled perimeter defenders (not big bodies).

    { name: "Slasher",
      score: mobility * 1.5 - size * 0.5 - rebounding * 0.3 + scoring * 0.5 + b.ppg * 1.5 },
    // p50≈64. Wins for fast, small, mobile Pokémon.

    // ── Perimeter defense specialists (need perimDef ≥ p75 + spg) ─────────
    { name: "Lockdown Defender",
      score: perimeterDefense * 2.0 - scoring * 0.8 + b.spg * 12 - creation * 0.5 },
    // p50≈25. Wins for elite perimeter defenders who sacrifice offense.

    { name: "Perimeter Stopper",
      score: perimeterDefense * 1.5 + mobility * 0.4 + b.spg * 10 - scoring * 0.5 - creation * 0.3 },
    // p50≈48. Wins for mobile defenders with good spg; not locked to pure offense.

    // ── Energy / bench (need motor ≥ p75 + low offense) ──────────────────
    { name: "Glue Guy",
      score: motor * 1.8 + perimeterDefense * 0.5 + rebounding * 0.4 - scoring * 0.4 - creation * 0.3 },
    // p50≈73. Wins for high-motor, below-average-offense connective players.

    { name: "Energy Guy",
      score: motor * 3.0 - scoring * 1.0 - rebounding * 0.8 + b.spg * 10 - creation * 0.5 },
    // p50≈22. High-motor, non-rebounding defenders; rebounding penalty separates from Glue Guy.

    { name: "Spark Plug",
      score: motor * 1.5 + scoring * 0.6 + mobility * 0.3 - size * 0.5 + b.ppg * 2 },
    // p50≈79. Wins for mobile bench scorers with high motor.

    // ── Rebounders (need rebounding ≥ p75 + rpg) ──────────────────────────
    { name: "Hustle Rebounder",
      score: rebounding * 1.6 + motor * 0.7 + b.rpg * 6 - scoring * 0.4 - creation * 0.4 },
    // p50≈50. Wins for active rebounders (rebounding≥50, rpg≥5).

    { name: "Glass Cleaner",
      score: rebounding * 2.0 + size * 0.5 - creation * 0.8 - scoring * 0.6 + b.rpg * 4 },
    // p50≈34. Wins for dominant big rebounders with low creation/scoring.

    { name: "Double-Double Threat",
      score: rebounding * 1.2 + scoring * 0.6 + b.rpg * 4 + b.ppg * 2 - creation * 0.5 },
    // p50≈53. Wins for true scorer+rebounder combos with both ppg and rpg high.

    // ── Big forward (need size + skill, not interior D) ────────────────────
    { name: "Stretch Big",
      score: size * 0.6 + skill * 0.8 + scoring * 0.5 - interiorDefense * 0.5 - rebounding * 0.3 },
    // p50≈75. Wins for skilled scorers with size but without interior D focus.

    // ── Interior defense specialists (need interiorDef ≥ p75 + bpg) ───────
    { name: "Defensive Anchor",
      score: interiorDefense * 1.8 + size * 0.5 + rebounding * 0.3 - creation * 0.8 - scoring * 0.5 + b.bpg * 8 },
    // p50≈36. Wins for elite shot-blocking bigs with very low offense.

    { name: "Defensive Big",
      score: interiorDefense * 1.2 + size * 0.5 + rebounding * 0.7 - creation * 0.8 + b.bpg * 5 },
    // p50≈60. Harder threshold: requires intDef+rebounding both clearly above avg.

    { name: "Rim Protector",
      score: interiorDefense * 2.0 + size * 0.4 - creation * 0.8 - mobility * 0.5 + b.bpg * 8 },
    // p50≈33. Wins for immobile shot-blocking bigs.

    { name: "Shot Blocker",
      score: interiorDefense * 2.5 - creation * 0.8 - scoring * 0.5 + b.bpg * 12 },
    // p50≈31. Wins for extreme bpg specialists (bpg≥2.5 + very high intDef).
  ];

  archetypes.sort((a, b) => b.score - a.score);

  const top = archetypes[0];
  const result: string[] = [top.name];

  for (let i = 1; i < archetypes.length && result.length < 2; i++) {
    if (archetypes[i].score >= top.score * 0.97) {
      result.push(archetypes[i].name);
    } else {
      break;
    }
  }

  return result;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const filePath = path.join(__dirname, "..", "public", "pokemon-bball-stats-augmented.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  const pokemonList: Pokemon[] = JSON.parse(raw);

  console.log(`Loaded ${pokemonList.length} Pokémon from augmented JSON\n`);

  // 1. Update playstyles (now string[])
  let playstyleChanged = 0;
  for (const mon of pokemonList) {
    const oldStyle = JSON.stringify(mon.playstyle);
    const newStyle = definePlayStyles(mon);
    if (oldStyle !== JSON.stringify(newStyle)) playstyleChanged++;
    mon.playstyle = newStyle;
  }

  // Print distribution by label
  const counts: Record<string, number> = {};
  for (const mon of pokemonList) {
    for (const ps of mon.playstyle!) {
      counts[ps] = (counts[ps] || 0) + 1;
    }
  }

  console.log("📊 Playstyle Distribution (by label):");
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([style, count]) => console.log(`  ${style.padEnd(25)} ${count}`));

  const multiCount = pokemonList.filter((m) => m.playstyle!.length > 1).length;
  console.log(`\n${multiCount} Pokémon have multiple playstyles`);
  console.log(`${playstyleChanged} Pokémon had their playstyle updated`);

  // 2. Assign salaries
  const beforeSalaries = new Map(pokemonList.map((p) => [p.name, p.salary]));
  assignBalancedSalaries(pokemonList);
  const salaryChanged = pokemonList.filter((m) => beforeSalaries.get(m.name) !== m.salary).length;
  console.log(`\n💰 ${salaryChanged} Pokémon had their salary updated`);

  // Top 20
  const top20 = [...pokemonList]
    .sort((a, b) => (b.salary ?? 0) - (a.salary ?? 0))
    .slice(0, 20)
    .map((p) => ({
      name: p.name,
      salary: p.salary,
      playstyle: p.playstyle!.join(" / "),
      ppg: p.bball.ppg,
      apg: p.bball.apg,
      rpg: p.bball.rpg,
      per: p.bball.per,
    }));

  console.log("\n🏆 Top 20 Salaries:");
  console.table(top20);

  const salaries = pokemonList.map((p) => p.salary ?? 0).sort((a, b) => b - a);
  const top6 = salaries.slice(0, 6).reduce((sum, x) => sum + x, 0);
  const top4plus2cheap =
    salaries.slice(0, 4).reduce((sum, x) => sum + x, 0) +
    salaries.slice(-2).reduce((sum, x) => sum + x, 0);

  console.log("\nTop 6 total salary:", roundToTenth(top6));
  console.log("Top 4 + 2 cheapest total salary:", roundToTenth(top4plus2cheap));

  // 3. Write back
  fs.writeFileSync(filePath, JSON.stringify(pokemonList, null, 2));
  console.log(`\n✅ Wrote updated data back to ${filePath}`);
}

main();
