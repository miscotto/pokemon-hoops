export interface ScheduledGame {
  team1UserId: string;
  team1Name: string;
  team2UserId: string;
  team2Name: string;
  scheduledAt: Date;
  sweepNumber: number;
}

interface Team {
  userId: string;
  teamName: string;
}

/** Fisher-Yates shuffle — mutates array in place */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generate all regular-season games for a season.
 * Each unique pair plays 7 times (7 sweeps of C(n,2) pairs).
 * Games are distributed evenly between startDate and endDate.
 * Throws if teams.length < 2 or endDate <= startDate.
 */
export function generateSeasonSchedule(
  teams: Team[],
  startDate: Date,
  endDate: Date
): ScheduledGame[] {
  if (teams.length < 2) throw new Error("Need at least 2 teams to generate a schedule");
  if (endDate.getTime() <= startDate.getTime()) throw new Error("endDate must be after startDate");

  // Generate all unique pairs
  const pairs: [Team, Team][] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      pairs.push([teams[i], teams[j]]);
    }
  }

  // 7 sweeps, each sweep is a shuffled copy of all pairs
  const allGames: Omit<ScheduledGame, "scheduledAt">[] = [];
  for (let sweep = 1; sweep <= 7; sweep++) {
    const shuffledPairs = shuffle([...pairs]);
    for (const [t1, t2] of shuffledPairs) {
      allGames.push({
        team1UserId: t1.userId,
        team1Name: t1.teamName,
        team2UserId: t2.userId,
        team2Name: t2.teamName,
        sweepNumber: sweep,
      });
    }
  }

  // Distribute timestamps evenly across the half-open interval [startDate, endDate).
  // Game i lands at startDate + i * (totalMs / N), so the last game is strictly
  // before endDate (approximately one interval-width before it).
  const totalMs = endDate.getTime() - startDate.getTime();
  const interval = totalMs / allGames.length;

  return allGames.map((g, i) => ({
    ...g,
    scheduledAt: new Date(startDate.getTime() + i * interval),
  }));
}
