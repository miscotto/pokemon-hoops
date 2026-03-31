import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSeason, getSeasonTeams, getSeasonGamesFiltered } from "@/lib/season-db";
import ScheduleView from "./ScheduleView";

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const { id: seasonId } = await params;

  // Fetch season + teams + live games (limit 50 — also used as initial data if live tab)
  const [season, teams, liveGames] = await Promise.all([
    getSeason(seasonId),
    getSeasonTeams(seasonId),
    getSeasonGamesFiltered(seasonId, { status: "in_progress", limit: 50 }),
  ]);

  if (!season) notFound();

  const defaultTab = liveGames.length > 0 ? "live" : "upcoming";

  // Only fetch upcoming if that's the default tab (avoid extra DB call on live tab)
  const initialGames =
    defaultTab === "live"
      ? liveGames
      : await getSeasonGamesFiltered(seasonId, { status: "pending", limit: 50 });

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="text-sm text-gray-500 space-x-2">
        <Link href="/seasons" className="hover:underline">Seasons</Link>
        <span>›</span>
        <Link href={`/seasons/${seasonId}`} className="hover:underline">{season.name}</Link>
        <span>›</span>
        <span className="text-gray-800 font-medium">Schedule</span>
      </div>

      <h1 className="text-2xl font-bold">{season.name} — Schedule</h1>

      <ScheduleView
        seasonId={seasonId}
        teams={teams.map((t) => ({ userId: t.userId, teamName: t.teamName }))}
        defaultTab={defaultTab}
        initialGames={initialGames}
      />
    </div>
  );
}
