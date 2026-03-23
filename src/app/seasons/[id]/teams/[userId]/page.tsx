import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSeason } from "@/lib/season-db";
import { getTeamSeasonStats } from "@/lib/season-stats";

export default async function TeamStatsPage({
  params,
}: {
  params: Promise<{ id: string; userId: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const { id: seasonId, userId } = await params;
  const [season, stats] = await Promise.all([
    getSeason(seasonId),
    getTeamSeasonStats(seasonId, userId),
  ]);

  if (!season || !stats) notFound();

  const pointDiff = stats.pointsFor - stats.pointsAgainst;
  const games = stats.wins + stats.losses;
  const ppgTeam = games > 0 ? Math.round((stats.pointsFor / games) * 10) / 10 : 0;
  const papg = games > 0 ? Math.round((stats.pointsAgainst / games) * 10) / 10 : 0;

  const resultLabel: Record<string, string> = {
    waiting: "Waiting",
    in_progress: "Active",
    did_not_qualify: "Did Not Qualify",
    eliminated: "Eliminated",
    finalist: "Finalist",
    champion: "Champion",
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500 space-x-2">
        <Link href="/seasons" className="hover:underline">Seasons</Link>
        <span>›</span>
        <Link href={`/seasons/${seasonId}`} className="hover:underline">{season.name}</Link>
        <span>›</span>
        <span className="text-gray-800 font-medium">{stats.teamName}</span>
      </div>

      {/* Team header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{stats.teamName}</h1>
          <p className="text-gray-500 text-sm mt-1">{season.name}</p>
        </div>
        <span className={`px-3 py-1 rounded text-sm font-medium ${stats.result === "champion" ? "bg-yellow-100 text-yellow-800" : stats.result === "finalist" ? "bg-blue-100 text-blue-800" : stats.result === "eliminated" || stats.result === "did_not_qualify" ? "bg-gray-100 text-gray-600" : "bg-green-100 text-green-700"}`}>
          {resultLabel[stats.result] ?? stats.result}
        </span>
      </div>

      {/* Team stats summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Record", value: `${stats.wins}–${stats.losses}` },
          { label: "Pt Diff", value: `${pointDiff > 0 ? "+" : ""}${pointDiff}` },
          { label: "PPG", value: ppgTeam.toString() },
          { label: "OPP PPG", value: papg.toString() },
        ].map(({ label, value }) => (
          <div key={label} className="border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Player stats table */}
      {stats.players.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Player Stats</h2>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2">Player</th>
                  <th className="text-center px-3 py-2">GP</th>
                  <th className="text-center px-3 py-2">PTS</th>
                  <th className="text-center px-3 py-2">PPG</th>
                  <th className="text-center px-3 py-2">REB</th>
                  <th className="text-center px-3 py-2">RPG</th>
                  <th className="text-center px-3 py-2">AST</th>
                  <th className="text-center px-3 py-2">APG</th>
                  <th className="text-center px-3 py-2">STL</th>
                  <th className="text-center px-3 py-2">BLK</th>
                  <th className="text-center px-3 py-2">FL</th>
                </tr>
              </thead>
              <tbody>
                {stats.players.map((p) => (
                  <tr key={p.name} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {p.sprite && <img src={p.sprite} alt="" className="w-6 h-6" />}
                        <span className="font-medium">{p.name}</span>
                      </div>
                    </td>
                    <td className="text-center px-3 py-2 text-gray-600">{p.games}</td>
                    <td className="text-center px-3 py-2 text-gray-600">{p.points}</td>
                    <td className="text-center px-3 py-2 font-medium">{p.ppg}</td>
                    <td className="text-center px-3 py-2 text-gray-600">{p.rebounds}</td>
                    <td className="text-center px-3 py-2 font-medium">{p.rpg}</td>
                    <td className="text-center px-3 py-2 text-gray-600">{p.assists}</td>
                    <td className="text-center px-3 py-2 font-medium">{p.apg}</td>
                    <td className="text-center px-3 py-2 text-gray-600">{p.steals}</td>
                    <td className="text-center px-3 py-2 text-gray-600">{p.blocks}</td>
                    <td className="text-center px-3 py-2 text-gray-600">{p.fouls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Game log */}
      {stats.gameLog.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Game Log</h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Opponent</th>
                  <th className="text-center px-3 py-2">Type</th>
                  <th className="text-center px-3 py-2">Result</th>
                  <th className="text-center px-3 py-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {stats.gameLog.map((g) => (
                  <tr key={g.gameId} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      {new Date(g.scheduledAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/seasons/${seasonId}/games/${g.gameId}`} className="hover:underline text-blue-600">
                        {g.opponent}
                      </Link>
                    </td>
                    <td className="text-center px-3 py-2 text-xs text-gray-500 capitalize">
                      {g.gameType === "playoff" ? `Playoff R${g.round}` : "Regular"}
                    </td>
                    <td className="text-center px-3 py-2">
                      <span className={`font-bold ${g.result === "W" ? "text-green-600" : "text-red-500"}`}>
                        {g.result}
                      </span>
                    </td>
                    <td className="text-center px-3 py-2 font-mono text-xs">
                      {g.teamScore}–{g.oppScore}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {stats.players.length === 0 && stats.gameLog.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-sm">No game data yet. Stats will appear once games are played.</p>
        </div>
      )}
    </div>
  );
}
