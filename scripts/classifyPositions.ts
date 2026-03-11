/**
 * Uses OpenAI's Batch API + vision to classify every Pokémon as
 * "ball handler" or "support" by looking at their sprite image.
 *
 * Ball handlers: Pokémon with arms, wings, or large tails that could dribble a basketball.
 * Support: Everything else.
 *
 * Reads sprites from public/pokemon-bball-stats.json
 * Writes result to public/pokemon-positions.json
 *
 * Usage:
 *   # Step 1 — Submit the batch (creates JSONL, uploads, starts batch)
 *   OPENAI_API_KEY=sk-... npx tsx scripts/classifyPositions.ts submit
 *
 *   # Step 2 — Check status / download results when ready
 *   OPENAI_API_KEY=sk-... npx tsx scripts/classifyPositions.ts collect
 *
 *   # Or do it all in one shot (submits, polls until done, writes results)
 *   OPENAI_API_KEY=sk-... npx tsx scripts/classifyPositions.ts run
 */

import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";

// ── Config ───────────────────────────────────────────────────────────────────

const OUTPUT_FILE = path.join(__dirname, "..", "public", "pokemon-positions.json");
const INPUT_FILE = path.join(__dirname, "..", "public", "pokemon-bball-stats.json");
const BATCH_STATE_FILE = path.join(__dirname, "..", ".batch-state.json");
const JSONL_FILE = path.join(__dirname, "..", ".batch-requests.jsonl");
const POLL_INTERVAL_MS = 30_000; // 30 seconds between status checks

// ── Types ────────────────────────────────────────────────────────────────────

interface InputEntry {
  id: number;
  name: string;
  sprite: string;
}

interface PositionEntry {
  id: number;
  name: string;
  position: "ball handler" | "support";
}

interface BatchState {
  batchId: string;
  inputFileId: string;
  pokemonMap: Record<string, { id: number; name: string }>; // custom_id → pokemon
}

// ── OpenAI client ────────────────────────────────────────────────────────────

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("ERROR: Set OPENAI_API_KEY environment variable.");
  process.exit(1);
}

const openai = new OpenAI({ apiKey });

// ── Classification prompt ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Pokémon basketball analyst. You will be shown an image of a Pokémon. Your job is to decide if this Pokémon is a "ball handler" or "support".

Rules:
- "ball handler": The Pokémon has arms, wings, or a large tail that it could feasibly use to dribble a basketball.
- "support": The Pokémon does NOT have arms, wings, or a large usable tail — for example, it is a blob, a fish, a snake without arms, a rock, etc.

Respond with ONLY one of these two words exactly: "ball handler" or "support". No other text.`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadInput(): InputEntry[] {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`ERROR: ${INPUT_FILE} not found. Run buildAllStats.ts first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
}

// ── Step 1: Build JSONL and submit batch ─────────────────────────────────────

async function submit() {
  console.log("🏀 Pokémon Position Classifier — SUBMIT\n");

  const inputData = loadInput();
  const withSprites = inputData.filter((e) => e.sprite);
  console.log(`Building batch request for ${withSprites.length} Pokémon...\n`);

  // Build the pokemon lookup map and JSONL lines
  const pokemonMap: Record<string, { id: number; name: string }> = {};
  const lines: string[] = [];

  for (const entry of withSprites) {
    const customId = `pokemon-${entry.id}`;
    pokemonMap[customId] = { id: entry.id, name: entry.name };

    const requestBody = {
      custom_id: customId,
      method: "POST",
      url: "/v1/chat/completions",
      body: {
        model: "gpt-4o-mini",
        max_tokens: 10,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `This is ${entry.name}. Is it a ball handler or support?`,
              },
              {
                type: "image_url",
                image_url: { url: entry.sprite, detail: "low" },
              },
            ],
          },
        ],
      },
    };

    lines.push(JSON.stringify(requestBody));
  }

  // Write JSONL file
  fs.writeFileSync(JSONL_FILE, lines.join("\n"));
  console.log(`  ✓ Wrote ${lines.length} requests to ${JSONL_FILE}`);

  // Upload file to OpenAI
  console.log("  Uploading JSONL to OpenAI...");
  const file = await openai.files.create({
    file: fs.createReadStream(JSONL_FILE),
    purpose: "batch",
  });
  console.log(`  ✓ Uploaded file: ${file.id}`);

  // Create batch
  console.log("  Creating batch...");
  const batch = await openai.batches.create({
    input_file_id: file.id,
    endpoint: "/v1/chat/completions",
    completion_window: "24h",
  });
  console.log(`  ✓ Batch created: ${batch.id}`);
  console.log(`    Status: ${batch.status}`);

  // Save state for collect step
  const state: BatchState = { batchId: batch.id, inputFileId: file.id, pokemonMap };
  fs.writeFileSync(BATCH_STATE_FILE, JSON.stringify(state, null, 2));
  console.log(`\n  State saved to ${BATCH_STATE_FILE}`);
  console.log(`\n  Run "npx tsx scripts/classifyPositions.ts collect" to check status & download results.`);
}

// ── Step 2: Poll / collect results ───────────────────────────────────────────

async function collect(poll: boolean = false) {
  console.log("🏀 Pokémon Position Classifier — COLLECT\n");

  if (!fs.existsSync(BATCH_STATE_FILE)) {
    console.error("ERROR: No batch state found. Run 'submit' first.");
    process.exit(1);
  }

  const state: BatchState = JSON.parse(fs.readFileSync(BATCH_STATE_FILE, "utf-8"));
  console.log(`  Batch ID: ${state.batchId}\n`);

  // Poll until done if requested
  let batch = await openai.batches.retrieve(state.batchId);

  if (poll) {
    while (!["completed", "failed", "expired", "cancelled"].includes(batch.status)) {
      const counts = batch.request_counts;
      console.log(
        `  Status: ${batch.status}  (completed: ${counts?.completed ?? "?"} / total: ${counts?.total ?? "?"})`
      );
      console.log(`  Next check in ${POLL_INTERVAL_MS / 1000}s...`);
      await sleep(POLL_INTERVAL_MS);
      batch = await openai.batches.retrieve(state.batchId);
    }
  }

  console.log(`  Final status: ${batch.status}`);
  const counts = batch.request_counts;
  console.log(`  Completed: ${counts?.completed}  Failed: ${counts?.failed}  Total: ${counts?.total}`);

  if (batch.status !== "completed") {
    console.error(`\n  Batch is not complete yet (status: ${batch.status}).`);
    if (!poll) console.log(`  Re-run with "collect" later, or use "run" to auto-poll.`);
    return;
  }

  // Download output file
  if (!batch.output_file_id) {
    console.error("  ERROR: No output file ID on completed batch.");
    return;
  }

  console.log(`\n  Downloading results from ${batch.output_file_id}...`);
  const fileResponse = await openai.files.content(batch.output_file_id);
  const text = await fileResponse.text();
  const outputLines = text.trim().split("\n");

  // Parse results
  const inputData = loadInput();
  const allPokemon = new Map(inputData.map((e) => [e.id, e]));
  const results: PositionEntry[] = [];

  for (const line of outputLines) {
    const obj = JSON.parse(line);
    const customId: string = obj.custom_id;
    const pokemon = state.pokemonMap[customId];
    if (!pokemon) continue;

    const content: string =
      obj.response?.body?.choices?.[0]?.message?.content?.trim().toLowerCase() ?? "";

    let position: "ball handler" | "support" = "support";
    if (content.includes("ball handler")) position = "ball handler";

    results.push({ id: pokemon.id, name: pokemon.name, position });
    allPokemon.delete(pokemon.id);
  }

  // Any remaining Pokémon (no sprite or missing from batch) default to support
  for (const [id, entry] of allPokemon) {
    results.push({ id, name: entry.name, position: "support" });
  }

  // Sort and write
  results.sort((a, b) => a.id - b.id);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

  // Cleanup temp files
  for (const f of [BATCH_STATE_FILE, JSONL_FILE]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  // Summary
  const handlers = results.filter((r) => r.position === "ball handler").length;
  const supports = results.filter((r) => r.position === "support").length;

  console.log(`\n✅ Done! Classified ${results.length} Pokémon.`);
  console.log(`   🏀 Ball Handlers: ${handlers}`);
  console.log(`   🤝 Support:       ${supports}`);
  console.log(`\n   Written to ${OUTPUT_FILE}`);
}

// ── "run" = submit + poll + collect ──────────────────────────────────────────

async function run() {
  await submit();
  console.log("\n--- Now polling for completion ---\n");
  await collect(true);
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const command = process.argv[2] ?? "run";

switch (command) {
  case "submit":
    submit().catch(console.error);
    break;
  case "collect":
    collect(false).catch(console.error);
    break;
  case "run":
    run().catch(console.error);
    break;
  default:
    console.log("Usage: npx tsx scripts/classifyPositions.ts [submit|collect|run]");
    console.log("  submit  — Build JSONL, upload, and create batch");
    console.log("  collect — Check batch status and download results");
    console.log("  run     — Submit + poll + collect (all-in-one)");
}
