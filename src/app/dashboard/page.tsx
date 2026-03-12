"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import AuthForm from "../components/AuthForm";
import RosterDashboard from "../components/RosterDashboard";
import RosterBuilder from "../components/RosterBuilder";
import TournamentView from "../components/TournamentView";
import LiveTournament from "../components/LiveTournament";
import {
  TournamentTeam,
  toTournamentPokemon,
  Coast,
} from "../utils/tournamentEngine";

type View =
  | { type: "dashboard" }
  | { type: "builder"; rosterId: string; rosterName: string; rosterCity: string }
  | { type: "tournament" }
  | {
      type: "live-tournament";
      tournamentId: string;
      initialStatus: "waiting" | "active";
    };

// ─── Tournament Team Loader ───────────────────────────────────────────────

function TournamentWithLoader({ onBack }: { onBack: () => void }) {
  const [playerTeam, setPlayerTeam] = useState<TournamentTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadTournamentRoster() {
      try {
        const res = await fetch("/api/tournament/simulate", { method: "POST" });
        if (!res.ok) {
          throw new Error("Failed to load tournament roster");
        }

        const data = await res.json();

        if (data.error) {
          throw new Error(data.error);
        }

        if (!data.playerTeam) {
          throw new Error("Invalid response format from server");
        }

        const coast: Coast = Math.random() < 0.5 ? "west" : "east";
        const tournamentTeam: TournamentTeam = {
          id: data.playerTeam.id,
          name: `${data.playerTeam.name} (Player)`,
          coast,
          seed: 1,
          isPlayer: true,
          roster: data.playerTeam.roster.map(toTournamentPokemon),
        };

        setPlayerTeam(tournamentTeam);
      } catch (err) {
        console.error("Failed to load tournament roster:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    loadTournamentRoster();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--color-bg)" }}>
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
          <p className="font-pixel text-[7px] mt-3" style={{ color: "var(--color-text-muted)" }}>LOADING ROSTER...</p>
        </div>
      </div>
    );
  }

  if (error || !playerTeam) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--color-bg)" }}>
        <div className="text-center">
          <p className="font-pixel text-[8px] mb-3" style={{ color: "var(--color-danger)" }}>
            {error || "NO TOURNAMENT ROSTER FOUND"}
          </p>
          <button onClick={onBack} className="font-pixel text-[6px] underline" style={{ color: "var(--color-primary)" }}>
            BACK TO DASHBOARD
          </button>
        </div>
      </div>
    );
  }

  return <TournamentView onBack={onBack} playerTeam={playerTeam} />;
}

// ─── Live Tournament Loader ──────────────────────────────────────────────

interface TournamentOption {
  id: string;
  name: string;
  status: string;
  max_teams: number;
  team_count: number;
}

function LiveTournamentLoader({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<"checking" | "selecting" | "joining" | "joined">("checking");
  const [openTournaments, setOpenTournaments] = useState<TournamentOption[]>([]);
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [initialStatus, setInitialStatus] = useState<"waiting" | "active">("waiting");
  const [queuedTournament, setQueuedTournament] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function checkAndLoad() {
      try {
        // Check if already in a tournament
        const checkRes = await fetch("/api/live-tournaments");
        const checkData = await checkRes.json();

        if (checkData.tournamentId) {
          if (checkData.status === "active") {
            // Game is already running — go straight to it
            setTournamentId(checkData.tournamentId);
            setInitialStatus("active");
            setPhase("joined");
            return;
          }
          // Waiting for players — note the queued tournament but still show selection
          setQueuedTournament({ id: checkData.tournamentId, name: checkData.name ?? "Tournament" });
        }

        // Load open tournaments to choose from
        const availRes = await fetch("/api/live-tournaments?available=true");
        const availData = await availRes.json();
        setOpenTournaments(Array.isArray(availData) ? availData : []);
        setPhase("selecting");
      } catch {
        setError("Failed to load tournaments");
        setPhase("selecting");
      }
    }

    checkAndLoad();
  }, []);

  const handleJoin = async (selectedId: string) => {
    setPhase("joining");
    setError("");
    try {
      const res = await fetch("/api/live-tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: selectedId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTournamentId(data.tournamentId);
      setInitialStatus(data.status === "active" ? "active" : "waiting");
      setPhase("joined");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join tournament");
      setPhase("selecting");
    }
  };

  if (phase === "checking" || phase === "joining") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--color-bg)" }}>
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
          <p className="font-pixel text-[7px] mt-3" style={{ color: "var(--color-text-muted)" }}>
            {phase === "joining" ? "JOINING TOURNAMENT..." : "CHECKING STATUS..."}
          </p>
        </div>
      </div>
    );
  }

  if (phase === "selecting") {
    return (
      <div className="min-h-screen" style={{ backgroundColor: "var(--color-bg)" }}>
        <header className="sticky top-0 z-50 border-b-3 border-[var(--color-shadow)] px-4 py-3" style={{ backgroundColor: "var(--color-primary)" }}>
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <span className="font-pixel text-[10px]" style={{ color: "var(--color-primary-text)" }}>⚡ JOIN TOURNAMENT</span>
            <button onClick={onBack} className="font-pixel text-[6px]" style={{ color: "var(--color-primary-text)", opacity: 0.8 }}>← BACK</button>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
          {/* Already queued in a waiting lobby */}
          {queuedTournament && (
            <div
              className="border-3 border-[var(--color-primary)] p-4 flex items-center justify-between"
              style={{ backgroundColor: "var(--color-surface)", boxShadow: "3px 3px 0 var(--color-shadow)" }}
            >
              <div>
                <span className="font-pixel text-[5px] px-2 py-1 border border-[var(--color-shadow)]" style={{ backgroundColor: "var(--color-accent)", color: "var(--color-shadow)" }}>
                  ◉ ALREADY QUEUED
                </span>
                <p className="font-pixel text-[8px] mt-1" style={{ color: "var(--color-text)" }}>{queuedTournament.name.toUpperCase()}</p>
                <p className="font-pixel text-[6px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>YOU ARE IN THE WAITING LOBBY FOR THIS TOURNAMENT.</p>
              </div>
              <button
                onClick={() => { setTournamentId(queuedTournament.id); setInitialStatus("waiting"); setPhase("joined"); }}
                className="font-pixel text-[7px] px-4 py-2 border-2 border-[var(--color-shadow)] shrink-0"
                style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-text)" }}
              >
                VIEW LOBBY →
              </button>
            </div>
          )}

          {error && (
            <p className="font-pixel text-[6px]" style={{ color: "var(--color-danger)" }}>{error}</p>
          )}

          {openTournaments.length === 0 ? (
            <div className="text-center py-16">
              <p className="font-pixel text-[8px] mb-2" style={{ color: "var(--color-text)" }}>NO OPEN TOURNAMENTS</p>
              <p className="font-pixel text-[6px] mb-6" style={{ color: "var(--color-text-muted)" }}>ASK AN ADMIN TO CREATE ONE.</p>
              <button onClick={onBack} className="font-pixel text-[6px] underline" style={{ color: "var(--color-primary)" }}>← BACK TO DASHBOARD</button>
            </div>
          ) : (
            <>
              <h2 className="font-pixel text-[8px]" style={{ color: "var(--color-text)" }}>CHOOSE A TOURNAMENT</h2>
              <div className="space-y-3">
                {openTournaments.map((t) => (
                  <div
                    key={t.id}
                    className="border-3 border-[var(--color-border)] p-4 flex items-center justify-between"
                    style={{ backgroundColor: "var(--color-surface)", boxShadow: "3px 3px 0 var(--color-shadow)" }}
                  >
                    <div>
                      <p className="font-pixel text-[8px]" style={{ color: "var(--color-text)" }}>{t.name.toUpperCase()}</p>
                      <p className="font-pixel text-[6px] mt-1" style={{ color: "var(--color-text-muted)" }}>
                        {t.team_count}/{t.max_teams} TEAMS JOINED
                      </p>
                      <div className="mt-2 h-1.5 w-32 border border-[var(--color-shadow)]" style={{ backgroundColor: "var(--color-surface-alt)" }}>
                        <div
                          className="h-full"
                          style={{
                            width: `${(t.team_count / t.max_teams) * 100}%`,
                            backgroundColor: "var(--color-accent)",
                          }}
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => handleJoin(t.id)}
                      className="font-pixel text-[7px] px-4 py-2 border-2 border-[var(--color-shadow)]"
                      style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-text)" }}
                    >
                      JOIN →
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!tournamentId) return null;

  return (
    <LiveTournament
      tournamentId={tournamentId}
      initialStatus={initialStatus}
      onBack={onBack}
    />
  );
}

// ─── Dashboard Page ──────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: session, isPending } = useSession();
  const [view, setView] = useState<View>({ type: "dashboard" });
  const [dashboardKey, setDashboardKey] = useState(0);

  const goToDashboard = () => {
    setDashboardKey((k) => k + 1);
    setView({ type: "dashboard" });
  };

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm mt-3">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return <AuthForm />;
  }

  if (view.type === "tournament") {
    return <TournamentWithLoader onBack={goToDashboard} />;
  }

  if (view.type === "live-tournament") {
    return <LiveTournamentLoader onBack={goToDashboard} />;
  }

  if (view.type === "builder") {
    return (
      <RosterBuilder
        rosterId={view.rosterId}
        rosterName={view.rosterName}
        rosterCity={view.rosterCity}
        onBack={goToDashboard}
      />
    );
  }

  return (
    <RosterDashboard
      key={dashboardKey}
      userName={session.user.name || session.user.email}
      onEditRoster={(rosterId) => {
        fetch(`/api/rosters/${rosterId}`)
          .then((r) => r.json())
          .then((data) => {
            setView({
              type: "builder",
              rosterId,
              rosterName: data.name || "Unnamed Roster",
              rosterCity: data.city || "",
            });
          })
          .catch(() => {
            setView({
              type: "builder",
              rosterId,
              rosterName: "Unnamed Roster",
              rosterCity: "",
            });
          });
      }}
      onNewRoster={() => {}}
      onEnterTournament={() => setView({ type: "tournament" })}
      onJoinLiveTournament={() =>
        setView({
          type: "live-tournament",
          tournamentId: "",
          initialStatus: "waiting",
        })
      }
    />
  );
}
