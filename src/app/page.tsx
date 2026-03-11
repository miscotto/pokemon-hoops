"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import AuthForm from "./components/AuthForm";
import RosterDashboard from "./components/RosterDashboard";
import RosterBuilder from "./components/RosterBuilder";
import TournamentView from "./components/TournamentView";
import LiveTournament from "./components/LiveTournament";
import {
  TournamentTeam,
  toTournamentPokemon,
  Coast,
} from "./utils/tournamentEngine";

type View =
  | { type: "dashboard" }
  | { type: "builder"; rosterId: string; rosterName: string }
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
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-xl font-bold text-gray-800">
            Loading Tournament Roster...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl font-bold text-red-600 mb-4">Error</div>
          <div className="text-gray-700 mb-4">{error}</div>
          <button
            onClick={onBack}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!playerTeam) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl font-bold text-gray-800 mb-4">
            No Tournament Roster Found
          </div>
          <div className="text-gray-700 mb-4">
            Please set a tournament roster in your dashboard.
          </div>
          <button
            onClick={onBack}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return <TournamentView onBack={onBack} playerTeam={playerTeam} />;
}

// ─── Live Tournament Loader ──────────────────────────────────────────────

function LiveTournamentLoader({ onBack }: { onBack: () => void }) {
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [initialStatus, setInitialStatus] = useState<"waiting" | "active">(
    "waiting",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function joinOrResume() {
      try {
        // First check if already in a tournament
        const checkRes = await fetch("/api/live-tournaments");
        const checkData = await checkRes.json();

        if (checkData.tournamentId) {
          setTournamentId(checkData.tournamentId);
          setInitialStatus(
            checkData.status === "active" ? "active" : "waiting",
          );
          setLoading(false);
          return;
        }

        // Join/create tournament
        const res = await fetch("/api/live-tournaments", { method: "POST" });
        const data = await res.json();

        if (data.error) {
          throw new Error(data.error);
        }

        setTournamentId(data.tournamentId);
        setInitialStatus(data.status === "active" ? "active" : "waiting");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to join tournament",
        );
      } finally {
        setLoading(false);
      }
    }

    joinOrResume();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-400 mx-auto mb-4" />
          <div className="text-xl font-bold text-white">
            Joining Live Tournament...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl font-bold text-red-400 mb-4">Error</div>
          <div className="text-slate-300 mb-4">{error}</div>
          <button
            onClick={onBack}
            className="bg-amber-400 hover:bg-amber-300 text-slate-900 font-bold py-2 px-4 rounded-lg"
          >
            Back to Dashboard
          </button>
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

export default function Home() {
  const { data: session, isPending } = useSession();
  const [view, setView] = useState<View>({ type: "dashboard" });

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
    return (
      <TournamentWithLoader onBack={() => setView({ type: "dashboard" })} />
    );
  }

  if (view.type === "live-tournament") {
    return (
      <LiveTournamentLoader onBack={() => setView({ type: "dashboard" })} />
    );
  }

  if (view.type === "builder") {
    return (
      <RosterBuilder
        rosterId={view.rosterId}
        rosterName={view.rosterName}
        onBack={() => setView({ type: "dashboard" })}
      />
    );
  }

  return (
    <RosterDashboard
      userName={session.user.name || session.user.email}
      onEditRoster={(rosterId) => {
        fetch(`/api/rosters/${rosterId}`)
          .then((r) => r.json())
          .then((data) => {
            setView({
              type: "builder",
              rosterId,
              rosterName: data.name || "Unnamed Roster",
            });
          })
          .catch(() => {
            setView({
              type: "builder",
              rosterId,
              rosterName: "Unnamed Roster",
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
