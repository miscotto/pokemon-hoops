import abilitiesData from "../../../public/abilities.json";

const SELF_BUFF_DELTA = 0.8;
const TEAM_BUFF_DELTA = 1.5;
const ENEMY_DEBUFF_DELTA = 0.8;
const ENEMY_TEAM_DEBUFF_DELTA = 1.5;
const MAX_BOOST = 5.0;
const MAX_PENALTY = 4.0;

/**
 * Computes the ability modifier for a team given their own abilities and the opponent's.
 * Positive contributions (own buffs) are capped at MAX_BOOST.
 * Negative contributions (opponent debuffs) are floored at -MAX_PENALTY.
 */
export function computeAbilityModifier(
  ownAbilities: string[],
  opponentAbilities: string[],
): number {
  let boost = 0;
  for (const ability of ownAbilities) {
    const edgeType = (abilitiesData as Record<string, { "edge type"?: string }>)[ability]?.["edge type"];
    if (edgeType === "self buff") boost += SELF_BUFF_DELTA;
    else if (edgeType === "team buff") boost += TEAM_BUFF_DELTA;
  }
  boost = Math.min(boost, MAX_BOOST);

  let penalty = 0;
  for (const ability of opponentAbilities) {
    const edgeType = (abilitiesData as Record<string, { "edge type"?: string }>)[ability]?.["edge type"];
    if (edgeType === "enemy debuff") penalty -= ENEMY_DEBUFF_DELTA;
    else if (edgeType === "enemy team debuff") penalty -= ENEMY_TEAM_DEBUFF_DELTA;
  }
  penalty = Math.max(penalty, -MAX_PENALTY);

  return boost + penalty;
}
