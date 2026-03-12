"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import Link from "next/link";
import { PokeButton, ThemeToggle } from "@/app/components/ui";

interface MatchupState {
  gameId: string;
  round: number;
  matchupIndex: number;
  team1UserId: string;
  team1Name: string;
  team2UserId: string;
  team2Name: string;
  status: string;
  team1Score: number | null;
  team2Score: number | null;
  winnerId: string | null;
  playedAt: string | null;
}

interface TournamentState {
  id: string;
  name: string;
  status: string;
  maxTeams: number;
  totalRounds?: number;
  teamCount?: number;
  teams?: { teamName: string; userId: string; joinedAt: string }[];
  matchups?: MatchupState[];
  userTeamName?: string | null;
}

interface GameEvent {
  type: string;
  description: string;
  homeScore: number;
  awayScore: number;
}

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [tournament, setTournament] = useState<TournamentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playingGame, setPlayingGame] = useState<string | null>(null);
  const [gameEvents, setGameEvents] = useState<GameEvent[]>([]);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  const fetchTournament = useCallback(async () => {
    try {
      const res = await fetch(`/api/live-tournaments/${id}`);
      if (!res.ok) {
        setError("Tournament not found");
        return;
      }
      const data = await res.json();
      setTournament(data);
    } catch {
      setError("Failed to load tournament");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTournament();
  }, [fetchTournament]);

  useEffect(() => {
    if (tournament?.status !== "active") return;
    const interval = setInterval(fetchTournament, 5000);
    return () => clearInterval(interval);
  }, [tournament?.status, fetchTournament]);

  const handleJoin = async () => {
    try {
      const res = await fetch("/api/live-tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: id }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      await fetchTournament();
    } catch {
      setError("Failed to join tournament");
    }
  };

  const handlePlayGame = async (gameId: string) => {
    setPlayingGame(gameId);
    setActiveGameId(gameId);
    setGameEvents([]);
    try {
      const res = await fetch(`/api/live-tournaments/${id}/games/${gameId}`, { method: "POST" });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setGameEvents((data.events as GameEvent[]) ?? []);
      await fetchTournament();
    } catch {
      setError("Failed to play game");
    } finally {
      setPlayingGame(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--color-bg)" }}>
        <div
          className="inline-block w-8 h-8 border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--color-bg)" }}>
        <div className="text-center">
          <p className="font-pixel text-[8px] mb-4" style={{ color: "var(--color-danger)" }}>
            {error || "TOURNAMENT NOT FOUND"}
          </p>
          <Link href="/tournaments" className="font-pixel text-[6px] underline" style={{ color: "var(--color-primary)" }}>
            ← ALL TOURNAMENTS
          </Link>
        </div>
      </div>
    );
  }

  const rounds: Record<number, MatchupState[]> = {};
  for (const m of tournament.matchups ?? []) {
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  }

  const isParticipant = tournament.userTeamName != null;
  const canJoin = tournament.status === "waiting" && session?.user && !isParticipant;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-bg)" }}>
      <header
        className="sticky top-0 z-50 border-b-3 border-[var(--color-shadow)] px-4 py-3"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/tournaments"
              className="font-pixel text-[7px]"
              style={{ color: "var(--color-primary-text)", opacity: 0.8 }}
            >
              ← TOURNAMENTS
            </Link>
            <span className="font-pixel text-[9px]" style={{ color: "var(--color-primary-text)" }}>
              {tournament.name.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isParticipant && (
              <span
                className="font-pixel text-[5px] px-2 py-1"
                style={{ backgroundColor: "var(--color-accent)", color: "var(--color-shadow)" }}
              >
                ★ {tournament.userTeamName}
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {error && (
          <p className="font-pixel text-[6px] mb-4" style={{ color: "var(--color-danger)" }}>{error}</p>
        )}

        {/* WAITING LOBBY */}
        {tournament.status === "waiting" && (
          <div>
            <div className="font-pixel text-[8px] mb-2" style={{ color: "var(--color-primary)" }}>
              ⏳ WAITING FOR PLAYERS
            </div>
            <p className="font-pixel text-[6px] mb-6" style={{ color: "var(--color-text-muted)" }}>
              {tournament.teamCount}/{tournament.maxTeams} TEAMS JOINED
            </p>
            <div
              className="mb-6 h-2 border-2 border-[var(--color-shadow)]"
              style={{ backgroundColor: "var(--color-surface-alt)" }}
            >
              <div
                className="h-full"
                style={{
                  width: `${((tournament.teamCount ?? 0) / tournament.maxTeams) * 100}%`,
                  backgroundColor: "var(--color-primary)",
                }}
              />
            </div>

            {canJoin && (
              <PokeButton variant="primary" size="md" onClick={handleJoin} className="mb-6">
                ⚡ JOIN TOURNAMENT
              </PokeButton>
            )}
            {!session?.user && (
              <p className="font-pixel text-[6px] mb-6" style={{ color: "var(--color-text-muted)" }}>
                <Link href="/dashboard" className="underline" style={{ color: "var(--color-primary)" }}>
                  SIGN IN
                </Link>{" "}
                TO JOIN
              </p>
            )}

            <div className="space-y-2">
              {tournament.teams?.map((t, i) => (
                <div
                  key={i}
                  className="border-2 border-[var(--color-border)] p-3"
                  style={{ backgroundColor: "var(--color-surface)" }}
                >
                  <span className="font-pixel text-[7px]" style={{ color: "var(--color-text)" }}>
                    {t.teamName.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ACTIVE / COMPLETED BRACKET */}
        {(tournament.status === "active" || tournament.status === "completed") && (
          <div>
            {tournament.status === "completed" && (
              <div
                className="mb-8 text-center border-3 border-[var(--color-primary)] p-6"
                style={{ backgroundColor: "var(--color-surface)" }}
              >
                <div className="font-pixel text-[8px] mb-2" style={{ color: "var(--color-primary)" }}>
                  🏆 TOURNAMENT COMPLETE
                </div>
              </div>
            )}

            {Object.entries(rounds)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([round, matchups]) => (
                <div key={round} className="mb-8">
                  <h2 className="font-pixel text-[8px] mb-4" style={{ color: "var(--color-text-muted)" }}>
                    ROUND {round}
                    {Number(round) === tournament.totalRounds ? " — FINAL" : ""}
                  </h2>
                  <div className="space-y-3">
                    {matchups.map((m) => {
                      const canPlay =
                        m.status === "pending" &&
                        !!session?.user &&
                        tournament.status === "active";
                      return (
                        <div
                          key={m.gameId}
                          className="border-3 p-4"
                          style={{
                            borderColor:
                              m.status === "in_progress"
                                ? "#ffd700"
                                : "var(--color-border)",
                            backgroundColor: "var(--color-surface)",
                            boxShadow: "3px 3px 0 var(--color-shadow)",
                          }}
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span
                                  className="font-pixel text-[7px]"
                                  style={{
                                    color:
                                      m.winnerId === m.team1UserId
                                        ? "var(--color-primary)"
                                        : "var(--color-text)",
                                  }}
                                >
                                  {m.team1Name.toUpperCase()}
                                  {m.winnerId === m.team1UserId ? " 🏆" : ""}
                                </span>
                                {m.status === "completed" && (
                                  <span className="font-pixel text-[8px]" style={{ color: "var(--color-text)" }}>
                                    {m.team1Score}
                                  </span>
                                )}
                              </div>
                              <div className="my-1 border-t border-[var(--color-border)]" />
                              <div className="flex items-center justify-between">
                                <span
                                  className="font-pixel text-[7px]"
                                  style={{
                                    color:
                                      m.winnerId === m.team2UserId
                                        ? "var(--color-primary)"
                                        : "var(--color-text)",
                                  }}
                                >
                                  {m.team2Name.toUpperCase()}
                                  {m.winnerId === m.team2UserId ? " 🏆" : ""}
                                </span>
                                {m.status === "completed" && (
                                  <span className="font-pixel text-[8px]" style={{ color: "var(--color-text)" }}>
                                    {m.team2Score}
                                  </span>
                                )}
                              </div>
                            </div>

                            {canPlay && (
                              <PokeButton
                                variant="primary"
                                size="sm"
                                disabled={playingGame === m.gameId}
                                onClick={() => handlePlayGame(m.gameId)}
                              >
                                {playingGame === m.gameId ? "..." : "PLAY"}
                              </PokeButton>
                            )}

                            {m.status === "in_progress" && (
                              <span className="font-pixel text-[5px]" style={{ color: "#ffd700" }}>
                                LIVE
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

            {activeGameId && gameEvents.length > 0 && (
              <div
                className="mt-8 border-3 border-[var(--color-border)] p-4"
                style={{ backgroundColor: "var(--color-surface)" }}
              >
                <div className="font-pixel text-[7px] mb-3" style={{ color: "var(--color-primary)" }}>
                  GAME RECAP
                </div>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {gameEvents.slice(-20).map((e, i) => (
                    <p
                      key={i}
                      className="font-pixel text-[5px]"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      [{e.homeScore}-{e.awayScore}] {e.description}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
