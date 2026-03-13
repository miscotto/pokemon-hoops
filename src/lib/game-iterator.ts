import { TournamentTeam, GameEvent, GameEventType, calculateTeamFactors } from "../app/utils/tournamentEngine";
import { calcTypeAdvantage } from "../app/utils/typeChart";
import { computeAbilityModifier } from "../app/utils/abilityModifier";
import abilitiesData from "../../public/abilities.json";

// ─── Constants (same as tournamentEngine.ts) ─────────────────────────────────

export const QUARTER_DURATION = 720;
export const GAME_DURATION = 2880;
const TARGET_EVENTS = 150;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function gameSecToQuarter(sec: number): 1 | 2 | 3 | 4 {
  if (sec < QUARTER_DURATION) return 1;
  if (sec < QUARTER_DURATION * 2) return 2;
  if (sec < QUARTER_DURATION * 3) return 3;
  return 4;
}

function gameSecToClock(sec: number): string {
  const qIdx = Math.min(3, Math.floor(sec / QUARTER_DURATION));
  const secInQ = sec - qIdx * QUARTER_DURATION;
  const remaining = Math.max(0, QUARTER_DURATION - secInQ);
  const mins = Math.floor(remaining / 60);
  const secs = Math.floor(remaining % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

// ─── Sleep timing ─────────────────────────────────────────────────────────────

export function getSleepMs(type: GameEventType, isBurst: boolean): number {
  if (isBurst) return rand(1200, 2200);
  if (type === "quarter_start" || type === "quarter_end" || type === "halftime") return rand(3000, 5000);
  if (["score_2pt", "score_3pt", "dunk", "layup", "clutch"].includes(type)) return rand(1500, 2500);
  if (["block", "steal", "rebound"].includes(type)) return rand(1200, 2000);
  return rand(2000, 4000);
}

// ─── Iterator ─────────────────────────────────────────────────────────────────

type Phase = "playing" | "tiebreak_check" | "game_end" | "done";

export interface IteratorEvent extends Omit<GameEvent, "displayAtMs"> {
  sequence: number;
  sleepMs: number;
}

export function createGameIterator(
  homeTeam: TournamentTeam,
  awayTeam: TournamentTeam,
): { next(): IteratorEvent | null } {
  // Mutable state (same as generateGameEvents)
  let homeScore = 0;
  let awayScore = 0;
  let homeMomentum = 0;
  let awayMomentum = 0;
  let sequence = 0;
  let phase: Phase = "playing";
  let halftimeDone = false;
  const quarterStartsDone = new Set<number>();
  let burstRemaining = 0;
  let consecutiveScoringEvents = 0;

  // Per-player stats
  const statsMap = new Map<string, {
    fouls: number; injured: boolean; points: number;
    rebounds: number; assists: number; steals: number; blocks: number;
  }>();
  for (const p of homeTeam.roster) {
    statsMap.set(`home-${p.name}`, { fouls: 0, injured: false, points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0 });
  }
  for (const p of awayTeam.roster) {
    statsMap.set(`away-${p.name}`, { fouls: 0, injured: false, points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0 });
  }

  // Game time cursor (sec into game)
  const spacing = GAME_DURATION / TARGET_EVENTS;
  let sec = 0; // starts at 0 (game_start), then advances

  // Internal event queue for structural events that precede the main event
  const queue: IteratorEvent[] = [];

  // Whether game_start has been emitted
  let gameStarted = false;

  function makeEvent(
    type: GameEventType,
    team: "home" | "away",
    pokemonName: string,
    description: string,
    gameSec: number,
    opts: Partial<Pick<IteratorEvent, "pointsScored" | "statType" | "pokemonSprite">> = {},
    isBurst = false,
  ): IteratorEvent {
    const quarter = gameSecToQuarter(gameSec);
    const clock = gameSecToClock(gameSec);
    const sleepMs = getSleepMs(type, isBurst);
    return {
      gameTimeSec: gameSec,
      quarter,
      clock,
      type,
      team,
      pokemonName,
      description,
      homeScore,
      awayScore,
      sequence: sequence++,
      sleepMs,
      ...opts,
    };
  }

  return {
    next(): IteratorEvent | null {
      // Drain queue first (structural events buffered ahead)
      if (queue.length > 0) return queue.shift()!;

      if (phase === "done") return null;

      // Emit game_start once
      if (!gameStarted) {
        gameStarted = true;
        return makeEvent("game_start", "home", "Tip-off",
          `${homeTeam.name} vs ${awayTeam.name} — Tip-off!`, 0);
      }

      // Handle tiebreak_check phase
      if (phase === "tiebreak_check") {
        if (homeScore === awayScore) {
          const clutchSide: "home" | "away" = Math.random() < 0.5 ? "home" : "away";
          const clutchTeam = clutchSide === "home" ? homeTeam : awayTeam;
          const clutchPlayer = pick(clutchTeam.roster);
          const pts = Math.random() < 0.5 ? 2 : 3;
          if (clutchSide === "home") homeScore += pts; else awayScore += pts;
          // Create clutch first (lower sequence), then queue game_end (higher sequence)
          const clutchEvent = makeEvent("clutch", clutchSide, clutchPlayer.name,
            `BUZZER BEATER! ${clutchPlayer.name} wins it at the horn!`,
            GAME_DURATION - 5,
            { pointsScored: pts, pokemonSprite: clutchPlayer.sprite });
          const winner: "home" | "away" = homeScore > awayScore ? "home" : "away";
          const winnerTeam = winner === "home" ? homeTeam : awayTeam;
          queue.push(makeEvent("game_end", winner, "Final",
            `Game Over! ${winnerTeam.name} wins ${Math.max(homeScore, awayScore)}-${Math.min(homeScore, awayScore)}!`,
            GAME_DURATION));
          phase = "game_end";
          return clutchEvent;
        }
        phase = "game_end";
        const winner: "home" | "away" = homeScore > awayScore ? "home" : "away";
        const winnerTeam = winner === "home" ? homeTeam : awayTeam;
        const ev = makeEvent("game_end", winner, "Final",
          `Game Over! ${winnerTeam.name} wins ${Math.max(homeScore, awayScore)}-${Math.min(homeScore, awayScore)}!`,
          GAME_DURATION);
        phase = "done";
        return ev;
      }

      // Handle game_end phase (after clutch was emitted)
      if (phase === "game_end") {
        phase = "done";
        return null;
      }

      // Advance game time cursor
      sec += rand(spacing * 0.5, spacing * 1.5);

      if (sec >= GAME_DURATION) {
        phase = "tiebreak_check";
        return this.next();
      }

      const gameSec = Math.round(sec);
      const quarter = gameSecToQuarter(gameSec);

      // Inject structural events before main event
      if (quarter > 1 && !quarterStartsDone.has(quarter)) {
        quarterStartsDone.add(quarter);
        queue.push(makeEvent("quarter_start", "home", `Q${quarter}`,
          `Quarter ${quarter} begins!`, (quarter - 1) * QUARTER_DURATION));
      }
      if (quarter >= 3 && !halftimeDone) {
        halftimeDone = true;
        queue.push(makeEvent("halftime", "home", "Halftime",
          `Halftime! ${homeTeam.name} ${homeScore} - ${awayScore} ${awayTeam.name}`,
          QUARTER_DURATION * 2));
      }
      if (queue.length > 0) {
        // Undo time advance so this game second is processed again for the main event
        sec -= rand(spacing * 0.5, spacing * 1.5);
        return queue.shift()!;
      }

      // Determine which team acts
      const hFactors = calculateTeamFactors(homeTeam, awayTeam, { home: homeScore, away: awayScore }, gameSec, "home");
      const aFactors = calculateTeamFactors(awayTeam, homeTeam, { home: homeScore, away: awayScore }, gameSec, "away");
      const hPower = hFactors.finalRating + homeMomentum;
      const aPower = aFactors.finalRating + awayMomentum;
      const side: "home" | "away" = Math.random() < hPower / (hPower + aPower) ? "home" : "away";
      const activeTeam = side === "home" ? homeTeam : awayTeam;
      const statsPrefix = side;

      const activeRoster = activeTeam.roster.filter(
        (p) => !statsMap.get(`${statsPrefix}-${p.name}`)?.injured
      );
      if (activeRoster.length === 0) return this.next();

      const player = pick(activeRoster);
      const pKey = `${statsPrefix}-${player.name}`;
      const pStats = statsMap.get(pKey)!;

      const isBurst = burstRemaining > 0;
      if (isBurst) burstRemaining--;

      // ─── Event type selection (identical branching to generateGameEvents) ────
      const roll = Math.random();
      let eventType: GameEventType;
      let points = 0;
      let description = "";
      let statType: GameEvent["statType"] = undefined;

      if (roll < 0.33) {
        // Scoring (33%)
        const sr = Math.random();
        if (sr < 0.35) {
          eventType = "score_2pt"; points = 2;
          description = pick([
            `${player.name} hits a mid-range jumper!`,
            `${player.name} converts the tough floater!`,
            `${player.name} rises up for the pull-up mid-range — good!`,
          ]);
        } else if (sr < 0.60) {
          eventType = "score_3pt"; points = 3;
          description = pick([
            `${player.name} buries the corner three — ${activeTeam.name} extends the lead!`,
            `${player.name} step-back three from the logo — ARE YOU KIDDING?!`,
            `${player.name} catches and fires — GOOD!`,
            `${player.name} off the screen, pulls up — BANG! Three-ball!`,
          ]);
        } else if (sr < 0.80) {
          eventType = "dunk"; points = 2;
          description = pick([
            `${player.name} bulldozes baseline and throws it DOWN!`,
            `${player.name} rises and finishes with AUTHORITY!`,
            `${player.name} posterizes the defender! That's going on the highlight reel!`,
          ]);
        } else {
          eventType = "layup"; points = 2;
          description = pick([
            `${player.name} with a beautiful layup.`,
            `${player.name} uses the glass — and it falls!`,
            `${player.name} splits the defense and lays it up softly!`,
          ]);
        }
        if (side === "home") { homeScore += points; homeMomentum += points === 3 ? 2 : 1; }
        else { awayScore += points; awayMomentum += points === 3 ? 2 : 1; }
        pStats.points += points;

      } else if (roll < 0.51) {
        // Defense (18%)
        const dr = Math.random();
        if (dr < 0.35) {
          eventType = "block"; statType = "block";
          description = pick([
            `${player.name} rises up and STUFFS the shot!`,
            `${player.name} sends it into the stands!`,
            `DENIED! ${player.name} with the emphatic block!`,
          ]);
          pStats.blocks++;
        } else if (dr < 0.65) {
          eventType = "steal"; statType = "steal";
          description = pick([
            `${player.name} reaches in and strips the ball!`,
            `${player.name} tips the pass — turnover!`,
            `${player.name} read the play perfectly — clean steal!`,
            `${player.name} pickpockets the drive!`,
          ]);
          pStats.steals++;
        } else {
          eventType = "rebound"; statType = "rebound";
          const isOffensive = Math.random() < 0.35;
          description = isOffensive
            ? pick([
                `${player.name} crashes the glass for the offensive board!`,
                `${player.name} tips it back in for the put-back opportunity!`,
              ])
            : pick([
                `${player.name} secures the defensive board and pushes the pace!`,
                `${player.name} grabs the rebound — possession change!`,
              ]);
          pStats.rebounds++;
        }
        if (side === "home") { homeMomentum += 0.5; awayMomentum = Math.max(0, awayMomentum - 0.3); }
        else { awayMomentum += 0.5; homeMomentum = Math.max(0, homeMomentum - 0.3); }

      } else if (roll < 0.60) {
        // Assists (9%)
        eventType = "assist"; statType = "assist";
        const otherPlayers = activeRoster.filter(p => p.name !== player.name);
        if (otherPlayers.length > 0) {
          const scorer = pick(otherPlayers);
          description = pick([
            `${player.name} threads the needle to ${scorer.name} cutting to the rim!`,
            `${player.name} fires the skip pass — ${scorer.name} is wide open!`,
            `${player.name} with the no-look dime to ${scorer.name}!`,
            `Beautiful ball movement — ${player.name} finds ${scorer.name} for the bucket!`,
          ]);
        } else {
          description = `${player.name} with a beautiful pass!`;
        }
        pStats.assists++;

      } else if (roll < 0.67) {
        // Fouls (7%)
        eventType = "foul"; statType = "foul";
        if (pStats.fouls >= 5) {
          eventType = "foul_out";
          description = `${player.name} has fouled out! ${activeTeam.name} is playing shorthanded.`;
          pStats.fouls++;
          pStats.injured = true;
        } else if (gameSec > GAME_DURATION * 0.95 && (side === "home" ? awayScore - homeScore : homeScore - awayScore) >= 5) {
          description = `Intentional foul by ${player.name} — ${activeTeam.name} trying to stop the clock. (${pStats.fouls + 1}/6)`;
          pStats.fouls++;
        } else {
          pStats.fouls++;
          description = `${player.name} commits a personal foul. (${pStats.fouls}/6)`;
        }
        if (side === "home") homeMomentum = Math.max(0, homeMomentum - 1);
        else awayMomentum = Math.max(0, awayMomentum - 1);

      } else if (roll < 0.77) {
        // Special events (10%)
        const sp = Math.random();
        if (sp < 0.20) {
          if (gameSec > GAME_DURATION * 0.9 && Math.abs(homeScore - awayScore) <= 8) {
            eventType = "clutch";
            points = Math.random() < 0.4 ? 3 : 2;
            const clock = gameSecToClock(gameSec);
            description = pick([
              `${player.name} in the CLUTCH — hits the tough shot with ${clock} left!`,
              `${player.name} draws the foul — and-1 opportunity! The crowd goes WILD!`,
            ]);
            if (side === "home") { homeScore += points; homeMomentum += 5; }
            else { awayScore += points; awayMomentum += 5; }
            pStats.points += points;
          } else {
            eventType = "rebound"; statType = "rebound";
            description = `${player.name} rebounds.`;
            pStats.rebounds++;
          }
        } else if (sp < 0.40) {
          eventType = "hot_hand";
          description = `${player.name} is heating up! Can't miss!`;
          if (side === "home") homeMomentum += 3; else awayMomentum += 3;
        } else if (sp < 0.55) {
          eventType = "cold_streak";
          description = `${player.name} can't get bucket right now...`;
          if (side === "home") homeMomentum = Math.max(0, homeMomentum - 2);
          else awayMomentum = Math.max(0, awayMomentum - 2);
        } else if (sp < 0.70) {
          eventType = "type_advantage";
          const oppTeam = side === "home" ? awayTeam : homeTeam;
          const matchup = pick(oppTeam.roster);
          description = `${player.name}'s ${player.types[0]} typing exploits ${matchup.name}'s weakness!`;
          if (side === "home") homeMomentum += 1.5; else awayMomentum += 1.5;
        } else if (sp < 0.83) {
          eventType = "ability_trigger";
          const abilityName = player.ability || "Pressure";
          const abilityInfo = (abilitiesData as Record<string, { "effect desc"?: string }>)[abilityName];
          const effectDesc = abilityInfo?.["effect desc"];
          description = effectDesc
            ? `${player.name}'s ${abilityName} activates — ${effectDesc}`
            : `${player.name}'s ability "${abilityName}" activates!`;
          if (side === "home") homeMomentum += 2; else awayMomentum += 2;
        } else if (sp < 0.92) {
          eventType = "rivalry_clash";
          const oppTeam = side === "home" ? awayTeam : homeTeam;
          const rival = player.rivals?.find(r => oppTeam.roster.some(o => o.name === r));
          if (rival) {
            description = `Rivalry intensity! ${player.name} locks in against ${rival}!`;
            if (side === "home") homeMomentum += 2; else awayMomentum += 2;
          } else {
            eventType = "momentum";
            description = `${activeTeam.name} building momentum!`;
            if (side === "home") homeMomentum += 1; else awayMomentum += 1;
          }
        } else {
          eventType = "ally_boost";
          const ally = player.allies?.find(a => activeTeam.roster.some(o => o.name === a));
          if (ally) {
            description = `${player.name} and ${ally} find eachother for the bucket`;
            if (side === "home") homeMomentum += 1.5; else awayMomentum += 1.5;
          } else {
            eventType = "momentum";
            description = `Great chemistry from ${activeTeam.name}!`;
            if (side === "home") homeMomentum += 1; else awayMomentum += 1;
          }
        }

      } else if (roll < 0.92) {
        // Momentum / narrative (15%)
        eventType = "momentum";
        const opponent = side === "home" ? awayTeam : homeTeam;
        const narratives = [
          `${activeTeam.name} on a run — ${opponent.name} calls timeout!`,
          `The energy is electric — ${activeTeam.name} feeding off the crowd!`,
          `Great ball movement from ${activeTeam.name} — defense can't keep up!`,
          `Coach ${activeTeam.name} calls a timeout to regroup.`,
          `${player.name} firing up the sideline!`,
          `${activeTeam.name} defense is suffocating right now!`,
          `${player.name} is locked in — watch out!`,
        ];
        description = pick(narratives);
        if (side === "home") { homeMomentum += 1.5; awayMomentum = Math.max(0, awayMomentum - 0.5); }
        else { awayMomentum += 1.5; homeMomentum = Math.max(0, homeMomentum - 0.5); }

      } else {
        // Injury / fatigue (8%)
        const injuryChance = side === "home" ? hFactors.foulOutInjuryChance : aFactors.foulOutInjuryChance;
        if (Math.random() < injuryChance) {
          eventType = "injury";
          description = `${player.name} goes down with an injury! Trainer rushes out.`;
          pStats.injured = true;
          if (side === "home") homeMomentum -= 2; else awayMomentum -= 2;
        } else {
          eventType = "fatigue";
          description = `${player.name} looks gassed.`;
          if (side === "home") homeMomentum -= 0.5; else awayMomentum -= 0.5;
        }
      }

      // Decay momentum
      homeMomentum *= 0.97;
      awayMomentum *= 0.97;

      // Burst tracking
      if (eventType === "steal") {
        burstRemaining = 2;
        consecutiveScoringEvents = 0;
      } else if (eventType === "block") {
        burstRemaining = Math.floor(rand(2, 4));
        consecutiveScoringEvents = 0;
      } else if (["score_2pt", "score_3pt", "dunk", "layup", "clutch"].includes(eventType)) {
        consecutiveScoringEvents++;
        if (consecutiveScoringEvents >= 3) {
          burstRemaining = 2;
          consecutiveScoringEvents = 0;
        }
      } else {
        consecutiveScoringEvents = 0;
      }

      return makeEvent(eventType, side, player.name, description, gameSec, {
        pointsScored: points || undefined,
        statType,
        pokemonSprite: player.sprite,
      }, isBurst);
    },
  };
}

// Suppress unused import warnings — these are used for parity with tournamentEngine
void calcTypeAdvantage;
void computeAbilityModifier;
