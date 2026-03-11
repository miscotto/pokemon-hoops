"use client";

import { useState, useEffect, useCallback } from "react";
import { signOut } from "@/lib/auth-client";

interface RosterSummary {
  id: string;
  name: string;
  is_tournament_roster: boolean;
  pokemon_count: number;
  created_at: string;
  updated_at: string;
}

interface RosterDashboardProps {
  userName: string;
  onEditRoster: (rosterId: string) => void;
  onNewRoster: () => void;
  onEnterTournament: () => void;
  onJoinLiveTournament: () => void;
}

export default function RosterDashboard({
  userName,
  onEditRoster,
  onNewRoster,
  onEnterTournament,
  onJoinLiveTournament,
}: RosterDashboardProps) {
  const [rosters, setRosters] = useState<RosterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRosterName, setNewRosterName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState("");

  const fetchRosters = useCallback(async () => {
    try {
      const res = await fetch("/api/rosters");
      if (res.ok) {
        const data = await res.json();
        setRosters(data);
      }
    } catch {
      console.error("Failed to fetch rosters");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRosters();
  }, [fetchRosters]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRosterName.trim()) return;
    setCreating(true);
    setError("");

    try {
      const res = await fetch("/api/rosters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newRosterName.trim() }),
      });

      if (res.ok) {
        const roster = await res.json();
        setNewRosterName("");
        setShowCreateForm(false);
        onEditRoster(roster.id);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create roster");
      }
    } catch {
      setError("Failed to create roster");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete roster "${name}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/rosters/${id}`, { method: "DELETE" });
      if (res.ok) {
        setRosters((prev) => prev.filter((r) => r.id !== id));
      }
    } catch {
      console.error("Failed to delete roster");
    }
  };

  const handleSetTournament = async (id: string) => {
    try {
      const res = await fetch(`/api/rosters/${id}/tournament`, {
        method: "POST",
      });
      if (res.ok) {
        setRosters((prev) =>
          prev.map((r) => ({
            ...r,
            is_tournament_roster: r.id === id,
          })),
        );
      } else {
        const data = await res.json();
        alert(data.error || "Failed to set tournament roster");
      }
    } catch {
      console.error("Failed to set tournament roster");
    }
  };

  const handleUnsetTournament = async (id: string) => {
    try {
      const res = await fetch(`/api/rosters/${id}/tournament`, {
        method: "DELETE",
      });
      if (res.ok) {
        setRosters((prev) =>
          prev.map((r) => ({
            ...r,
            is_tournament_roster: r.id === id ? false : r.is_tournament_roster,
          })),
        );
      }
    } catch {
      console.error("Failed to unset tournament roster");
    }
  };

  const tournamentRoster = rosters.find((r) => r.is_tournament_roster);

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700/50 px-3 sm:px-4 py-2 sm:py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="text-2xl sm:text-3xl shrink-0">🏀</div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-black tracking-tight">
                Pokémon <span className="text-amber-400">Hoops</span>
              </h1>
              <p className="text-[11px] text-slate-400 -mt-0.5 truncate">
                Welcome back,{" "}
                <span className="text-amber-400 font-semibold">{userName}</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="text-xs text-slate-400 hover:text-slate-200 border border-slate-600 hover:border-slate-500 px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            Sign Out
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Tournament Roster Banner */}
        {tournamentRoster && (
          <div className="mb-6 sm:mb-8 p-4 sm:p-5 rounded-2xl bg-linear-to-r from-amber-400/10 via-orange-400/10 to-amber-400/10 border border-amber-400/30">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">🏆</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
                    Tournament Roster
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-white">
                  {tournamentRoster.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {tournamentRoster.pokemon_count}/6 Pokémon • This roster will
                  represent you in tournaments
                </p>
              </div>
              <div className="flex gap-2 shrink-0 flex-wrap">
                <button
                  onClick={onJoinLiveTournament}
                  className="text-xs bg-red-500 hover:bg-red-400 text-white font-bold px-4 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  🔴 Join Live
                </button>
                <button
                  onClick={onEnterTournament}
                  className="text-xs bg-amber-400 hover:bg-amber-300 text-slate-900 font-bold px-4 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  🏆 vs Bots
                </button>
                <button
                  onClick={() => onEditRoster(tournamentRoster.id)}
                  className="text-xs bg-amber-400/20 hover:bg-amber-400/30 text-amber-400 px-3 py-1.5 rounded-lg transition-colors cursor-pointer font-semibold"
                >
                  View
                </button>
                <button
                  onClick={() => handleUnsetTournament(tournamentRoster.id)}
                  className="text-xs text-slate-400 hover:text-slate-200 border border-slate-600 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  Unset
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Section Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold">Your Rosters</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {rosters.length} roster{rosters.length !== 1 ? "s" : ""} created
            </p>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-900 font-bold text-sm px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Roster
          </button>
        </div>

        {/* Create Roster Form */}
        {showCreateForm && (
          <div className="mb-6 p-4 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <form
              onSubmit={handleCreate}
              className="flex flex-col sm:flex-row gap-2 sm:gap-3"
            >
              <input
                type="text"
                value={newRosterName}
                onChange={(e) => setNewRosterName(e.target.value)}
                placeholder="Roster name (e.g. Fire Squad, Dream Team)"
                autoFocus
                className="flex-1 bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30 placeholder-slate-500"
              />
              <div className="flex gap-2 sm:gap-3">
                <button
                  type="submit"
                  disabled={creating || !newRosterName.trim()}
                  className="flex-1 sm:flex-none bg-amber-400 hover:bg-amber-300 text-slate-900 font-bold text-sm px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {creating ? "Creating..." : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewRosterName("");
                    setError("");
                  }}
                  className="text-slate-400 hover:text-slate-200 px-3 py-2.5 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
          </div>
        )}

        {/* Roster Grid */}
        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-sm mt-3">Loading rosters...</p>
          </div>
        ) : rosters.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-slate-700 rounded-2xl">
            <div className="text-5xl mb-3">🏀</div>
            <p className="text-lg font-bold text-slate-300">No rosters yet</p>
            <p className="text-sm text-slate-500 mt-1 mb-4">
              Create your first roster to start building your team
            </p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-amber-400 hover:bg-amber-300 text-slate-900 font-bold text-sm px-5 py-2.5 rounded-lg transition-colors cursor-pointer"
            >
              Create First Roster
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {rosters.map((roster) => (
              <div
                key={roster.id}
                className={`group relative rounded-xl border-2 p-4 transition-all hover:scale-[1.02] ${
                  roster.is_tournament_roster
                    ? "border-amber-400/50 bg-amber-400/5"
                    : "border-slate-700/50 bg-slate-800/40 hover:border-slate-600"
                }`}
              >
                {roster.is_tournament_roster && (
                  <div className="absolute -top-2 -right-2 bg-amber-400 text-slate-900 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                    🏆 Tournament
                  </div>
                )}

                <h3 className="font-bold text-sm truncate pr-6">
                  {roster.name}
                </h3>
                <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                  <span>
                    <span
                      className={`font-bold ${roster.pokemon_count === 6 ? "text-green-400" : "text-amber-400"}`}
                    >
                      {roster.pokemon_count}
                    </span>
                    /6 Pokémon
                  </span>
                  <span>•</span>
                  <span>
                    {new Date(roster.updated_at).toLocaleDateString()}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="mt-3 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      roster.pokemon_count === 6
                        ? "bg-green-400"
                        : "bg-amber-400"
                    }`}
                    style={{ width: `${(roster.pokemon_count / 6) * 100}%` }}
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => onEditRoster(roster.id)}
                    className="flex-1 text-xs bg-slate-700/60 hover:bg-slate-700 text-slate-200 py-2 rounded-lg transition-colors cursor-pointer font-semibold"
                  >
                    {roster.pokemon_count < 6 ? "Edit Roster" : "View Roster"}
                  </button>

                  {roster.pokemon_count === 6 &&
                    !roster.is_tournament_roster && (
                      <button
                        onClick={() => handleSetTournament(roster.id)}
                        className="text-xs bg-amber-400/20 hover:bg-amber-400/30 text-amber-400 px-3 py-2 rounded-lg transition-colors cursor-pointer font-semibold"
                        title="Use in tournament"
                      >
                        🏆
                      </button>
                    )}

                  <button
                    onClick={() => handleDelete(roster.id, roster.name)}
                    className="text-xs text-red-400/60 hover:text-red-400 hover:bg-red-400/10 px-2.5 py-2 rounded-lg transition-colors cursor-pointer"
                    title="Delete roster"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
