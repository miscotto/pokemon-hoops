import Link from "next/link";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSeasons } from "@/lib/season-db";

export default async function SeasonsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/");

  const allSeasons = await getSeasons(50);

  const statusLabel: Record<string, string> = {
    registration: "Open",
    active: "Regular Season",
    playoffs: "Playoffs",
    completed: "Completed",
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Seasons</h1>
      {allSeasons.length === 0 && (
        <p className="text-gray-500">No seasons yet. Check back soon!</p>
      )}
      <div className="flex flex-col gap-4">
        {allSeasons.map((s) => (
          <Link
            key={s.id}
            href={`/seasons/${s.id}`}
            className="block border rounded-lg p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-lg">{s.name}</span>
              <span className="text-sm px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                {statusLabel[s.status] ?? s.status}
              </span>
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {s.teamCount} / {s.maxTeams} teams &middot; Reg. season:{" "}
              {new Date(s.regularSeasonStart).toLocaleDateString()} –{" "}
              {new Date(s.regularSeasonEnd).toLocaleDateString()}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
