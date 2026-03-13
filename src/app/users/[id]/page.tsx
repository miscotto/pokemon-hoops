import { notFound } from "next/navigation";
import Link from "next/link";
import { ThemeToggle } from "@/app/components/ui";
import { neon } from "@neondatabase/serverless";
import { dbHttp } from "@/lib/db-http";
import { rosters, rosterPokemon, liveTournamentTeams, liveTournaments } from "@/lib/schema";
import { eq, and, asc, desc } from "drizzle-orm";

interface TournamentHistoryEntry {
  tournamentId: string;
  tournamentName: string;
  result: string | null;
  roundReached: number | null;
  joinedAt: string;
}

interface PokemonSlot {
  slotPosition: number;
  slotLabel: string;
  pokemonId: number;
  pokemonName: string;
  pokemonSprite: string | null;
  pokemonTypes: string[];
}

interface UserProfileData {
  user: { id: string; name: string; createdAt: string };
  stats: { played: number; wins: number; losses: number; winRate: number };
  tournamentRoster: {
    id: string;
    name: string;
    city: string;
    pokemon: PokemonSlot[];
  } | null;
  tournamentHistory: TournamentHistoryEntry[];
}

function resultBadge(result: string | null): { label: string; color: string } {
  switch (result) {
    case "champion":
      return { label: "🏆 CHAMPION", color: "#ffd700" };
    case "finalist":
      return { label: "🥈 FINALIST", color: "#c0c0c0" };
    case "in_progress":
      return { label: "⚡ IN PROGRESS", color: "var(--color-primary)" };
    case "waiting":
      return { label: "⏳ WAITING", color: "var(--color-text-muted)" };
    case "eliminated":
      return { label: "💀 ELIMINATED", color: "var(--color-danger)" };
    default:
      return { label: "—", color: "var(--color-text-muted)" };
  }
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const httpSql = neon(process.env.DATABASE_URL!);
  const userRows = await httpSql`SELECT id, name, "createdAt" FROM "user" WHERE id = ${id} LIMIT 1`;
  const userRow = userRows[0] as { id: string; name: string; createdAt: string } | undefined;
  if (!userRow) notFound();

  const historyRows = await dbHttp
    .select({
      tournament_id: liveTournamentTeams.tournamentId,
      tournament_name: liveTournaments.name,
      result: liveTournamentTeams.result,
      round_reached: liveTournamentTeams.roundReached,
      joined_at: liveTournamentTeams.joinedAt,
    })
    .from(liveTournamentTeams)
    .innerJoin(liveTournaments, eq(liveTournamentTeams.tournamentId, liveTournaments.id))
    .where(eq(liveTournamentTeams.userId, id))
    .orderBy(desc(liveTournamentTeams.joinedAt));

  const played = historyRows.length;
  const wins = historyRows.filter((h) => h.result === "champion").length;
  const losses = historyRows.filter((h) => h.result === "eliminated" || h.result === "finalist").length;
  const winRate = played > 0 ? Math.round((wins / played) * 100) : 0;

  const rosterRows = await dbHttp
    .select({ id: rosters.id, name: rosters.name, city: rosters.city })
    .from(rosters)
    .where(and(eq(rosters.userId, id), eq(rosters.isTournamentRoster, true)))
    .limit(1);

  let tournamentRoster: UserProfileData["tournamentRoster"] = null;
  if (rosterRows[0]) {
    const pokemon = await dbHttp
      .select()
      .from(rosterPokemon)
      .where(eq(rosterPokemon.rosterId, rosterRows[0].id))
      .orderBy(asc(rosterPokemon.slotPosition));
    tournamentRoster = {
      id: rosterRows[0].id,
      name: rosterRows[0].name,
      city: rosterRows[0].city,
      pokemon: pokemon.map((p) => ({
        slotPosition: p.slotPosition,
        slotLabel: p.slotLabel ?? "",
        pokemonId: p.pokemonId,
        pokemonName: p.pokemonName,
        pokemonSprite: p.pokemonSprite,
        pokemonTypes: (p.pokemonTypes as string[]) ?? [],
      })),
    };
  }

  const user: UserProfileData["user"] = { id: userRow.id, name: userRow.name, createdAt: userRow.createdAt };
  const stats: UserProfileData["stats"] = { played, wins, losses, winRate };
  const tournamentHistory: UserProfileData["tournamentHistory"] = historyRows.map((h) => ({
    tournamentId: h.tournament_id,
    tournamentName: h.tournament_name,
    result: h.result,
    roundReached: h.round_reached,
    joinedAt: h.joined_at ? (typeof h.joined_at === "string" ? h.joined_at : h.joined_at.toISOString()) : "",
  }));

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-bg)" }}>
      <header
        className="sticky top-0 z-50 border-b-3 border-[var(--color-shadow)] px-4 py-3"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="font-pixel text-[10px]" style={{ color: "var(--color-primary-text)" }}>
            ⚡ POKEMON HOOPS
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/tournaments" className="font-pixel text-[7px]" style={{ color: "var(--color-primary-text)" }}>
              TOURNAMENTS
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Profile header */}
        <div
          className="border-3 border-[var(--color-border)] p-5 mb-8"
          style={{ backgroundColor: "var(--color-surface)", boxShadow: "4px 4px 0 var(--color-shadow)" }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div>
              <h1 className="font-pixel text-[12px] mb-1" style={{ color: "var(--color-text)" }}>
                {user.name.toUpperCase()}
              </h1>
              <p className="font-pixel text-[5px]" style={{ color: "var(--color-text-muted)" }}>
                TRAINER SINCE{" "}
                {new Date(user.createdAt)
                  .toLocaleDateString("en-US", { month: "short", year: "numeric" })
                  .toUpperCase()}
              </p>
            </div>
            <div className="flex gap-4">
              {[
                { label: "PLAYED", value: stats.played, color: "var(--color-text)" },
                { label: "WINS", value: stats.wins, color: "#60ff60" },
                { label: "LOSSES", value: stats.losses, color: "var(--color-danger)" },
                { label: "WIN %", value: `${stats.winRate}%`, color: "var(--color-primary)" },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center">
                  <div className="font-pixel text-[12px]" style={{ color }}>
                    {value}
                  </div>
                  <div className="font-pixel text-[4px] mt-1" style={{ color: "var(--color-text-muted)" }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Tournament Roster */}
          <div>
            <h2 className="font-pixel text-[8px] mb-4" style={{ color: "var(--color-text)" }}>
              TOURNAMENT ROSTER
            </h2>
            {tournamentRoster ? (
              <div
                className="border-3 border-[var(--color-border)] p-4"
                style={{ backgroundColor: "var(--color-surface)", boxShadow: "3px 3px 0 var(--color-shadow)" }}
              >
                <p className="font-pixel text-[6px] mb-3" style={{ color: "var(--color-text-muted)" }}>
                  {tournamentRoster.city && `${tournamentRoster.city.toUpperCase()} `}
                  {tournamentRoster.name.toUpperCase()}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {tournamentRoster.pokemon.map((p) => (
                    <div
                      key={p.slotPosition}
                      className="border-2 border-[var(--color-border)] p-2 text-center"
                      style={{ backgroundColor: "var(--color-surface-alt)" }}
                    >
                      {p.pokemonSprite && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.pokemonSprite}
                          alt={p.pokemonName}
                          className="w-8 h-8 mx-auto"
                          style={{ imageRendering: "pixelated" }}
                        />
                      )}
                      <p
                        className="font-pixel text-[4px] mt-1 truncate"
                        style={{ color: "var(--color-text)" }}
                      >
                        {p.pokemonName.toUpperCase()}
                      </p>
                      <p className="font-pixel text-[4px]" style={{ color: "var(--color-text-muted)" }}>
                        {p.slotLabel}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="border-3 border-dashed border-[var(--color-border)] p-8 text-center">
                <p className="font-pixel text-[6px]" style={{ color: "var(--color-text-muted)" }}>
                  NO TOURNAMENT ROSTER SET
                </p>
              </div>
            )}
          </div>

          {/* Tournament History */}
          <div>
            <h2 className="font-pixel text-[8px] mb-4" style={{ color: "var(--color-text)" }}>
              TOURNAMENT HISTORY
            </h2>
            {tournamentHistory.length === 0 ? (
              <div className="border-3 border-dashed border-[var(--color-border)] p-8 text-center">
                <p className="font-pixel text-[6px]" style={{ color: "var(--color-text-muted)" }}>
                  NO TOURNAMENTS YET
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {tournamentHistory.map((h) => {
                  const badge = resultBadge(h.result);
                  return (
                    <Link
                      key={h.tournamentId}
                      href={`/tournaments/${h.tournamentId}`}
                      className="block border-3 p-3 hover:opacity-90 transition-opacity"
                      style={{
                        borderColor:
                          badge.color === "var(--color-danger)"
                            ? "var(--color-danger)"
                            : badge.color === "#ffd700"
                            ? "#ffd700"
                            : "var(--color-border)",
                        borderLeftWidth: "4px",
                        backgroundColor: "var(--color-surface)",
                        boxShadow: "2px 2px 0 var(--color-shadow)",
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className="font-pixel text-[6px] truncate"
                          style={{ color: "var(--color-text)" }}
                        >
                          {h.tournamentName.toUpperCase()}
                        </span>
                        <span
                          className="font-pixel text-[5px] shrink-0 ml-2"
                          style={{ color: badge.color }}
                        >
                          {badge.label}
                          {h.result === "eliminated" && h.roundReached
                            ? ` RD ${h.roundReached}`
                            : ""}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
