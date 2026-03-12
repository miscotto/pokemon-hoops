import Link from "next/link";
import { getAllTournaments } from "@/lib/tournament-db";
import { ThemeToggle } from "@/app/components/ui";

export const revalidate = 30;

type FilterTab = "all" | "waiting" | "active" | "completed";

const STATUS_LABEL: Record<string, string> = {
  waiting: "⏳ WAITING",
  active: "⚡ ACTIVE",
  completed: "✅ DONE",
};

const STATUS_COLOR: Record<string, string> = {
  waiting: "var(--color-primary)",
  active: "#60ff60",
  completed: "var(--color-text-muted)",
};

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "all" } = await searchParams;
  const currentFilter = (["all", "waiting", "active", "completed"].includes(filter)
    ? filter
    : "all") as FilterTab;

  const all = await getAllTournaments(100);
  const tournaments =
    currentFilter === "all" ? all : all.filter((t) => t.status === currentFilter);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-bg)" }}>
      <header
        className="sticky top-0 z-50 border-b-3 border-[var(--color-shadow)] px-4 py-3"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="font-pixel text-[10px]" style={{ color: "var(--color-primary-text)" }}>
            ⚡ POKEMON HOOPS
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="font-pixel text-[7px]" style={{ color: "var(--color-primary-text)" }}>
              MY ROSTER
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="font-pixel text-[11px] mb-6" style={{ color: "var(--color-text)" }}>
          ALL TOURNAMENTS
        </h1>

        <div className="flex gap-2 mb-6 flex-wrap">
          {(["all", "waiting", "active", "completed"] as const).map((tab) => (
            <Link
              key={tab}
              href={`/tournaments?filter=${tab}`}
              className="font-pixel text-[6px] px-3 py-1.5 border-2"
              style={{
                borderColor: currentFilter === tab ? "var(--color-primary)" : "var(--color-border)",
                backgroundColor: currentFilter === tab ? "var(--color-primary)" : "var(--color-surface)",
                color: currentFilter === tab ? "var(--color-primary-text)" : "var(--color-text)",
                boxShadow: currentFilter === tab ? "2px 2px 0 var(--color-shadow)" : "none",
              }}
            >
              {tab.toUpperCase()}
            </Link>
          ))}
        </div>

        {tournaments.length === 0 ? (
          <div className="text-center py-20">
            <p className="font-pixel text-[8px] mb-2" style={{ color: "var(--color-text)" }}>
              NO TOURNAMENTS
            </p>
            <p className="font-pixel text-[6px]" style={{ color: "var(--color-text-muted)" }}>
              CHECK BACK LATER
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tournaments.map((t) => (
              <div
                key={t.id}
                className="border-3 p-4 flex items-center justify-between"
                style={{
                  borderColor:
                    t.status === "active"
                      ? "#60ff60"
                      : t.status === "waiting"
                      ? "var(--color-primary)"
                      : "var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                  boxShadow: "3px 3px 0 var(--color-shadow)",
                }}
              >
                <div>
                  <div
                    className="font-pixel text-[5px] mb-1"
                    style={{ color: STATUS_COLOR[t.status] ?? "var(--color-text-muted)" }}
                  >
                    {STATUS_LABEL[t.status] ?? t.status.toUpperCase()}
                  </div>
                  <p className="font-pixel text-[8px]" style={{ color: "var(--color-text)" }}>
                    {t.name.toUpperCase()}
                  </p>
                  <p className="font-pixel text-[5px] mt-1" style={{ color: "var(--color-text-muted)" }}>
                    {t.team_count}/{t.max_teams} TEAMS
                    {t.status === "completed" && t.winner_name
                      ? ` · 🏆 ${t.winner_name.toUpperCase()}`
                      : ""}
                  </p>
                </div>
                <Link
                  href={`/tournaments/${t.id}`}
                  className="font-pixel text-[6px] px-3 py-2 border-2 border-[var(--color-shadow)] shrink-0"
                  style={{
                    backgroundColor:
                      t.status === "waiting" ? "var(--color-primary)" : "var(--color-surface-alt)",
                    color:
                      t.status === "waiting" ? "var(--color-primary-text)" : "var(--color-text)",
                  }}
                >
                  {t.status === "waiting" ? "JOIN →" : t.status === "active" ? "WATCH →" : "RESULTS →"}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
