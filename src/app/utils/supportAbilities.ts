// Support Pokemon Abilities — real Pokemon ability names that affect tournament simulation
// Each support Pokemon gets one ability based on their stat profile instead of a traditional playstyle

export interface SupportAbilityDef {
  name: string;
  description: string;
}

export const SUPPORT_ABILITIES: Record<string, SupportAbilityDef> = {
  "Intimidate": {
    name: "Intimidate",
    description: "Lowers the opposing team's offensive power",
  },
  "Quick Draw": {
    name: "Quick Draw",
    description: "Boosts team scoring speed and steal ability",
  },
  "Helping Hand": {
    name: "Helping Hand",
    description: "Provides an all-around boost to teammates",
  },
  "Friend Guard": {
    name: "Friend Guard",
    description: "Shields teammates, reducing opponent effectiveness",
  },
  "Regenerator": {
    name: "Regenerator",
    description: "Keeps teammates healthy, reducing injury risk",
  },
  "Telepathy": {
    name: "Telepathy",
    description: "Enhances team coordination and passing",
  },
  "Sturdy": {
    name: "Sturdy",
    description: "Prevents team fatigue in later rounds",
  },
  "Prankster": {
    name: "Prankster",
    description: "Disrupts opponents with steals and tricky plays",
  },
  "Screen Cleaner": {
    name: "Screen Cleaner",
    description: "Enhances team shot-blocking and interior defense",
  },
  "Aroma Veil": {
    name: "Aroma Veil",
    description: "Protects teammates from cold shooting streaks",
  },
  "Battery": {
    name: "Battery",
    description: "Supercharges team scoring output",
  },
  "Pressure": {
    name: "Pressure",
    description: "Wears down opponents, increasing their fatigue",
  },
};

/** Deterministically assign a support ability based on Pokemon's base stats */
export function getSupportAbility(
  id: number,
  stats: { hp: number; attack: number; defense: number; specialAttack: number; specialDefense: number; speed: number }
): string {
  const { hp, attack, defense, specialAttack, specialDefense, speed } = stats;
  const statValues = [hp, attack, defense, specialAttack, specialDefense, speed];
  const maxVal = Math.max(...statValues);
  const maxIdx = statValues.indexOf(maxVal);

  // Use pokemon ID parity to select between two abilities per dominant stat
  const variant = id % 2;

  switch (maxIdx) {
    case 0: // HP dominant
      return variant === 0 ? "Regenerator" : "Helping Hand";
    case 1: // Attack dominant
      return variant === 0 ? "Intimidate" : "Pressure";
    case 2: // Defense dominant
      return variant === 0 ? "Sturdy" : "Screen Cleaner";
    case 3: // SpAtk dominant
      return variant === 0 ? "Battery" : "Telepathy";
    case 4: // SpDef dominant
      return variant === 0 ? "Friend Guard" : "Aroma Veil";
    case 5: // Speed dominant
      return variant === 0 ? "Quick Draw" : "Prankster";
    default:
      return "Helping Hand";
  }
}

// ─── Tournament Effect Computation ──────────────────────────────────────────

export interface AbilityEffects {
  teamPowerPercent: number;        // % boost to own team power (additive)
  opponentPowerPercent: number;    // % reduction to opponent power (additive)
  injuryReduction: number;         // multiplier on injury chance (0-1, lower = fewer injuries)
  fatigueReduction: number;        // multiplier on own fatigue impact (0-1, lower = less fatigue)
  opponentFatigueIncrease: number; // multiplier on opponent fatigue (>1 = worse for them)
  coldStreakReduction: number;     // multiplier on cold streak chance (0-1, lower = fewer cold streaks)
}

/** Aggregate ability effects from a team's support Pokemon */
export function computeAbilityEffects(abilities: string[]): AbilityEffects {
  const effects: AbilityEffects = {
    teamPowerPercent: 0,
    opponentPowerPercent: 0,
    injuryReduction: 1,
    fatigueReduction: 1,
    opponentFatigueIncrease: 1,
    coldStreakReduction: 1,
  };

  for (const ability of abilities) {
    switch (ability) {
      case "Intimidate":
        effects.opponentPowerPercent += 0.03;
        break;
      case "Quick Draw":
        effects.teamPowerPercent += 0.025;
        break;
      case "Helping Hand":
        effects.teamPowerPercent += 0.015;
        break;
      case "Friend Guard":
        effects.opponentPowerPercent += 0.02;
        break;
      case "Regenerator":
        effects.injuryReduction *= 0.5;
        break;
      case "Telepathy":
        effects.teamPowerPercent += 0.02;
        break;
      case "Sturdy":
        effects.fatigueReduction *= 0.6;
        break;
      case "Prankster":
        effects.teamPowerPercent += 0.02;
        break;
      case "Screen Cleaner":
        effects.teamPowerPercent += 0.02;
        break;
      case "Aroma Veil":
        effects.coldStreakReduction *= 0.5;
        break;
      case "Battery":
        effects.teamPowerPercent += 0.03;
        break;
      case "Pressure":
        effects.opponentFatigueIncrease *= 1.4;
        break;
    }
  }

  // Cap stacking to prevent support-heavy teams from being OP
  effects.teamPowerPercent = Math.min(effects.teamPowerPercent, 0.08);
  effects.opponentPowerPercent = Math.min(effects.opponentPowerPercent, 0.06);

  return effects;
}

/** Penalty for having too many support Pokemon (more support than handlers) */
export function supportOverloadPenalty(supportCount: number): number {
  if (supportCount <= 3) return 0;     // 3 or fewer support: no penalty
  if (supportCount === 4) return -4;   // 4 support, 2 handlers: mild
  if (supportCount === 5) return -10;  // 5 support, 1 handler: significant
  return -18;                          // 6 support, 0 handlers: severe
}
