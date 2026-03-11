/**
 * Reads pokemon-bball-stats-augmented.json, recomputes each Pokémon's
 * playstyle using the weighted-archetype definePlayStyle function,
 * assigns balanced salaries, and writes the result back.
 *
 * Run: npx tsx scripts/updatePlaystyles.ts
 */

import * as fs from "fs";
import * as path from "path";

type Pokemon = {
  id: number;
  name: string;
  salary?: number;
  playstyle?: string;
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

  // Premium for elite initiators / engines
  if (b.apg >= 5 && b.per >= 22) mult += 0.05;
  if (creationScore >= 290) mult += 0.04;

  // Premium for true two-way monsters
  if (b.per >= 24 && defenseScore >= 140) mult += 0.04;

  // Premium for elite bigs who also anchor defense/rebounding
  if (b.rpg >= 8 && (b.bpg >= 1.8 || sizeScore >= 300)) mult += 0.03;

  // Legendary / mythical / UB premium
  const rarity = getLegendaryStatus(pokemon);
  if (rarity === "legendary") mult += 0.08;
  if (rarity === "mythical") mult += 0.10;
  if (rarity === "ultraBeast") mult += 0.06;

  // Extra premium if the rare mon is also already elite
  if (rarity !== "normal" && (b.per >= 24 || b.ppg >= 22)) {
    mult += 0.03;
  }

  // Small discount for low-minute or low-impact players
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

  // Make stars cost real money
  if (b.ppg >= 24 || b.per >= 28) adjusted = Math.max(adjusted, 30);
  if (b.ppg >= 28 || b.per >= 32) adjusted = Math.max(adjusted, 35);

  // Elite creators / engines should not be cheap
  if (b.apg >= 6 && b.per >= 24) adjusted = Math.max(adjusted, 31);

  // Elite big anchor shouldn't be underpriced
  if (b.rpg >= 9 && b.bpg >= 2) adjusted = Math.max(adjusted, 28);

  // Legendary floors
  if (rarity === "ultraBeast") {
    adjusted = Math.max(adjusted, 12);
  }

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

  // True low-end players stay cheap — but not for legendaries/mythicals
  if (rarity === "normal") {
    if (b.mpg <= 12 && b.per <= 10) adjusted = Math.min(adjusted, 4);
    if (b.ppg <= 3 && b.apg <= 1 && b.rpg <= 1.5) adjusted = Math.min(adjusted, 3);
  }

  // Very weak overall profiles shouldn't drift too high
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

  const sortedValues = withValue
    .map((x) => x.adjustedValue)
    .sort((a, b) => a - b);

  const p75 = percentileOfSorted(sortedValues, 0.75);
  const p90 = percentileOfSorted(sortedValues, 0.90);
  const p97 = percentileOfSorted(sortedValues, 0.97);

  return withValue.map(({ pokemon, rawValue, adjustedValue }) => {
    const percentile = getPercentileRank(sortedValues, adjustedValue);

    let salary = baseSalaryFromPercentile(percentile);

    if (adjustedValue >= p97) {
      salary += 2.5;
    } else if (adjustedValue >= p90) {
      salary += 1.5;
    } else if (adjustedValue >= p75) {
      salary += 0.5;
    }

    salary = applySalarySanityRules(pokemon, salary);
    salary = roundToTenth(salary);

    pokemon.salary = salary;
    return pokemon;
  });
}

// ── Playstyle Logic ──────────────────────────────────────────────────────────

function definePlayStyle(pokemon: Pokemon): string {
  const b = pokemon.bball;
  const p = pokemon.physicalProfile ?? defaultPhysical();
  const s = pokemon.baseStats ?? defaultBaseStats();

  // Identity axes
  const size = (p.sizeAndReach + p.strength + s.hp + s.defense) / 4;
  const mobility = (p.speedAndAgility + p.jumpingAbility + s.speed) / 3;
  const skill = (p.coordination + p.balance + s.specialAttack) / 3;
  const interiorDefense = (p.sizeAndReach + p.jumpingAbility + s.defense + b.bpg * 15) / 4;
  const perimeterDefense = (p.speedAndAgility + p.balance + p.stamina + b.spg * 20) / 4;
  const rebounding = (p.sizeAndReach + p.strength + p.jumpingAbility + b.rpg * 8) / 4;
  const creation = (p.coordination + p.balance + s.speed + s.specialAttack + b.apg * 10) / 5;
  const scoring = (s.attack + s.specialAttack + mobility + b.ppg * 4 + b.per * 2) / 5;
  const motor = (p.stamina + p.speedAndAgility + b.mpg) / 3;

  // Rare unicorn / heliocentric archetype first
  if (
    size >= 75 &&
    creation >= 86 &&
    scoring >= 88 &&
    mobility >= 80
  ) {
    return "Point Forward";
  }

  // Primary initiators
  if (creation >= 82 && mobility >= 72 && b.apg >= 5) {
    return scoring >= 82 ? "Offensive Hub" : "Floor General";
  }

  if (scoring >= 84 && skill >= 78 && mobility >= 72) {
    return b.apg >= 4.5 ? "Shot Creator" : "Primary Scorer";
  }

  // Big roles should require low creator-guard traits
  const canBeInteriorAnchor =
    size >= 74 &&
    interiorDefense >= 76 &&
    b.bpg >= 1.5 &&
    creation < 78 &&
    mobility < 78;

  if (canBeInteriorAnchor) {
    return rebounding >= 74 ? "Defensive Big" : "Rim Protector";
  }

  if (
    size >= 72 &&
    rebounding >= 76 &&
    creation < 76 &&
    mobility < 75
  ) {
    return "Glass Cleaner";
  }

  if (
    size >= 68 &&
    skill >= 74 &&
    s.specialAttack >= 95 &&
    creation < 82
  ) {
    return "Stretch Big";
  }

  // Wings / guards
  if (
    perimeterDefense >= 74 &&
    mobility >= 72 &&
    creation < 78 &&
    scoring < 84
  ) {
    return b.spg >= 1.5 ? "Perimeter Stopper" : "3-and-D Wing";
  }

  if (
    mobility >= 78 &&
    p.jumpingAbility >= 72 &&
    scoring >= 72 &&
    creation < 80
  ) {
    return "Slasher";
  }

  if (
    motor >= 62 &&
    creation >= 65 &&
    scoring < 78 &&
    rebounding < 74
  ) {
    return "Glue Guy";
  }

  // Weighted fallback
  const archetypes = [
    {
      name: "Point Forward",
      score:
        size * 0.8 +
        creation * 1.4 +
        scoring * 1.25 +
        mobility * 1.0,
    },
    {
      name: "Offensive Hub",
      score:
        creation * 1.45 +
        scoring * 1.15 +
        skill * 1.1 +
        mobility * 0.85,
    },
    {
      name: "Shot Creator",
      score:
        scoring * 1.35 +
        creation * 0.95 +
        skill * 1.1 +
        mobility * 0.95,
    },
    {
      name: "Floor General",
      score:
        creation * 1.5 +
        skill * 1.15 +
        mobility * 0.9 -
        size * 0.1,
    },
    {
      name: "Slasher",
      score:
        mobility * 1.35 +
        scoring * 1.0 +
        p.jumpingAbility * 0.8 +
        s.attack * 0.3,
    },
    {
      name: "3-and-D Wing",
      score:
        perimeterDefense * 1.2 +
        mobility * 1.0 +
        skill * 0.7,
    },
    {
      name: "Perimeter Stopper",
      score:
        perimeterDefense * 1.35 +
        mobility * 1.05 +
        p.balance * 0.5,
    },
    {
      name: "Stretch Big",
      score:
        size * 0.95 +
        skill * 1.1 +
        scoring * 0.95 +
        rebounding * 0.35,
    },
    {
      name: "Rim Protector",
      score:
        size * 1.2 +
        interiorDefense * 1.35 -
        creation * 0.45 -
        mobility * 0.25,
    },
    {
      name: "Glass Cleaner",
      score:
        size * 1.1 +
        rebounding * 1.35 +
        interiorDefense * 0.45 -
        creation * 0.3,
    },
    {
      name: "Glue Guy",
      score:
        motor * 1.2 +
        perimeterDefense * 0.75 +
        creation * 0.55 +
        rebounding * 0.35,
    },
  ];

  archetypes.sort((a, b) => b.score - a.score);
  return archetypes[0].name;
}

// --- main ---

function main() {
  const filePath = path.join(__dirname, "..", "public", "pokemon-bball-stats-augmented.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  const pokemonList: Pokemon[] = JSON.parse(raw);

  console.log(`Loaded ${pokemonList.length} Pokémon from augmented JSON\n`);

  // 1. Update playstyles
  let playstyleChanged = 0;
  for (const mon of pokemonList) {
    const oldStyle = mon.playstyle;
    const newStyle = definePlayStyle(mon);
    if (oldStyle !== newStyle) {
      playstyleChanged++;
    }
    mon.playstyle = newStyle;
  }

  // Print playstyle distribution
  const counts: Record<string, number> = {};
  for (const mon of pokemonList) {
    const ps = mon.playstyle as string;
    counts[ps] = (counts[ps] || 0) + 1;
  }

  console.log("📊 Playstyle Distribution:");
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([style, count]) => {
      console.log(`  ${style.padEnd(30)} ${count} Pokémon`);
    });

  console.log(`\n${playstyleChanged} Pokémon had their playstyle updated`);

  // 2. Assign salaries
  let salaryChanged = 0;
  const beforeSalaries = new Map(pokemonList.map((p) => [p.name, p.salary]));
  assignBalancedSalaries(pokemonList);
  for (const mon of pokemonList) {
    if (beforeSalaries.get(mon.name) !== mon.salary) salaryChanged++;
  }

  console.log(`\n💰 ${salaryChanged} Pokémon had their salary updated`);

  // Print top 20 salaries
  const top20 = [...pokemonList]
    .sort((a, b) => (b.salary ?? 0) - (a.salary ?? 0))
    .slice(0, 20)
    .map((p) => ({
      name: p.name,
      salary: p.salary,
      playstyle: p.playstyle,
      ppg: p.bball.ppg,
      apg: p.bball.apg,
      rpg: p.bball.rpg,
      per: p.bball.per,
    }));

  console.log("\n🏆 Top 20 Salaries:");
  console.table(top20);

  // Salary distribution check
  const salaries = pokemonList
    .map((p) => p.salary ?? 0)
    .sort((a, b) => b - a);

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
