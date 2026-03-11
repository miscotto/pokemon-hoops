/**
 * Adds support abilities to existing pokemon-bball-stats.json
 * without re-fetching from PokeAPI.
 *
 * Run: npx tsx scripts/addAbilities.ts
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

function getPlaystyle(avg: { ppg: number; rpg: number; apg: number; spg: number; bpg: number }): string {
  const { ppg, rpg, apg, spg, bpg } = avg;
  if (ppg >= 17 && apg >= 5) return "Floor General";
  if (ppg >= 18) return "Scoring Machine";
  if (rpg >= 8 && bpg >= 2.2) return "Defensive Anchor";
  if (ppg >= 15 && rpg >= 6) return "Double-Double Threat";
  if (apg >= 5) return "Playmaker";
  if (spg >= 1.3 && ppg >= 14) return "Two-Way Star";
  if (bpg >= 2.2) return "Shot Blocker";
  if (ppg >= 16) return "Go-To Scorer";
  if (rpg >= 7) return "Glass Cleaner";
  if (spg >= 1.2) return "Lockdown Defender";
  if (ppg >= 13 && rpg >= 5.5 && apg >= 3.5) return "Swiss Army Knife";
  if (ppg >= 14) return "Reliable Starter";
  if (apg >= 4) return "Sharpshooter";
  if (ppg >= 12 && rpg >= 5) return "Stretch Big";
  if (rpg >= 5.5) return "Hustle Rebounder";
  if (ppg >= 11) return "Spark Plug";
  if (bpg >= 1.8) return "Rim Protector";
  if (ppg < 8 && rpg < 4 && apg < 2.5) return "Energy Guy";
  return "Role Player";
}

const statsPath = path.join(__dirname, "..", "public", "pokemon-bball-stats.json");
const data = JSON.parse(fs.readFileSync(statsPath, "utf-8"));

let supportCount = 0;
const abilityCounts: Record<string, number> = {};

for (const entry of data) {
  if (entry.tag === "support") {
    const ability = getSupportAbility(entry.id, entry.baseStats);
    entry.ability = ability;
    entry.playstyle = ability; // replace playstyle with ability name for support
    supportCount++;
    abilityCounts[ability] = (abilityCounts[ability] || 0) + 1;
  } else {
    // Ensure ball handlers keep their traditional playstyle and no ability
    delete entry.ability;
    if (entry.tag === "ball handler") {
      entry.playstyle = getPlaystyle(entry.bball);
    }
  }
}

fs.writeFileSync(statsPath, JSON.stringify(data, null, 2));

console.log(`\n✅ Updated ${data.length} Pokémon in ${statsPath}`);
console.log(`   🤝 Support Pokémon with abilities: ${supportCount}`);
console.log(`\n   📊 Ability Distribution:`);
Object.entries(abilityCounts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([ability, count]) => {
    console.log(`     ${ability.padEnd(20)} ${count} Pokémon`);
  });
