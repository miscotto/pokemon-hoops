/**
 * Augments pokemon-bball-stats.json with AI-generated basketball scouting data.
 * Uses OpenAI's Responses API with web search + vision to research each Pokémon.
 *
 * Prerequisites:
 *   - OPENAI_API_KEY environment variable set
 *
 * Run:    OPENAI_API_KEY=sk-xxx npx tsx scripts/augmentWithAI.ts
 * Resume: Script auto-resumes from last saved progress.
 * Test:   OPENAI_API_KEY=sk-xxx npx tsx scripts/augmentWithAI.ts --limit 5
 * Single: OPENAI_API_KEY=sk-xxx npx tsx scripts/augmentWithAI.ts --id 25
 */

import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────
const CONCURRENCY = 3;
const RETRY_LIMIT = 3;
const RETRY_DELAY_MS = 5_000;
const MODEL = "gpt-4o";
const SAVE_EVERY = 5;

// ─── Paths ────────────────────────────────────────────────────────────────────
const INPUT_PATH = path.join(__dirname, "..", "public", "pokemon-bball-stats.json");
const OUTPUT_PATH = path.join(__dirname, "..", "public", "pokemon-bball-stats-augmented.json");
const PROGRESS_PATH = path.join(__dirname, ".augment-progress.json");

// ─── Types ────────────────────────────────────────────────────────────────────
interface PhysicalProfile {
  sizeAndReach: number;
  speedAndAgility: number;
  jumpingAbility: number;
  coordination: number;
  stamina: number;
  balance: number;
  strength: number;
}

interface BballStats {
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  mpg: number;
  per: number;
}

interface AugmentedFields {
  rivals: string[];
  allies: string[];
  physicalProfile: PhysicalProfile;
  isSupport: boolean;
  ability: string;
  bball: BballStats;
}

interface ProgressData {
  results: Record<string, AugmentedFields>;
}

// ─── OpenAI client ────────────────────────────────────────────────────────────
const openai = new OpenAI();

// ─── Prompt builder ───────────────────────────────────────────────────────────
function buildPrompt(pokemon: any): string {
  const s = pokemon.baseStats;
  return `You are an expert Pokémon analyst and professional basketball scout. Your job is to evaluate "${pokemon.name}" (Pokédex #${pokemon.id}) for a Pokémon basketball league.

**Pokémon data:**
- Name: ${pokemon.name}
- Types: ${pokemon.types.join(", ")}
- Height: ${pokemon.height} decimetres (${(pokemon.height / 10).toFixed(1)} m)
- Weight: ${pokemon.weight} hectograms (${(pokemon.weight / 10).toFixed(1)} kg)
- Base Stats: HP ${s.hp} | ATK ${s.attack} | DEF ${s.defense} | SpATK ${s.specialAttack} | SpDEF ${s.specialDefense} | SPD ${s.speed}
- Image URL is provided — analyze the Pokémon's physical form from the image.

**Instructions:**
1. Search the web for "${pokemon.name} Pokémon" to learn about its lore, rivals, allies, Pokédex descriptions, signature abilities, and physical characteristics.
2. Study the provided image carefully to understand the Pokémon's body shape, limbs, hands/claws, posture, and overall build.
3. Based on ALL gathered information, evaluate the following:

**A. Rivals** – Other Pokémon that are canonical rivals or enemies (from games, anime, lore). Return empty array if none are well-known.

**B. Allies** – Pokémon that are canonical friends, partners, or allies (from games, anime, lore). Return empty array if none are well-known.

**C. Physical Profile Scores (1–100 each):**
  - sizeAndReach: Tall wingspan helps with blocks, rebounds, finishing at the rim. Deduce from image, weight, height, and Pokédex descriptions.
  - speedAndAgility: Quick first step, lateral movement, change of direction matter more than raw size. Deduce from speed stat, image, and descriptions.
  - jumpingAbility: Vertical explosiveness for rebounding, shot blocking, alley-oops, dunks. Deduce from stats, image (legs, build), and descriptions.
  - coordination: Hands, hand-like limbs, or very precise control needed to dribble, pass, and shoot. A strong Pokémon with bad ball control is terrible at basketball. Deduce from attack & special attack stats, image (look at hands/limbs/appendages), and descriptions.
  - stamina: Basketball is constant sprinting, stopping, cutting, and reacting. Deduce from HP stat, image, and descriptions.
  - balance: Absorbing contact, landing safely, defending, finishing through traffic. Deduce from image (posture, center of gravity, number of legs), and descriptions.
  - strength: Boxing out, setting screens, holding post position, finishing through defenders. Deduce from defense & special defense stats, image, and descriptions.

**D. Support determination:**
Look at the image very carefully. Can this Pokémon physically play basketball? Does it have limbs that could dribble or shoot? Can it move effectively on a court? If it clearly CANNOT play traditional basketball (e.g., it's a fish out of water, an immobile rock, a tiny insect, a formless blob, a magnet, etc.), mark it as isSupport = true. Support Pokémon still contribute via special abilities but don't play traditional basketball. Be strict — if in doubt, look at the image.

**E. Ability:**
From the Pokémon's REAL game abilities and Pokédex description, pick the MOST fitting ability for a basketball context. Prioritize its signature ability if it has one. Use the real Pokémon ability name.

**F. Basketball Stats:**
Based on ALL the above analysis (especially the physical profile scores and whether it's support), generate realistic basketball stats:
  - ppg (points per game): range 2.0–34.0
  - rpg (rebounds per game): range 0.5–15.0
  - apg (assists per game): range 0.3–12.0
  - spg (steals per game): range 0.1–3.0
  - bpg (blocks per game): range 0.1–4.5
  - mpg (minutes per game): range 8.0–38.0
  - per (player efficiency rating): range 5.0–35.0

Support Pokémon should have LOW traditional stats (ppg < 5, rpg < 2, apg < 2, mpg 8–15) but can still have decent PER if their ability is impactful.
Non-support Pokémon stats should reflect their physical profile — high coordination + speed = more scoring/assists, high size + strength = more rebounds/blocks, etc.

**Return ONLY valid JSON** in exactly this format (no markdown fences, no extra text):
{
  "rivals": ["name1", "name2"],
  "allies": ["name1", "name2"],
  "physicalProfile": {
    "sizeAndReach": 50,
    "speedAndAgility": 50,
    "jumpingAbility": 50,
    "coordination": 50,
    "stamina": 50,
    "balance": 50,
    "strength": 50
  },
  "isSupport": false,
  "ability": "Overgrow",
  "bball": {
    "ppg": 10.5,
    "rpg": 4.5,
    "apg": 3.1,
    "spg": 0.8,
    "bpg": 1.5,
    "mpg": 21.5,
    "per": 19.0
  }
}`;
}

// ─── API call with retry ──────────────────────────────────────────────────────
async function callOpenAI(pokemon: any): Promise<AugmentedFields> {
  const prompt = buildPrompt(pokemon);

  for (let attempt = 1; attempt <= RETRY_LIMIT; attempt++) {
    try {
      const inputContent: any[] = [
        { type: "input_text", text: prompt },
      ];

      // Include image if sprite URL exists
      if (pokemon.sprite) {
        inputContent.push({
          type: "input_image",
          image_url: pokemon.sprite,
        });
      }

      const response = await openai.responses.create({
        model: MODEL,
        tools: [{ type: "web_search_preview" } as any],
        input: [
          {
            role: "user" as const,
            content: inputContent,
          },
        ],
      });

      const text = (response as any).output_text;
      if (!text) throw new Error("Empty response from OpenAI");

      // Extract JSON — handle possible markdown fences the model might add
      let jsonStr = text;
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) jsonStr = fenceMatch[1];
      jsonStr = jsonStr.trim();

      const parsed = JSON.parse(jsonStr) as AugmentedFields;

      // Validate required fields
      if (
        !parsed.physicalProfile ||
        !parsed.bball ||
        typeof parsed.isSupport !== "boolean" ||
        !parsed.ability
      ) {
        throw new Error("Missing required fields in AI response");
      }

      // Clamp scores to 1–100
      for (const key of Object.keys(parsed.physicalProfile) as (keyof PhysicalProfile)[]) {
        parsed.physicalProfile[key] = Math.max(1, Math.min(100, Math.round(parsed.physicalProfile[key])));
      }

      // Clamp bball stats to valid ranges
      parsed.bball.ppg = clamp(parsed.bball.ppg, 2.0, 34.0);
      parsed.bball.rpg = clamp(parsed.bball.rpg, 0.5, 15.0);
      parsed.bball.apg = clamp(parsed.bball.apg, 0.3, 12.0);
      parsed.bball.spg = clamp(parsed.bball.spg, 0.1, 3.0);
      parsed.bball.bpg = clamp(parsed.bball.bpg, 0.1, 4.5);
      parsed.bball.mpg = clamp(parsed.bball.mpg, 8.0, 38.0);
      parsed.bball.per = clamp(parsed.bball.per, 5.0, 35.0);

      // Round bball stats to 1 decimal
      for (const key of Object.keys(parsed.bball) as (keyof BballStats)[]) {
        parsed.bball[key] = Math.round(parsed.bball[key] * 10) / 10;
      }

      // Ensure arrays
      if (!Array.isArray(parsed.rivals)) parsed.rivals = [];
      if (!Array.isArray(parsed.allies)) parsed.allies = [];

      // Lowercase pokemon names in rivals/allies for consistency
      parsed.rivals = parsed.rivals.map((r) => r.toLowerCase().trim()).filter(Boolean);
      parsed.allies = parsed.allies.map((a) => a.toLowerCase().trim()).filter(Boolean);

      return parsed;
    } catch (err: any) {
      console.error(
        `  ⚠ Attempt ${attempt}/${RETRY_LIMIT} failed for #${pokemon.id} ${pokemon.name}: ${err.message}`
      );
      if (attempt < RETRY_LIMIT) {
        await sleep(RETRY_DELAY_MS * attempt);
      } else {
        throw err;
      }
    }
  }
  throw new Error("Unreachable");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function loadProgress(): { results: Map<number, AugmentedFields> } {
  if (fs.existsSync(PROGRESS_PATH)) {
    const data: ProgressData = JSON.parse(fs.readFileSync(PROGRESS_PATH, "utf-8"));
    const results = new Map<number, AugmentedFields>();
    for (const [id, aug] of Object.entries(data.results)) {
      results.set(parseInt(id, 10), aug);
    }
    return { results };
  }
  return { results: new Map() };
}

function saveProgress(results: Map<number, AugmentedFields>): void {
  const data: ProgressData = {
    results: Object.fromEntries(results),
  };
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(data));
}

// ─── Salary & playstyle (mirrors buildAllStats.ts) ────────────────────────────
const SALARY_MIN = 1;
const SALARY_MAX = 44;
const RAW_MIN = 39.2;
const RAW_MAX = 110.5;

function computeSalary(avg: BballStats): number {
  const raw =
    avg.ppg * 2.5 +
    avg.rpg * 1.5 +
    avg.apg * 2.0 +
    avg.spg * 3.0 +
    avg.bpg * 2.5 +
    avg.per * 0.8;
  const t = Math.max(0, Math.min(1, (raw - RAW_MIN) / (RAW_MAX - RAW_MIN)));
  return Math.round((SALARY_MIN + t * (SALARY_MAX - SALARY_MIN)) * 10) / 10;
}

function getPlaystyle(avg: BballStats): string {
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

// ─── Output writer ────────────────────────────────────────────────────────────
function writeOutput(allPokemon: any[], results: Map<number, AugmentedFields>): void {
  const output = allPokemon.map((p: any) => {
    const aug = results.get(p.id);
    if (!aug) {
      // Not yet processed — keep original data
      return { ...p };
    }

    const tag: "ball handler" | "support" = aug.isSupport ? "support" : "ball handler";
    const playstyle = aug.isSupport ? aug.ability : getPlaystyle(aug.bball);

    return {
      id: p.id,
      name: p.name,
      sprite: p.sprite,
      types: p.types,
      height: p.height,
      weight: p.weight,
      baseStats: p.baseStats,
      rivals: aug.rivals,
      allies: aug.allies,
      physicalProfile: aug.physicalProfile,
      ability: aug.ability,
      tag,
      bball: aug.bball,
      playstyle,
      salary: computeSalary(aug.bball),
    };
  });

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
}

// ─── Batch processor ──────────────────────────────────────────────────────────
async function processBatch(
  batch: any[],
  results: Map<number, AugmentedFields>
): Promise<number> {
  let succeeded = 0;
  const promises = batch.map(async (pokemon: any) => {
    try {
      const augmented = await callOpenAI(pokemon);
      results.set(pokemon.id, augmented);
      succeeded++;
      const tag = augmented.isSupport ? "🤝 support" : "🏀 player";
      console.log(
        `  ✓ #${String(pokemon.id).padStart(4)} ${pokemon.name.padEnd(20)} ${tag.padEnd(12)} ability: ${augmented.ability}`
      );
    } catch (err: any) {
      console.error(
        `  ✗ #${String(pokemon.id).padStart(4)} ${pokemon.name.padEnd(20)} FAILED after ${RETRY_LIMIT} retries: ${err.message}`
      );
    }
  });
  await Promise.all(promises);
  return succeeded;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  // Parse CLI args
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;
  const idIdx = args.indexOf("--id");
  const singleId = idIdx !== -1 ? parseInt(args[idIdx + 1], 10) : null;

  // Load input data
  const allPokemon: any[] = JSON.parse(fs.readFileSync(INPUT_PATH, "utf-8"));
  console.log(`📂 Loaded ${allPokemon.length} Pokémon from ${INPUT_PATH}`);

  // Load progress
  const { results } = loadProgress();
  if (results.size > 0) {
    console.log(`🔄 Resuming — ${results.size} already completed`);
  }

  // Determine which Pokemon to process
  let toProcess: any[];
  if (singleId !== null) {
    const target = allPokemon.find((p: any) => p.id === singleId);
    if (!target) {
      console.error(`❌ No Pokémon found with id ${singleId}`);
      process.exit(1);
    }
    toProcess = [target];
    console.log(`🎯 Processing single Pokémon: #${singleId} ${target.name}`);
  } else {
    toProcess = allPokemon
      .filter((p: any) => !results.has(p.id))
      .slice(0, limit);
    console.log(
      `🎯 Processing ${toProcess.length} Pokémon (concurrency: ${CONCURRENCY}, model: ${MODEL})`
    );
  }

  if (toProcess.length === 0) {
    console.log("✅ All Pokémon already processed! Writing final output...");
    writeOutput(allPokemon, results);
    console.log(`📁 Output: ${OUTPUT_PATH}`);
    return;
  }

  console.log();

  // Process in concurrent batches
  let totalProcessed = 0;
  const startTime = Date.now();

  for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
    const batch = toProcess.slice(i, i + CONCURRENCY);
    const succeeded = await processBatch(batch, results);
    totalProcessed += succeeded;

    // Save progress periodically
    if (totalProcessed % SAVE_EVERY === 0 || i + CONCURRENCY >= toProcess.length) {
      saveProgress(results);
      writeOutput(allPokemon, results);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const remaining = toProcess.length - (i + batch.length);
      const rate = totalProcessed / ((Date.now() - startTime) / 1000);
      const eta = remaining > 0 ? Math.round(remaining / rate) : 0;

      console.log(
        `  💾 Saved (${results.size}/${allPokemon.length}) | ${elapsed}s elapsed | ~${eta}s remaining\n`
      );
    }

    // Rate limit pause between batches
    if (i + CONCURRENCY < toProcess.length) {
      await sleep(1_500);
    }
  }

  // Final save
  saveProgress(results);
  writeOutput(allPokemon, results);

  // Summary
  const supportCount = [...results.values()].filter((r) => r.isSupport).length;
  const playerCount = results.size - supportCount;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n${"═".repeat(60)}`);
  console.log(`✅ Augmentation complete in ${elapsed}s`);
  console.log(`   📊 Total processed: ${results.size} / ${allPokemon.length}`);
  console.log(`   🏀 Ball handlers:   ${playerCount}`);
  console.log(`   🤝 Support:         ${supportCount}`);
  console.log(`   📁 Output file:     ${OUTPUT_PATH}`);
  console.log(`${"═".repeat(60)}`);

  // Print some sample results
  const sample = [...results.entries()].slice(-3);
  if (sample.length > 0) {
    console.log(`\n🔍 Last ${sample.length} processed:`);
    for (const [id, aug] of sample) {
      const p = allPokemon.find((pk: any) => pk.id === id);
      console.log(`\n  #${id} ${p?.name}`);
      console.log(`    Ability: ${aug.ability}`);
      console.log(`    Rivals:  ${aug.rivals.length > 0 ? aug.rivals.join(", ") : "none"}`);
      console.log(`    Allies:  ${aug.allies.length > 0 ? aug.allies.join(", ") : "none"}`);
      console.log(
        `    Profile: size=${aug.physicalProfile.sizeAndReach} spd=${aug.physicalProfile.speedAndAgility} jump=${aug.physicalProfile.jumpingAbility} coord=${aug.physicalProfile.coordination} stam=${aug.physicalProfile.stamina} bal=${aug.physicalProfile.balance} str=${aug.physicalProfile.strength}`
      );
      console.log(
        `    Stats:   ${aug.bball.ppg}ppg ${aug.bball.rpg}rpg ${aug.bball.apg}apg ${aug.bball.spg}spg ${aug.bball.bpg}bpg ${aug.bball.mpg}mpg ${aug.bball.per}per`
      );
      console.log(`    Support: ${aug.isSupport}`);
    }
  }

  // Cleanup progress file when fully done
  if (results.size >= allPokemon.length) {
    fs.unlinkSync(PROGRESS_PATH);
    console.log(`\n🧹 Progress file cleaned up — all Pokémon complete!`);
  }
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});
