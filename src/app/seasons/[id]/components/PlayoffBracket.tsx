import Link from "next/link";

interface Series {
  id: string;
  round: number;
  matchupIndex: number;
  team1UserId: string;
  team1Name: string;
  team2UserId: string;
  team2Name: string;
  team1Wins: number;
  team2Wins: number;
  winnerId: string | null;
  status: string;
}

interface GameSummary {
  id: string;
  seriesId: string | null;
  gameNumberInSeries: number | null;
  team1Score: number | null;
  team2Score: number | null;
  status: string;
}

interface Props {
  seasonId: string;
  series: Series[];
  games: GameSummary[];
}

function seriesStatusLabel(s: Series): string {
  if (s.status === "completed") {
    const isTeam1 = s.team1Wins > s.team2Wins;
    const winnerName = isTeam1 ? s.team1Name : s.team2Name;
    return `${winnerName} wins ${Math.max(s.team1Wins, s.team2Wins)}–${Math.min(s.team1Wins, s.team2Wins)}`;
  }
  if (s.team1Wins === 0 && s.team2Wins === 0) return "Not started";
  if (s.team1Wins === s.team2Wins) return `Series tied ${s.team1Wins}–${s.team2Wins}`;
  const leadingName = s.team1Wins > s.team2Wins ? s.team1Name : s.team2Name;
  return `${leadingName} leads ${Math.max(s.team1Wins, s.team2Wins)}–${Math.min(s.team1Wins, s.team2Wins)}`;
}

function SeriesCard({ s, games, seasonId }: { s: Series; games: GameSummary[]; seasonId: string }) {
  const seriesGames = games
    .filter((g) => g.seriesId === s.id)
    .sort((a, b) => (a.gameNumberInSeries ?? 0) - (b.gameNumberInSeries ?? 0));

  const liveGame = seriesGames.find((g) => g.status === "in_progress");
  const lastCompleted = [...seriesGames].reverse().find((g) => g.status === "completed");
  const linkGame = liveGame ?? lastCompleted ?? seriesGames[0];

  const card = (
    <div className={`border rounded-lg p-3 space-y-2 transition-colors ${
      s.status === "completed" ? "bg-gray-50" : "bg-white hover:bg-blue-50/30"
    }`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium truncate">{s.team1Name}</span>
        <span className={`text-lg font-bold tabular-nums ml-2 ${
          s.team1Wins > s.team2Wins ? "text-blue-700" : "text-gray-400"
        }`}>{s.team1Wins}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium truncate">{s.team2Name}</span>
        <span className={`text-lg font-bold tabular-nums ml-2 ${
          s.team2Wins > s.team1Wins ? "text-blue-700" : "text-gray-400"
        }`}>{s.team2Wins}</span>
      </div>
      <div className="text-xs text-gray-500 pt-1 border-t">{seriesStatusLabel(s)}</div>
      {seriesGames.filter((g) => g.status === "completed").length > 0 && (
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer hover:text-gray-700">Game results</summary>
          <div className="mt-1 space-y-0.5 pl-2">
            {seriesGames
              .filter((g) => g.status === "completed")
              .map((g) => (
                <div key={g.id}>
                  Game {g.gameNumberInSeries}: {g.team1Score}–{g.team2Score}
                </div>
              ))}
          </div>
        </details>
      )}
    </div>
  );

  if (!linkGame) return card;
  return <Link href={`/seasons/${seasonId}/games/${linkGame.id}`}>{card}</Link>;
}

const ROUND_LABELS: Record<number, string> = {
  1: "Quarterfinals",
  2: "Semifinals",
  3: "Finals",
};

export default function PlayoffBracket({ seasonId, series, games }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {[1, 2, 3].map((round) => {
        const roundSeries = series.filter((s) => s.round === round);
        return (
          <div key={round} className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              {ROUND_LABELS[round]}
            </h3>
            {roundSeries.length === 0 ? (
              <div className="border rounded-lg p-4 text-center text-sm text-gray-300">TBD</div>
            ) : (
              roundSeries.map((s) => (
                <SeriesCard key={s.id} s={s} games={games} seasonId={seasonId} />
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
