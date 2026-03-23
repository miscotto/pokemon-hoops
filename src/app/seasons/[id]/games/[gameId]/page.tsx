import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSeasonGame } from "@/lib/season-db";
import SeasonGameViewer from "./SeasonGameViewer";

export default async function SeasonGamePage({ params }: { params: Promise<{ id: string; gameId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const { id: seasonId, gameId } = await params;
  const game = await getSeasonGame(gameId);
  if (!game || game.seasonId !== seasonId) notFound();

  const streamUrl = `/api/seasons/${seasonId}/games/${gameId}/stream`;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Link href={`/seasons/${seasonId}`} className="text-sm text-gray-500 hover:underline">← Season</Link>
      <h1 className="text-xl font-bold mt-2 mb-6">
        {game.team1Name} vs {game.team2Name}
      </h1>
      <SeasonGameViewer
        gameId={gameId}
        team1Name={game.team1Name}
        team2Name={game.team2Name}
        initialStatus={game.status}
        initialTeam1Score={game.team1Score ?? 0}
        initialTeam2Score={game.team2Score ?? 0}
        streamUrl={streamUrl}
      />
    </div>
  );
}
