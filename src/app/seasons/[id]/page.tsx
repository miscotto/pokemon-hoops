import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSeason, getSeasonTeams, getSeasonGames, getUserSeasonTeam } from "@/lib/season-db";
import { computeStandings } from "@/lib/season-standings";

export default async function SeasonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const season = await getSeason(id);
  if (!season) notFound();

  const teams = await getSeasonTeams(id);
  const standings = computeStandings(
    teams.map((t) => ({
      userId: t.userId,
      teamName: t.teamName,
      wins: t.wins,
      losses: t.losses,
      pointsFor: t.pointsFor,
      pointsAgainst: t.pointsAgainst,
    })),
    id
  );

  const userTeam = await getUserSeasonTeam(id, session.user.id);
  const isAdmin = (session.user as { role?: string }).role === "admin";

  const recentGames = await getSeasonGames(id, { gameType: "regular" });
  const completedGames = recentGames.filter((g) => g.status === "completed").slice(-10).reverse();
  const playoffGames = (season.status === "playoffs" || season.status === "completed")
    ? await getSeasonGames(id, { gameType: "playoff" })
    : [];

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/seasons" className="text-sm text-gray-500 hover:underline">← Seasons</Link>
          <h1 className="text-2xl font-bold mt-1">{season.name}</h1>
          <Link href={`/seasons/${id}/schedule`} className="text-sm text-blue-600 hover:underline mt-1 inline-block">
            View Full Schedule →
          </Link>
          <p className="text-gray-500 text-sm capitalize">{season.status.replace("_", " ")}</p>
        </div>
        <div className="flex gap-2">
          {season.status === "registration" && !userTeam && !season.registrationClosedAt && (
            <form action={`/api/seasons/${id}/join`} method="POST">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                Join Season
              </button>
            </form>
          )}
          {season.status === "registration" && userTeam && !season.registrationClosedAt && (
            <>
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm font-medium">Joined</span>
              <form action={`/api/seasons/${id}/leave`} method="POST">
                <button type="submit" className="px-3 py-1 border border-red-200 text-red-600 rounded text-sm hover:bg-red-50">
                  Leave
                </button>
              </form>
            </>
          )}
          {isAdmin && season.status === "registration" && (
            <>
              {!season.registrationClosedAt && (
                <form action={`/api/seasons/${id}/close-registration`} method="POST">
                  <button type="submit" className="px-3 py-2 border rounded text-sm hover:bg-gray-50">
                    Close Registration
                  </button>
                </form>
              )}
              <form action={`/api/seasons/${id}/start`} method="POST">
                <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm">
                  Start Season
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Standings */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Standings</h2>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2">#</th>
                <th className="text-left px-4 py-2">Team</th>
                <th className="text-center px-3 py-2">W</th>
                <th className="text-center px-3 py-2">L</th>
                <th className="text-center px-3 py-2">+/-</th>
                <th className="text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((t, i) => (
                <tr key={t.userId} className={`border-b last:border-0 ${i < 8 && season.status !== "registration" ? "bg-blue-50/30" : ""}`}>
                  <td className="px-4 py-2 text-gray-500">{i + 1}</td>
                  <td className="px-4 py-2 font-medium">
                    <Link href={`/seasons/${id}/teams/${t.userId}`} className="hover:underline">
                      {t.teamName}
                    </Link>
                    {t.userId === session.user.id && <span className="ml-2 text-xs text-blue-600">(You)</span>}
                  </td>
                  <td className="text-center px-3 py-2">{t.wins}</td>
                  <td className="text-center px-3 py-2">{t.losses}</td>
                  <td className="text-center px-3 py-2">{t.pointsFor - t.pointsAgainst > 0 ? "+" : ""}{t.pointsFor - t.pointsAgainst}</td>
                  <td className="px-3 py-2 text-xs text-gray-500 capitalize">{teams.find((team) => team.userId === t.userId)?.result ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {season.status === "active" && <p className="text-xs text-gray-400 mt-1">Top 8 (blue) advance to playoffs</p>}
      </section>

      {/* Playoff bracket (if in playoffs) */}
      {playoffGames.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Playoffs</h2>
          <div className="flex flex-col gap-2">
            {playoffGames.map((g) => (
              <Link key={g.id} href={`/seasons/${id}/games/${g.id}`} className="flex items-center justify-between border rounded p-3 hover:bg-gray-50">
                <span className="text-sm">{g.team1Name} vs {g.team2Name}</span>
                <span className="text-sm font-mono">{g.status === "completed" ? `${g.team1Score}–${g.team2Score}` : g.status}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recent results */}
      {completedGames.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Recent Results</h2>
          <div className="flex flex-col gap-2">
            {completedGames.map((g) => (
              <Link key={g.id} href={`/seasons/${id}/games/${g.id}`} className="flex items-center justify-between border rounded p-3 hover:bg-gray-50">
                <span className="text-sm">{g.team1Name} vs {g.team2Name}</span>
                <span className="text-sm font-mono">{g.team1Score}–{g.team2Score}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
