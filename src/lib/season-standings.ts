export interface TeamRecord {
  userId: string;
  teamName: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface PlayoffMatchup {
  matchupIndex: number;
  team1UserId: string;
  team1Name: string;
  team2UserId: string;
  team2Name: string;
}

/**
 * Simple deterministic hash of a string → integer.
 * Used to seed the final tiebreaker so ordering is reproducible per season.
 */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

/**
 * Sort teams by:
 * 1. wins DESC
 * 2. point differential (pointsFor - pointsAgainst) DESC
 * 3. pointsFor DESC
 * 4. deterministic seeded random per seasonId (reproducible across calls)
 */
export function computeStandings(teams: TeamRecord[], seasonId: string): TeamRecord[] {
  const tiebreakKey = (userId: string) => hashString(`${seasonId}:${userId}`);
  return [...teams].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const diffA = a.pointsFor - a.pointsAgainst;
    const diffB = b.pointsFor - b.pointsAgainst;
    if (diffB !== diffA) return diffB - diffA;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    return tiebreakKey(a.userId) - tiebreakKey(b.userId);
  });
}

/**
 * Take the top 8 from sorted standings and produce 4 quarterfinal matchups.
 * Seeding: 1v8, 2v7, 3v6, 4v5
 */
export function seedPlayoffBracket(sortedStandings: TeamRecord[]): PlayoffMatchup[] {
  if (sortedStandings.length < 8) {
    throw new Error("Need at least 8 teams to seed a playoff bracket");
  }
  const top8 = sortedStandings.slice(0, 8);
  return [
    { matchupIndex: 0, team1UserId: top8[0].userId, team1Name: top8[0].teamName, team2UserId: top8[7].userId, team2Name: top8[7].teamName },
    { matchupIndex: 1, team1UserId: top8[1].userId, team1Name: top8[1].teamName, team2UserId: top8[6].userId, team2Name: top8[6].teamName },
    { matchupIndex: 2, team1UserId: top8[2].userId, team1Name: top8[2].teamName, team2UserId: top8[5].userId, team2Name: top8[5].teamName },
    { matchupIndex: 3, team1UserId: top8[3].userId, team1Name: top8[3].teamName, team2UserId: top8[4].userId, team2Name: top8[4].teamName },
  ];
}
